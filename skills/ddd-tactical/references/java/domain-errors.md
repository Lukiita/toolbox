# Errors in Java — three kinds, thrown, mapped once

The taxonomy of the TypeScript page holds: the type is picked by **who routes on the failure and what they can do with it**, never by the layer that produced it ([../domain-errors.md](../domain-errors.md) § The question that picks the type, including the authorization trap). What Java changes is the channel: all three kinds are **thrown** as unchecked exceptions carrying a code, and one `@RestControllerAdvice` turns them into HTTP answers.

| The caller… | Type | Lives in | HTTP |
|---|---|---|---|
| hits a **rule refusal** (canceled subscription, insufficient balance) | `DomainException` | `shared/domain` | 422, or the status the feature registers for the code |
| finds the use case **blocked before the rule** (not found, forbidden, stale version) | `ApplicationException` | `shared/application` | by its outcome: not found 404, forbidden 403, stale 409 |
| **can do nothing**: a dependency is down after the adapter's retries | `InfrastructureException` (gateways); for the database, Spring's transient and resource-failure `DataAccessException`s and `CannotCreateTransactionException` | `shared/infra` | 503 |
| **collided with another writer** (a stale version on save, a lock timeout, a deadlock) | Spring's `ConcurrencyFailureException` | — | 409: reload and retry |
| hit a **bug** | anything else: `NullPointerException` from `requireNonNull`, a constraint violation the domain should have refused | — | 500, stack logged |

## Why Java throws where TypeScript returns

The skill returns refusals in `Result` on the TypeScript side; in Java it throws them. The split follows the languages' mechanisms:

- **A refusal cannot be lost.** Ignoring a returned value compiles in both languages, and nothing in Java's default toolchain flags it: `subscription.renew(now);` with its `Result` unread would let the next line save anyway. A thrown exception travels up until the advice answers.
- **`@Transactional` rolls back when an unchecked exception escapes**, so a refusal after a write undoes the write.
- **Java exceptions are typed.** `catch (DomainException e)` catches that type and nothing else. A TypeScript `catch` receives `unknown`, which is why the TypeScript side keeps the refusal in the return type, where the compiler can see it.
- **The ecosystem throws already**: Spring Data, Bean Validation and the JDK. One mechanism instead of two.

The price is the signature: `void renew(Instant now)` does not say it can refuse. The Javadoc `@throws` tag pays it back (below).

## The three exceptions

```java
package com.example.shared.domain;

import java.util.Objects;

/**
 * A business rule said no. Thrown by aggregates and value objects; the global advice maps it
 * to 422 (or the status a feature registers for its code).
 *
 * <p>No stack trace: a refusal is an expected outcome, not a bug, and capturing a stack on
 * every refusal costs time and fills logs with noise.
 *
 * <pre>{@code
 * throw new DomainException("subscription.canceled", "subscription " + id.value() + " is canceled");
 * }</pre>
 */
public class DomainException extends RuntimeException {
    private final String code;

    /**
     * @param code stable, greppable {@code <concept>.<violation>} - what the advice and the tests route on
     * @param message the offending value and the expected shape
     */
    public DomainException(String code, String message) {
        super(message, null, false, false);
        this.code = Objects.requireNonNull(code, "a DomainException needs a code");
    }

    public String code() {
        return code;
    }
}
```

```java
package com.example.shared.application;

import java.util.Locale;

/**
 * The use case never reached the rule: not found, forbidden, stale. Thrown by handlers through
 * one factory per outcome, so the outcome is a type the advice switches on - never a string
 * suffix a typo could change.
 *
 * <pre>{@code
 * throw ApplicationException.notFound("subscription", "no subscription for id " + id.value());
 * }</pre>
 */
public class ApplicationException extends RuntimeException {
    /** The small vocabulary of a blocked use case; each outcome answers one HTTP status. */
    public enum Outcome { NOT_FOUND, FORBIDDEN, STALE }

    private final Outcome outcome;
    private final String code;

    private ApplicationException(String concept, Outcome outcome, String message) {
        super(message, null, false, false);
        this.outcome = outcome;
        this.code = concept + "." + outcome.name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    public static ApplicationException notFound(String concept, String message) {
        return new ApplicationException(concept, Outcome.NOT_FOUND, message);
    }

    public static ApplicationException forbidden(String concept, String message) {
        return new ApplicationException(concept, Outcome.FORBIDDEN, message);
    }

    public static ApplicationException stale(String concept, String message) {
        return new ApplicationException(concept, Outcome.STALE, message);
    }

    public Outcome outcome() {
        return outcome;
    }

    /** {@code <concept>.<outcome>}, e.g. subscription.not-found - what logs and tests read. */
    public String code() {
        return code;
    }
}
```

The outcome is a type, not a string. A handler throws through one factory per outcome, and the advice switches over the enum, so a typo cannot turn a 404 into a 409, and a new outcome does not compile until it has a status. The code is still `<concept>.<outcome>` (`subscription.not-found`), for logs and tests. Three outcomes, not thirty: when a feature wants more, those are rule refusals wearing the wrong type.

```java
package com.example.shared.infra;

import java.util.Objects;

/**
 * Something the code depends on is down, after the adapter's own retries gave up. The advice
 * answers 503. Keeps its stack trace and the SDK error as cause: here they are what the
 * on-call engineer needs.
 *
 * <pre>{@code
 * throw new InfrastructureException("payment.provider-unavailable", "charge for customer " + id + " failed", error);
 * }</pre>
 */
public class InfrastructureException extends RuntimeException {
    private final String code;

    /**
     * @param code {@code <concept>.<failure>} - e.g. payment.provider-unavailable
     * @param message what failed, with the identifiers needed to find it
     * @param cause the SDK or driver error - kept for the log, never for routing
     */
    public InfrastructureException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "an InfrastructureException needs a code");
    }

    public String code() {
        return code;
    }
}
```

- **Three separate classes, no shared base.** A common parent would invite `catch (TheBase e)`, which catches a refusal and an outage together: the mixing the three types exist to prevent.
- **The names end in `Exception`.** In Java, `Error` is the JVM's class for what an application must not catch (`OutOfMemoryError`), so the TypeScript names would mislead a Java reader.
- **A business rule never throws `IllegalArgumentException` or `IllegalStateException`.** They carry no code, the advice answers 500, and the refusal reads as a bug. Keep them, and `Objects.requireNonNull`, for programmer errors.

## Every refusal is documented with `@throws`

The tag restores what the signature hides, for the agent writing the next caller: one line per code the method can throw, on every public method that can refuse (Effective Java, item 74: document unchecked exceptions with `@throws`, never with the `throws` keyword).

```java
/**
 * Rolling clock: the new period anchors on the previous end, not on {@code now}.
 *
 * @throws DomainException {@code subscription.canceled} when the subscription is canceled
 */
public void renew(Instant now) {
```

A handler documents the codes it throws and the ones it lets through from the aggregate ([application-cqrs.md](application-cqrs.md)).

## The advice: every thrown error becomes an answer here

```java
package com.example.shared.presentation;

import com.example.shared.application.ApplicationException;
import com.example.shared.domain.DomainException;
import com.example.shared.infra.InfrastructureException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * The one place a thrown error becomes an HTTP answer (RFC 9457 problem details, with the
 * error's code as a property). Extending ResponseEntityExceptionHandler keeps Spring MVC's
 * own errors (bad JSON, failed bean validation) on the same format.
 */
@RestControllerAdvice
class ThrownErrorAdvice extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ThrownErrorAdvice.class);

    private final Map<String, HttpStatus> domainStatusByCode = new HashMap<>();

    ThrownErrorAdvice(List<DomainErrorStatuses> featureStatuses) {
        featureStatuses.forEach(statuses -> domainStatusByCode.putAll(statuses.byCode()));
    }

    // An unmapped refusal is still a refusal: 422, never 500 (500 means a bug).
    @ExceptionHandler(DomainException.class)
    ProblemDetail onRuleRefused(DomainException error) {
        HttpStatus status = domainStatusByCode.getOrDefault(error.code(), HttpStatus.UNPROCESSABLE_CONTENT);
        return problem(status, error.code(), error.getMessage());
    }

    // Exhaustive over the enum: a new outcome does not compile until it has a status here.
    @ExceptionHandler(ApplicationException.class)
    ProblemDetail onUseCaseBlocked(ApplicationException error) {
        HttpStatus status = switch (error.outcome()) {
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case FORBIDDEN -> HttpStatus.FORBIDDEN;
            case STALE -> HttpStatus.CONFLICT;
        };
        return problem(status, error.code(), error.getMessage());
    }

    // Writers collided: a stale version on save, a lock timeout, a deadlock. The client retries;
    // nothing is down. More specific than TransientDataAccessException, so it wins over the 503 below.
    @ExceptionHandler(ConcurrencyFailureException.class)
    ProblemDetail onConcurrentUpdate(ConcurrencyFailureException error) {
        return problem(HttpStatus.CONFLICT, "concurrent-update", "the resource changed meanwhile; reload and retry");
    }

    // 503: something we depend on is down - page on-call, the client may retry.
    @ExceptionHandler(InfrastructureException.class)
    ProblemDetail onDependencyDown(InfrastructureException error) {
        LOG.atError().addKeyValue("code", error.code()).setCause(error).log("dependency unavailable");
        return problem(HttpStatus.SERVICE_UNAVAILABLE, error.code(), "service temporarily unavailable");
    }

    // A @Transactional handler meets a dead database when the transaction begins:
    // CannotCreateTransactionException, which is not a DataAccessException.
    @ExceptionHandler({TransientDataAccessException.class, DataAccessResourceFailureException.class,
            CannotCreateTransactionException.class})
    ProblemDetail onDatabaseDown(RuntimeException error) {
        LOG.atError().addKeyValue("code", "database.unavailable").setCause(error).log("database unavailable");
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "database.unavailable", "service temporarily unavailable");
    }

    // Anything else is a bug: log the stack, never echo the message to the client.
    @ExceptionHandler(Exception.class)
    ProblemDetail onBug(Exception error) {
        LOG.atError().addKeyValue("code", "internal-error").setCause(error).log("unhandled exception");
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal-error", "unexpected error");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        return problem;
    }
}
```

A feature registers only the codes that are not a plain 422, as a bean the advice collects, so the shared advice never names a feature's codes:

```java
package com.example.shared.presentation;

import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * The HTTP status a feature wants for some of its domain codes. A code not listed answers 422.
 *
 * <pre>{@code
 * @Bean
 * DomainErrorStatuses subscriptionStatuses() {
 *     return new DomainErrorStatuses(Map.of("subscription.canceled", HttpStatus.CONFLICT));
 * }
 * }</pre>
 */
public record DomainErrorStatuses(Map<String, HttpStatus> byCode) {}
```

## The rules

- **Decide before you write.** A handler loads, asks the aggregate, then saves, so every refusal happens before the first write. The rollback is the safety net, never a license to write and refuse after. And a rollback undoes rows only: no external effect (a charge, an email) before the last refusal.
- **No `try`/`catch` in handlers or controllers.** A refusal or an outage passes through untouched to the advice. A flow that genuinely routes on a refusal ("declined → mark past-due") catches that one named exception thrown by a domain object or a gateway, never a generic one: PMD's `AvoidCatchingGenericException` fails `catch (RuntimeException e)`, which swallows refusals and bugs together.
- **Never catch an exception that crossed another bean's `@Transactional` method and carry on.** When it escapes that method, Spring marks the shared transaction rollback-only; the outer method then returns normally, and its commit throws `UnexpectedRollbackException` (verified). Let it propagate, or give the inner call its own transaction on purpose.
- **Repositories throw Spring's `DataAccessException`.** Spring already translates driver errors into one unchecked hierarchy, the same idea as `InfrastructureException`, so a repository needs no wrapper. The advice answers 409 for a collision between writers (`ConcurrencyFailureException`), 503 for the transient and resource-failure branches, and 500 for the rest: a constraint violation means the domain let through what the database refused. A `@Transactional` handler meets a dead database before any repository call, when the transaction begins, as `CannotCreateTransactionException`. That type sits outside the `DataAccessException` tree, and the advice maps it to 503 too (each mapping verified).
- **Stale has two shapes.** The client sent the version it saw and the handler compares it with `aggregate.version()`: `ApplicationException.stale("<concept>", …)`, 409. Two writers raced between load and save: Spring Data JDBC's `save` throws `OptimisticLockingFailureException`, 409 `concurrent-update` ([repository.md](repository.md)).
- **A stored value that breaks a record's rule fails the read with 500.** Spring wraps the `DomainException` thrown while it builds the record, so the advice sees a bug, which corrupt data is (verified). Projects reading legacy rows: [value-object.md](value-object.md).

## Who handles what

| Where | Throws | Catches |
|---|---|---|
| Aggregate / value object | `DomainException` | — |
| Command handler | `ApplicationException` (not found, forbidden, stale) | nothing; the aggregate's refusals pass through |
| Gateway adapter | `InfrastructureException` after its retries; a provider *refusal* translated into a `DomainException` | the SDK's own errors, inside the adapter ([gateway.md](gateway.md)) |
| Repository (Spring Data) | `DataAccessException` | — |
| `ThrownErrorAdvice` | — | everything, once |
