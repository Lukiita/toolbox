# Base types in Java — the shared kernel

The types every domain block builds on, in `shared/domain`: `TypedId`, `Entity`, `AggregateRoot` and `DomainEvent`, beside `DomainException` ([domain-errors.md](domain-errors.md)) and `Money` ([value-object.md](value-object.md)). The kernel is the skill's own code, never a framework's base class, so the domain's shape is the skill's to decide. Unlike the TypeScript kernel, it carries Spring Data mapping labels: the line in [layout.md](layout.md) allows labels and keeps HTTP, transactions and I/O out.

## No `ValueObject` base

A record already is a value object: immutable, with `equals`, `hashCode` and `toString` generated from its components, so a component added later joins the comparison by itself. The TypeScript kernel needs a `ValueObject` base because a JavaScript class has no equality by value. Java needs nothing: inherit for reuse, never to match a diagram.

## `TypedId`

```java
package com.example.shared.domain;

/**
 * Every id is a typed id: one record per concept, so a {@code PlanId} never fits a
 * {@code SubscriptionId} slot, and records compare by value.
 *
 * <pre>{@code
 * public record SubscriptionId(UUID value) implements TypedId<UUID> { ... }
 * }</pre>
 *
 * @param <V> the stored value: UUID, or Long for a serial key
 */
public interface TypedId<V> {
    V value();
}
```

The bound is what makes "every id is a typed id" a compile error instead of a sentence: `Entity` asks for a `TypedId`, and `AggregateRoot<UUID>` does not compile ([typed-ids.md](typed-ids.md)).

## `Entity`

```java
package com.example.shared.domain;

/**
 * Something with identity: the same thing while its state changes. Two entities are equal
 * when their ids are, whatever their state.
 *
 * @param <I> the typed id - a bare UUID does not satisfy the bound
 */
public abstract class Entity<I extends TypedId<?>> {
    public abstract I id();

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || other.getClass() != getClass()) {
            return false;
        }
        return id().equals(((Entity<?>) other).id());
    }

    @Override
    public final int hashCode() {
        return id().hashCode();
    }
}
```

`equals` and `hashCode` are `final`. A subclass that compared state would make an entity change its hash as it changes state, and an aggregate placed in a `HashSet` would get lost there.

## `AggregateRoot`

```java
package com.example.shared.domain;

import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Transient;
import org.springframework.data.annotation.Version;
import org.springframework.data.domain.AfterDomainEventPublication;
import org.springframework.data.domain.DomainEvents;

/**
 * The root of a consistency boundary: the only entry point to its cluster, saved as a whole
 * by one repository.
 *
 * <p>Carries two persistence concerns every aggregate needs, as Spring Data mapping labels:
 * {@code version} (new vs existing on save, and the optimistic lock) and the recorded events
 * (Spring Data publishes them on {@code save} and clears them after).
 *
 * @param <I> the typed id of the aggregate
 */
public abstract class AggregateRoot<I extends TypedId<?>> extends Entity<I> {
    @Transient
    private final List<DomainEvent> events = new ArrayList<>();

    // Null until the first save: that is how Spring Data JDBC tells an INSERT from an UPDATE
    // when the id is minted by the domain. Then every UPDATE checks it (optimistic lock).
    @Version
    private Long version;

    protected void record(DomainEvent event) {
        events.add(event);
    }

    public Long version() {
        return version;
    }

    @DomainEvents
    List<DomainEvent> domainEvents() {
        return List.copyOf(events);
    }

    @AfterDomainEventPublication
    void clearDomainEvents() {
        events.clear();
    }
}
```

- **`version`** answers two questions. The id is minted by the domain, so it is never null, and Spring Data JDBC reads a null version as "new row": `INSERT`. Every later save is an `UPDATE … WHERE version = ?`, which refuses a write based on a stale read ([repository.md](repository.md)). Spring sets the field itself after building the aggregate, so `restore` never takes it.
- **Events: recording is always on, dispatching is opt-in.** The aggregate records facts and never talks to a bus. On `save`, Spring Data hands the recorded events to the application's event publisher and clears them (verified: one save, one publication; a second save publishes nothing). Until some code listens, publishing costs nothing. An effect that must happen only once the data is committed listens with `@TransactionalEventListener`, whose default phase is after the commit.
- **`@Transient`** keeps the event list out of the table. Without it Spring Data JDBC would map the list as a child collection.
- **Why not Spring Data's `AbstractAggregateRoot`:** it covers the events only. This base also carries `Entity`'s equality by id and the `version` every aggregate needs, and it keeps the event API in this skill's words (`record`).

## `DomainEvent`

```java
package com.example.shared.domain;

import java.time.Instant;

/** A fact the domain recorded. Events are records, named in the past tense. */
public interface DomainEvent {
    Instant occurredAt();
}
```

An event's `occurredAt` comes from the `now` the aggregate method received, never from the clock inside the event, so a test can predict it.
