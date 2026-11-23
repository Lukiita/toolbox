# Application, read side and presentation in Java

Lightweight CQRS works as on the TypeScript page ([../application-cqrs.md](../application-cqrs.md) § The asymmetry):
- **commands** go through the aggregate and its repository port, because they protect invariants;
- **queries** go straight to the database and return a read model, because reads protect none.

This page is the Java template for each layer. Errors are thrown and mapped once by the advice ([domain-errors.md](domain-errors.md)), so no layer here routes on them.

## Commands

```java
package com.example.subscription.application.commands;

import com.example.subscription.SubscriptionId;

public record RenewSubscriptionCommand(SubscriptionId subscriptionId) {}
```

```java
package com.example.subscription.application.commands;

import com.example.shared.application.ApplicationException;
import com.example.shared.domain.DomainException;
import com.example.subscription.domain.Subscription;
import com.example.subscription.domain.SubscriptionRepository;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RenewSubscriptionHandler {
    private final SubscriptionRepository subscriptions;
    private final Clock clock;

    public RenewSubscriptionHandler(SubscriptionRepository subscriptions, Clock clock) {
        this.subscriptions = subscriptions;
        this.clock = clock;
    }

    /**
     * Load, ask the aggregate, save - every refusal happens before the first write.
     *
     * @throws ApplicationException {@code subscription.not-found} when no subscription has the id
     * @throws DomainException {@code subscription.canceled}, from {@link Subscription#renew}
     */
    @Transactional
    public void handle(RenewSubscriptionCommand command) {
        Subscription subscription = subscriptions.findById(command.subscriptionId())
                .orElseThrow(() -> new ApplicationException("subscription.not-found",
                        "no subscription for id " + command.subscriptionId().value()));
        subscription.renew(clock.instant());
        subscriptions.save(subscription);
    }
}
```

A command that creates something returns the new id (`CreateSubscriptionHandler`, same fields):

```java
@Transactional
public SubscriptionId handle(CreateSubscriptionCommand command) {
    Subscription subscription = Subscription.create(command.planId(), command.currentPeriodEnd(), clock.instant());
    subscriptions.save(subscription);
    return subscription.id();
}
```

- **Thin: load, call the aggregate, save.** Business logic appearing in a handler is the anemic model coming back through the application layer: push it down into the aggregate.
- **The handler is the transaction.** `@Transactional` on `handle` makes the load, the save and the event publication one unit, rolled back when an exception escapes. The application layer may use Spring stereotypes and transactions, and the domain never does ([layout.md](layout.md)).
- **No `try`/`catch`.** The aggregate's refusals and the repository's failures pass through to the advice. `@throws` lists the codes the handler throws and the ones it lets through.
- **Time comes from the injected `Clock`**, and ids are typed in the command record, so the handler never parses text.
- **A command handler IS the write-side use case.** CQRS naming replaces `UseCase`; it does not add a layer on top of one.

## Queries

```java
package com.example.subscription.application.queries;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The read side goes straight to the database: no repository, no aggregate. Reads protect no
 * invariant, so they skip the port and return a record shaped for the screen.
 */
@Component
public class ListActiveSubscriptionsQuery {
    private final JdbcClient jdbc;

    public ListActiveSubscriptionsQuery(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Read model: owned by this query, never the aggregate and never a table row type. */
    public record ActiveSubscriptionRow(UUID id, String planName, Instant currentPeriodEnd) {}

    public List<ActiveSubscriptionRow> execute(UUID planId) {
        return jdbc.sql("""
                select s.id, p.name as plan_name, s.current_period_end
                from subscription s
                join plan p on p.id = s.plan_id
                where s.status = 'ACTIVE' and s.plan_id = :planId
                order by s.current_period_end
                limit 50
                """)
                .param("planId", planId)
                .query(ActiveSubscriptionRow.class)
                .list();
    }
}
```

- **The four rules of the TypeScript page hold** ([../application-cqrs.md](../application-cqrs.md) § Queries): a query never writes; it returns its own read model; it may join tables other features own, while the file lives in the feature that owns the question; its cost is bounded by its output.
- **`JdbcClient` with the SQL in a text block.** `query(Record.class)` maps each `snake_case` column to the record component of the same name in `camelCase` (`plan_name` → `planName`).
- Before writing a query with a JOIN or a GROUP BY, load `<skill-dir>/../sql-quality/references/query-shape.md` (`<skill-dir>` is the directory that contains this skill's `SKILL.md`).

## Presentation

The request record checks **shape only**. The rule lives in the domain, and a copy here would drift:

```java
package com.example.subscription.presentation;

import com.example.plan.PlanId;
import com.example.subscription.application.commands.CreateSubscriptionCommand;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * The input contract: SHAPE only (present, the right type). "The period must end in the
 * future" is a rule - it lives in Subscription.create, never here.
 */
record CreateSubscriptionRequest(@NotNull UUID planId, @NotNull Instant currentPeriodEnd) {
    CreateSubscriptionCommand toCommand() {
        return new CreateSubscriptionCommand(new PlanId(planId), currentPeriodEnd);
    }
}
```

```java
package com.example.subscription.presentation;

import com.example.subscription.SubscriptionId;
import com.example.subscription.application.commands.CreateSubscriptionHandler;
import com.example.subscription.application.commands.RenewSubscriptionCommand;
import com.example.subscription.application.commands.RenewSubscriptionHandler;
import com.example.subscription.application.queries.ListActiveSubscriptionsQuery;
import com.example.subscription.application.queries.ListActiveSubscriptionsQuery.ActiveSubscriptionRow;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// No try/catch: a refusal or an outage is thrown past the controller to ThrownErrorAdvice.
@RestController
@RequestMapping("/subscriptions")
class SubscriptionController {
    private final CreateSubscriptionHandler createSubscription;
    private final RenewSubscriptionHandler renewSubscription;
    private final ListActiveSubscriptionsQuery listActiveSubscriptions;

    SubscriptionController(CreateSubscriptionHandler createSubscription, RenewSubscriptionHandler renewSubscription,
            ListActiveSubscriptionsQuery listActiveSubscriptions) {
        this.createSubscription = createSubscription;
        this.renewSubscription = renewSubscription;
        this.listActiveSubscriptions = listActiveSubscriptions;
    }

    @PostMapping
    ResponseEntity<Void> create(@Valid @RequestBody CreateSubscriptionRequest request) {
        SubscriptionId id = createSubscription.handle(request.toCommand());
        return ResponseEntity.created(URI.create("/subscriptions/" + id.value())).build();
    }

    @PostMapping("/{id}/renewal")
    ResponseEntity<Void> renew(@PathVariable UUID id) {
        renewSubscription.handle(new RenewSubscriptionCommand(new SubscriptionId(id)));
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    List<ActiveSubscriptionRow> listActive(@RequestParam UUID planId) {
        return listActiveSubscriptions.execute(planId);
    }
}
```

What the client sees (each line is a passing HTTP test):

| Request | Answer |
|---|---|
| a valid create | 201, `Location: /subscriptions/<id>` |
| a create whose period ends in the past | 422, `"code": "subscription.period-in-past"` |
| a create missing a field | 400, Spring's problem detail from Bean Validation |
| a renewal of an unknown id | 404, `"code": "subscription.not-found"` |
| a renewal of a canceled subscription | 409, `"code": "subscription.canceled"` (the feature's registered status) |
| a renewal with a malformed UUID in the path | 400 |

- **The controller translates and nothing else.** It calls commands and queries and never touches repositories or gateways. When a controller needs data, that is a query waiting to be written.
- **Each feature registers the statuses of its codes** in its own `presentation` package (`SubscriptionErrorStatuses`, a `DomainErrorStatuses` bean), and the shared advice collects them ([domain-errors.md](domain-errors.md)).
