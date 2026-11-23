# Value objects in Java — records

What a value object is, and when a primitive deserves one, is on the TypeScript page ([../value-object.md](../value-object.md), the opening and § When NOT to make one). Its four house rules hold, and in Java a record delivers three of them by itself: it is **immutable**, it **compares by value**, and its methods are where **behavior** lives. The fourth, **born valid**, is the compact constructor below.

## The rule lives in the compact constructor: one door

A record's compact constructor runs on **every** `new`: the domain's, a test's, and Spring Data's when it builds the value from a row. The rule written there holds for every instance that will ever exist, and that is the industry's standard shape for a validated value: the Java language's own record specification (JEP 395) shows a range record that throws from its compact constructor.

```java
package com.example.shared.domain;

/** A share of a whole, 0 to 100. */
public record Percentage(int value) {
    public Percentage {
        if (value < 0 || value > 100) {
            throw new DomainException("percentage.out-of-range", "received " + value + ", expected 0 to 100");
        }
    }
}
```

The TypeScript side needs two doors, a private constructor that never validates and a `create` that returns `Result`, because TypeScript returns refusals. Java throws them ([domain-errors.md](domain-errors.md)), so the constructor is the door, and the one rule has one place.

- **A refusal is a `DomainException` with a code**, never an `IllegalArgumentException`: the advice must answer 422 with the code, not 500.
- **`null` is a programmer error, not a rule**: `Objects.requireNonNull` in the constructor. Bean Validation on the request turns a missing field into a 400 before it reaches the domain.

## Canonical example: `Money`

Integer minor units, currency attached, no floating point anywhere:

```java
package com.example.shared.domain;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * An amount in integer minor units (cents) with its currency. {@code long} makes a fractional
 * cent unrepresentable; there is no float anywhere.
 *
 * <pre>{@code
 * Money price = new Money(1050, CurrencyCode.BRL);                         // R$ 10,50
 * Money typed = Money.fromDecimal(new BigDecimal("10.50"), CurrencyCode.BRL); // same value
 * }</pre>
 */
public record Money(long cents, CurrencyCode currency) {
    // Runs on every `new Money(...)` - the domain's, a test's, and Spring Data's when it loads a row.
    public Money {
        Objects.requireNonNull(currency, "Money needs a currency, received null");
    }

    /**
     * The edge door: a decimal as the outside world speaks it (a form, a JSON body).
     *
     * @throws DomainException {@code money.sub-cent-precision} when the value has more than two decimals
     */
    public static Money fromDecimal(BigDecimal value, CurrencyCode currency) {
        BigDecimal cents = value.movePointRight(2);
        if (cents.stripTrailingZeros().scale() > 0) {
            throw new DomainException("money.sub-cent-precision", "received " + value.toPlainString()
                    + ", which does not fit " + currency + " cents - round it explicitly or use cents");
        }
        return new Money(cents.longValueExact(), currency);
    }

    /** @throws DomainException {@code money.currency-mismatch} when the currencies differ */
    public Money add(Money other) {
        if (other.currency != currency) {
            throw new DomainException("money.currency-mismatch", "cannot add " + other.currency + " to " + currency);
        }
        // addExact: an overflow is a bug and must fail loudly, never wrap around into a negative balance
        return new Money(Math.addExact(cents, other.cents), currency);
    }
}
```

(`CurrencyCode` is an enum beside it: `BRL, AOA, USD`.)

- **`long` does what a runtime check does in TypeScript.** A fractional cent cannot be stored in a `long`, so the "must be an integer" rule disappears into the type.
- **The edge door takes `BigDecimal`, never `double`.** A request record declares its amount as `BigDecimal`; a `double` has already lost the cent before any check could run.
- **Heavier arithmetic** (pro-rata splits, interest) uses `BigDecimal` with an explicit `RoundingMode` inside the value object or a domain service, and emerges holding a `Money`. `java.math` ships with the JDK, so the TypeScript caveat about third-party math libraries does not arise.

## Inside an aggregate: embedded columns

A value object held by an aggregate is stored in the aggregate's own table, one column per component, under a prefix:

```java
@Embedded.Nullable(prefix = "price_")
private Money price;              // columns price_cents, price_currency
```

`@Embedded.Nullable` reads all-null columns as a null field. A required value has `NOT NULL` columns, so it never comes back null.

## When the constructor runs on read

Spring Data builds every value object through its constructor, so **a stored value that breaks the rule fails the read**. The advice answers 500, because corrupt data is a bug (verified). In a greenfield project that is the "restore validates" mode, for free ([../entity-aggregate.md](../entity-aggregate.md) § The restore decision).

A legacy table holds rows written before the rule existed, and a constructor rule makes those rows **unreadable**: nobody can load them, even to fix them. For a rule that old rows break, move the check out of the constructor into a named factory that new code calls (`Percentage.of(int)`); keep in the constructor only what every stored row satisfies; and let the aggregate's `violations()` report the old rows ([entity-aggregate.md](entity-aggregate.md)).
