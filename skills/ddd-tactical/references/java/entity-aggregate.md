# Entities and aggregates in Java

What an entity and an aggregate are, and the test that settles a boundary, are on the TypeScript page ([../entity-aggregate.md](../entity-aggregate.md), its opening). This page is the Java template: three doors as in TypeScript, refusals thrown as named exceptions, and Spring Data JDBC building the aggregate through its own `restore`.

## The template

```java
package com.example.subscription.domain;

import com.example.plan.PlanId;
import com.example.shared.domain.AggregateRoot;
import com.example.shared.domain.DomainException;
import com.example.subscription.SubscriptionId;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.relational.core.mapping.Table;

@Table
public class Subscription extends AggregateRoot<SubscriptionId> {
    @Id
    private final SubscriptionId id;
    private final PlanId planId;
    private SubscriptionStatus status;
    private Instant currentPeriodEnd;

    // Private and never validates: plumbing shared by the two doors below.
    private Subscription(SubscriptionId id, PlanId planId, SubscriptionStatus status, Instant currentPeriodEnd) {
        this.id = id;
        this.planId = planId;
        this.status = status;
        this.currentPeriodEnd = currentPeriodEnd;
    }

    /**
     * The domain birth: every rule runs here - born valid or not born at all.
     *
     * @throws DomainException {@code subscription.period-in-past} when the period does not end after {@code now}
     */
    public static Subscription create(PlanId planId, Instant currentPeriodEnd, Instant now) {
        if (!currentPeriodEnd.isAfter(now)) {
            throw new DomainException("subscription.period-in-past",
                    "currentPeriodEnd must be after " + now + ", received " + currentPeriodEnd);
        }
        return new Subscription(SubscriptionId.create(), planId, SubscriptionStatus.ACTIVE, currentPeriodEnd);
    }

    // Rehydration: Spring Data JDBC calls this door when it loads a row (matched by parameter name).
    @PersistenceCreator
    static Subscription restore(SubscriptionId id, PlanId planId, SubscriptionStatus status, Instant currentPeriodEnd) {
        return new Subscription(id, planId, status, currentPeriodEnd);
    }

    /**
     * Rolling clock: the new period anchors on the previous end, not on {@code now} - renewing
     * early must not shorten what was already paid for.
     *
     * @throws DomainException {@code subscription.canceled} when the subscription is canceled
     */
    public void renew(Instant now) {
        if (status == SubscriptionStatus.CANCELED) {
            throw new DomainException("subscription.canceled", "subscription " + id.value() + " is canceled and cannot renew");
        }
        Instant anchor = currentPeriodEnd.isAfter(now) ? currentPeriodEnd : now;
        currentPeriodEnd = anchor.atZone(ZoneOffset.UTC).plusMonths(1).toInstant();
        record(new SubscriptionRenewed(id, currentPeriodEnd, now));
    }

    /** @throws DomainException {@code subscription.canceled} when it is already canceled */
    public void cancel() {
        if (status == SubscriptionStatus.CANCELED) {
            throw new DomainException("subscription.canceled", "subscription " + id.value() + " is already canceled");
        }
        status = SubscriptionStatus.CANCELED;
    }

    @Override
    public SubscriptionId id() {
        return id;
    }

    public PlanId planId() {
        return planId;
    }

    public SubscriptionStatus status() {
        return status;
    }

    public Instant currentPeriodEnd() {
        return currentPeriodEnd;
    }
}
```

`SubscriptionStatus` is an enum (`ACTIVE, PAST_DUE, CANCELED`); `SubscriptionRenewed` is a record implementing `DomainEvent` ([base-classes.md](base-classes.md)).

## The three doors in Java

The TypeScript page explains why there are three ([../entity-aggregate.md](../entity-aggregate.md) § The factory pattern). In Java:

- **`create`** is the domain birth. It runs every rule and throws a named `DomainException` when one refuses; its parameters leave out what a caller may not choose (no id, no status).
- **`restore`** is rehydration. `@PersistenceCreator` makes it the door Spring Data JDBC uses to build the aggregate from a row. It is a static, package-private method, matched to the columns by parameter name. Fields Spring sets on its own afterwards, such as the inherited `version`, stay out of its parameters.
- **The constructor** is private plumbing both doors share, so no caller bypasses them.

## The restore decision in Java

Settle it per project, as on the TypeScript page ([../entity-aggregate.md](../entity-aggregate.md) § The restore decision). What Java adds:

- **Value objects validate on read in either mode**, because Spring Data builds each record through its compact constructor. Greenfield gets that for free. For legacy tables, see [value-object.md](value-object.md) § When the constructor runs on read.
- **A greenfield `restore` that validates cross-field rules** throws `IllegalStateException`: a row that breaks an invariant on read is corruption, a bug, and the advice answers 500.
- **A legacy `restore` stays lenient, and the write side holds the line.** The repository Spring generates has no step that can refuse, so the handler calls the aggregate's `violations()` before `save` and throws the first one: broken rows stay readable, and nothing worse is persisted.

## Rules that keep the model rich

- **No setters.** Each state change is a named method that checks its rule (`renew`, `cancel`), and the method names become the domain's language in code. Read access is record-style (`status()`), never `getStatus()`/`setStatus()` pairs.
- **Time comes in as an argument** (`Instant now`): the handler passes `clock.instant()` from the injected `Clock`. `java.time` is the domain's date library. `Instant` has no months, so calendar arithmetic goes through a zone (`atZone(ZoneOffset.UTC).plusMonths(1)`).
- **Every refusal is a named `DomainException`, documented with `@throws`** ([domain-errors.md](domain-errors.md)). A method checks every rule before it changes any field.
- **Another aggregate is referenced by its id** (`PlanId planId`), never by the object. Spring Data JDBC treats every object reachable from the root as part of the same aggregate, saved and deleted with it.
- **Keep the aggregate small.** Saving a root that holds a collection deletes and re-inserts every child row (verified with Spring Data JDBC 4.2): a large collection makes every save expensive, and its rows have no stable identity in the table.
- **Compare aggregates with `equals`** (by id, from `Entity`). `==` compares references.
