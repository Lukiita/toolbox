# Typed ids in Java — one record per concept

Every id is a typed id named `<Concept>Id`. With a bare `UUID` for every concept, `subscriptionId` and `planId` are one type and a swap compiles. A record per concept gives each concept its own type, and Java compares records **by value**: two `SubscriptionId`s holding the same UUID are `equals`, so `Set`, `Map` and `contains` work with nothing to unwrap. That is why Java has one recipe and no brand. The study behind the TypeScript default (`Lukiita/toolbox#4`) names the Java record as the language's own answer to the same problem.

## The recipe

```java
package com.example.subscription;

import com.example.shared.domain.TypedId;
import java.util.Objects;
import java.util.UUID;

/**
 * The subscription's identity. A record: two ids with the same UUID are equal, so {@code equals},
 * {@code Set} and {@code Map} work. Lives in the feature root - the feature's public API - because
 * other features may hold it.
 */
public record SubscriptionId(UUID value) implements TypedId<UUID> {
    public SubscriptionId {
        Objects.requireNonNull(value, "SubscriptionId needs a value, received null");
    }

    /** A new identity: this feature owns the concept, so it mints the value. */
    public static SubscriptionId create() {
        return new SubscriptionId(UUID.randomUUID());
    }
}
```

- **`create()` mints** a value, and only for an id this context owns.
- **The constructor names a value that already exists**: a path variable, a row, an event (`new SubscriptionId(uuid)`). A record's constructor is always public, and naming an existing value is all a `restore` door would do, so the id has none.
- **The id lives in the feature root package**, the feature's public API, because other features hold it (`Subscription` holds a `PlanId`).
- **An id minted by another context** (a payment provider's customer id) gets its own record with no `create()` and no format check: this context neither mints it nor owns its format.
  ```java
  public record CustomerId(String value) implements TypedId<String> { ... }
  ```
- **Format checks go in the compact constructor**, and only for an id this context mints whose malformed stored value must fail loudly.
- **A serial key** wraps a `Long`: `record LegacyOrderId(Long value) implements TypedId<Long>`.

## What the compiler refuses, and what it cannot see

Checked with `javac` 25:

| Written | Result |
|---|---|
| a `PlanId` passed where a `SubscriptionId` is expected | compile error: incompatible types |
| a raw `UUID` passed where a `SubscriptionId` is expected | compile error: incompatible types |
| `subscriptionId == planId` | compile error: incomparable types |
| an aggregate declared as `AggregateRoot<UUID>` | compile error: `UUID` is outside the `TypedId` bound |
| `subscriptionId.equals(planId)`, `subscriptionIds.contains(planId)` | compiles, always `false`: both take `Object` |
| `a == b` on two `SubscriptionId`s with the same value | compiles, `false`: `==` compares references. PMD's `CompareObjectsWithEquals` fails it ([layout.md](layout.md)) |

The last two rows are the price of the record. Compare ids with `equals`, always; a comparison across two concepts compiles and is quietly `false`, so name variables by concept and let the types carry it.

## Storing an id: one conversion per id

Spring Data JDBC reads a record-typed `@Id` as a **composite key**: one column per record component, so it looks for a column named `value`. A record-typed reference (`PlanId planId`) is read as an embedded entity and left out of the `INSERT`. Both were seen against PostgreSQL. A conversion fixes both, storing the id as its value in one column (`id`, `plan_id`):

```java
package com.example.shared.infra;

import com.example.shared.domain.TypedId;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import org.springframework.core.convert.TypeDescriptor;
import org.springframework.core.convert.converter.GenericConverter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;

/**
 * Stores one typed id as its value, in one column. Without it Spring Data JDBC reads a record
 * id as a composite key (it looks for a column named after the record component) and a
 * reference id as an embedded entity.
 *
 * <p>Each feature declares one bean per id it persists:
 * <pre>{@code
 * @Bean
 * TypedIdConversion<SubscriptionId, UUID> subscriptionIds() {
 *     return new TypedIdConversion<>(SubscriptionId.class, UUID.class, SubscriptionId::new);
 * }
 * }</pre>
 */
public record TypedIdConversion<I extends TypedId<V>, V>(Class<I> idType, Class<V> valueType, Function<V, I> wrap) {
    List<GenericConverter> converters() {
        return List.of(new Writing(idType, valueType), new Reading<>(valueType, idType, wrap));
    }

    @WritingConverter
    private record Writing(Class<?> idType, Class<?> valueType) implements GenericConverter {
        @Override
        public Set<ConvertiblePair> getConvertibleTypes() {
            return Set.of(new ConvertiblePair(idType, valueType));
        }

        @Override
        public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
            return source == null ? null : ((TypedId<?>) source).value();
        }
    }

    @ReadingConverter
    private record Reading<I, V>(Class<V> valueType, Class<I> idType, Function<V, I> wrap) implements GenericConverter {
        @Override
        public Set<ConvertiblePair> getConvertibleTypes() {
            return Set.of(new ConvertiblePair(valueType, idType));
        }

        @Override
        public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
            return source == null ? null : wrap.apply(valueType.cast(source));
        }
    }
}
```

One configuration in `shared/infra` collects every feature's conversions. Each feature registers its own ids, so the kernel never imports a feature:

```java
package com.example.shared.infra;

import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jdbc.core.convert.JdbcCustomConversions;

/** Collects every feature's typed-id conversions into the one conversions bean Spring Data JDBC reads. */
@Configuration(proxyBeanMethods = false)
class PersistenceConversions {
    @Bean
    JdbcCustomConversions jdbcCustomConversions(List<TypedIdConversion<?, ?>> typedIds) {
        List<Object> converters = new ArrayList<>();
        typedIds.forEach(typedId -> converters.addAll(typedId.converters()));
        return new JdbcCustomConversions(converters);
    }
}
```

```java
package com.example.subscription.infra;

import com.example.shared.infra.TypedIdConversion;
import com.example.subscription.SubscriptionId;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class SubscriptionPersistence {
    @Bean
    TypedIdConversion<SubscriptionId, UUID> subscriptionIds() {
        return new TypedIdConversion<>(SubscriptionId.class, UUID.class, SubscriptionId::new);
    }
}
```

A new id with no conversion bean fails only when its row is written or read, so the persistence test of each aggregate is what catches it.

## At the edges

- **HTTP** carries the plain value: a path variable or a request field is a `UUID`, and the controller or the request's `toCommand()` wraps it (`new SubscriptionId(id)`). Spring answers a malformed UUID with 400 before any of your code runs.
- **Read models** carry the plain `UUID` too: they are shaped for a consumer that has no use for the domain type.
- **Logs and messages** print `id.value()`. A record's `toString` is `SubscriptionId[value=…]`.
