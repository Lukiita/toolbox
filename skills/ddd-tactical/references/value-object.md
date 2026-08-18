# Value Objects

A value object is a concept defined entirely by its value: two instances with the same parts are the same thing, and none of them ever changes — you replace, never mutate. Reach for one whenever a primitive starts carrying rules (an email that must parse, a percentage that must stay in range, money that must never be a float). The smell that demands it: the same validation of a primitive repeated at two call sites.

## The house rules

- **Immutable.** Every operation returns a new instance. Mutation on a shared value is action at a distance.
- **Born valid.** Same factory pattern as aggregates: `private constructor`, static `create` returning `Result`. There is no invalid `Money` in the system — the type is the proof.
- **Equality by value**, inherited from the `ValueObject` base ([base-classes.md](base-classes.md)).
- **Behavior lives on it.** `total.add(fee)`, not `addMoney(total, fee)` — the VO is where the arithmetic and the rules of the concept belong.

## Canonical example: `Money`

The AGENTS.md rule made concrete — integer minor units, currency attached, no floats anywhere:

The INTERNAL state is integer minor units, always — that invariant never softens. But the *conversion* from what the outside world speaks (forms send `10.50`, APIs send `"10.50"`) is the VO's responsibility, not the caller's: making every caller multiply by 100 scatters the conversion — and its bugs — across the codebase, which is exactly what a VO exists to centralize. So there are two named doors instead of one ambiguous `create(number)`: the name carries the unit (connascence of meaning resolved by connascence of name).

```ts
// shared/domain/money.vo.ts
import { Result } from './result';
import { DomainError } from './domain-error';
import { ValueObject } from './value-object';

interface MoneyProps extends Record<string, unknown> {
  /** Integer minor units (cents). Floats lose cents; lost cents are lost money. */
  readonly amount: number;
  readonly currency: 'BRL' | 'AOA' | 'USD';
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  /** The internal/persistence door: strict integer minor units. */
  public static fromCents(amount: number, currency: MoneyProps['currency']): Result<Money, DomainError> {
    if (!Number.isInteger(amount)) {
      return Result.fail(
        new DomainError('money.not-integer', `amount must be integer minor units, received ${amount}`),
      );
    }
    return Result.ok(new Money({ amount, currency }));
  }

  /**
   * The edge door: decimal as the outside world speaks it. String is the
   * safest input (no float ever existed); number is accepted because forms
   * and JSON deliver it - the rounding below erases float representation
   * noise, and the scale check refuses genuine sub-cent precision instead
   * of silently dropping money.
   */
  public static fromDecimal(
    value: number | string,
    currency: MoneyProps['currency'],
  ): Result<Money, DomainError> {
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(parsed)) {
      return Result.fail(new DomainError('money.not-a-number', `received ${JSON.stringify(value)}`));
    }
    const cents = Math.round(parsed * 100);
    // Float noise sits around 1e-13; real sub-cent precision (10.999) sits at
    // 0.1+. The gap between the two is wide - 1e-6 splits it safely.
    if (Math.abs(parsed * 100 - cents) > 1e-6) {
      return Result.fail(
        new DomainError(
          'money.sub-cent-precision',
          `received ${parsed}, which does not fit ${currency} cents - round it explicitly or use fromCents`,
        ),
      );
    }
    return Result.ok(new Money({ amount: cents, currency }));
  }

  public get amount(): number {
    return this.props.amount;
  }

  public get currency(): MoneyProps['currency'] {
    return this.props.currency;
  }

  public add(other: Money): Result<Money, DomainError> {
    if (other.currency !== this.currency) {
      return Result.fail(
        new DomainError(
          'money.currency-mismatch',
          `cannot add ${other.currency} to ${this.currency}`,
        ),
      );
    }
    return Result.ok(new Money({ amount: this.amount + other.amount, currency: this.currency }));
  }
}
```

Notice what the type just made unrepresentable: a float amount stored, a sum across currencies, a "money" with no currency, a silent loss of sub-cent precision. Every caller that receives a `Money` inherits those guarantees for free — that is the return on the ceremony.

**When the math itself gets heavy** — pro-rata splits, compound interest, chained percentages — integer cents plus `Math.round` stops being enough. Do that arithmetic with a decimal library (decimal.js, big.js) **inside** the VO or a domain service, and emerge holding a `Money`: pure computation libraries are welcome in the domain (see the import rule in SKILL.md), but their types never cross a public signature — `Money` in, `Money` out, `Decimal` never seen by callers. The VO itself is the thin interface AGENTS.md asks for.

## When NOT to make one

A primitive with no rule is fine as a primitive. `title: string` needs no `Title` VO until a rule appears (length, format, normalization). Wrapping everything "for consistency" is the logical-cohesion trap — ceremony without an invariant to protect.
