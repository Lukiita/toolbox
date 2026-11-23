# Repositories in Java — the port Spring implements

The rules of the TypeScript page hold: **one repository per aggregate root**, **domain language in the port**, every write through the aggregate while reads may bypass it ([../repository.md](../repository.md) § The rules). What Java changes is how much code it takes. The aggregate carries Spring Data JDBC's mapping labels ([entity-aggregate.md](entity-aggregate.md)), so the port is an interface and Spring writes the implementation: no row type, no mapper, no adapter.

```java
package com.example.subscription.domain;

import com.example.subscription.SubscriptionId;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * The port, in domain language. Spring Data JDBC writes the implementation. It extends the
 * bare {@code Repository} marker, not {@code CrudRepository}: only the lookups the domain needs,
 * no {@code findAll}/{@code deleteAll} escape hatches.
 */
public interface SubscriptionRepository extends Repository<Subscription, SubscriptionId> {
    Optional<Subscription> findById(SubscriptionId id);

    Subscription save(Subscription subscription);
}
```

## What `save` does

Observed against PostgreSQL 18 with Spring Data JDBC 4.2:

- **A null `version` inserts; any other version updates** with `WHERE id = ? AND version = ?`, then increments the version. The id is minted by the domain, so the version (from `AggregateRoot`) is how Spring tells a new aggregate from an existing one.
- **A stale version throws `OptimisticLockingFailureException` inside `save`.** Two handlers loaded the same row and the second save matches no row. The advice answers 409 ([domain-errors.md](domain-errors.md)).
- **A child collection is rewritten**: `DELETE` of every child row, then `INSERT` of all of them. That is the reason the aggregate stays small.
- **Recorded events are published, then cleared** ([base-classes.md](base-classes.md)).
- **A driver failure throws Spring's `DataAccessException`**, already unchecked and already translated from the driver's error. The port declares nothing, and nothing wraps it.

## Mapping rules

- **`@Table` with no name.** Spring derives `subscription` and `current_period_end` from the class and its fields. A hand-written name is quoted in SQL, so its case must match the table exactly.
- **Each typed id needs its conversion bean**, or Spring reads it as a composite key ([typed-ids.md](typed-ids.md)).
- **A value object is embedded**, one column per component, under a prefix ([value-object.md](value-object.md)).
- **`restore` is the `@PersistenceCreator`**: Spring builds every loaded aggregate through it ([entity-aggregate.md](entity-aggregate.md)).
- **The schema belongs to the migrations** (Flyway or similar). Spring Data JDBC creates no table; the migration names columns the way Spring derives them.

## When a table stops matching the aggregate

When a legacy table, a denormalized column or a shape the labels cannot express makes the mapping fight the model, give **that aggregate alone** the TypeScript shape: a row record, a mapper class with `toDomain`/`toPersistence`, and a repository class implementing the port with `JdbcClient` ([../repository.md](../repository.md)). The other aggregates keep their labels. The choice is made per aggregate and can be undone the same way.

## If a project uses JPA

The house maps with Spring Data JDBC. A project that chooses JPA records it in its decisions file, and keeps three JPA behaviors in view (from the JPA and Hibernate documentation; not exercised here):

- **A no-argument constructor** that JPA requires is a door that skips `create`. Make it `protected` and use it for JPA only.
- **Dirty checking writes at commit any change made to a loaded entity**, with no `save` call: under JPA, changing a loaded aggregate *is* writing. "Decide before you write" becomes "decide before you change", and a refusal caught and swallowed commits whatever changed before it.
- **Lazy loading** reads related rows on first access. Outside the transaction that access throws `LazyInitializationException`.
