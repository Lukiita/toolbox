# Errors and Result — three kinds, two channels

A business rule saying "no" is not an exception — it is an expected outcome the caller must route on. Throwing for it has three costs: every caller needs try/catch or the flow explodes mid-use-case; the error type disappears from the signature (`renew(): void` lies about what can happen); and catch blocks catch *everything*, mixing "rule said no" with genuine bugs. So the house style: **what the caller routes on is returned in `Result`; what aborts the flow is thrown.**

## The question that picks the type

Not "which layer produced it" — **who routes on it, and what can they do with it?** Three answers, three types:

| The caller… | Type | Channel | Lives in |
|---|---|---|---|
| routes on a **rule refusal** (canceled subscription, insufficient balance) | `DomainError` | returned in `Result` | `shared/domain/` |
| routes on the use case **failing to reach the rule** (not found, forbidden, stale version) | `ApplicationError` | returned in `Result` | `shared/application/` |
| **can do nothing** — the flow aborts (db down, provider unavailable, timeout exhausted) | `InfrastructureError` | **thrown** | `shared/infra/` |
| hit a **bug** (accessed `.value` on a failed Result, negative index) | plain `Error` | thrown — let it crash and be fixed | — |

The line between the two returned types: the *aggregate* produces `DomainError`s (it is the rule that refused); the *handler* produces `ApplicationError`s (it could not get to the aggregate). Watch the trap on authorization: "only the subscriber can cancel" is ubiquitous language — a rule, `DomainError`; "this token lacks the scope" is plumbing — `ApplicationError`.

## `DomainError`

```ts
// shared/domain/domain-error.ts
export class DomainError {
  /** Discriminant - see "Why the `kind` field" below. */
  public readonly kind = 'domain' as const;

  constructor(
    /** Stable, greppable code: '<concept>.<violation>' - e.g. 'subscription.canceled'. */
    public readonly code: string,
    /** Human message carrying the offending value and the expected shape (AGENTS.md rule). */
    public readonly message: string,
  ) {}
}
```

The code is the contract: use cases route on it, tests assert on it, the presentation layer maps it to a status code or a UI message. The message carries context — `received X, expected Y` — because a vague error costs whoever debugs it (human or agent) an extra round.

## `ApplicationError`

```ts
// shared/application/application-error.ts
import type { DomainError } from '../domain/domain-error';

export class ApplicationError {
  public readonly kind = 'application' as const;

  constructor(
    /** Same '<concept>.<outcome>' shape - the outcome vocabulary is small and repeats
     *  across features: 'subscription.not-found', 'subscription.forbidden', 'subscription.stale'. */
    public readonly code: string,
    public readonly message: string,
  ) {}
}

/** What a command handler can fail with. The union IS the documentation: a
 *  signature `Result<void, UseCaseError>` says "two kinds of no" to whoever reads it. */
export type UseCaseError = DomainError | ApplicationError;
```

Deliberately the same shape as `DomainError`: callers treat both identically (check `isFail`, return upward); only the presentation edge tells them apart, and that is what `kind` is for. Expect three or four outcomes per feature, not thirty — if the list keeps growing, those are rule refusals wearing the wrong type.

## Why the `kind` field

TypeScript typing is structural: two classes with identical members are interchangeable to the compiler, so `Result<void, DomainError>` would silently accept `Result.fail(new ApplicationError(...))` and the signature would stop telling the truth. A literal-typed field makes the types nominal — the same trick as the private brand on typed ids ([base-classes.md](base-classes.md)) — but **public**, so the error mapper can `switch (error.kind)` and the compiler checks the switch is exhaustive. A private brand would give nominality without the switch.

## `InfrastructureError`

```ts
// shared/infra/infrastructure-error.ts
//
// THROWN, never returned - the only house error that extends Error, because
// it is the only one that travels through the throw channel.
export class InfrastructureError extends Error {
  constructor(
    /** '<concept>.<failure>' - e.g. 'subscription.persistence-failed', 'payment.provider-unavailable'. */
    public readonly code: string,
    message: string,
    /** The SDK/driver error behind this one - kept for the log, never for routing. */
    options?: { cause?: unknown },
  ) {
    // `cause` is native ErrorOptions (ES2022 target): the original error stays
    // attached for the structured log without its TYPE crossing the boundary.
    super(message, options);
    this.name = 'InfrastructureError';
  }
}
```

**Why a class, if it is only thrown.** A bare `throw error` from an adapter leaks the SDK's error type upward, and the global filter would need `instanceof Stripe.errors.X` to pick a status — the same leak the mapper exists to prevent, on the error channel. Wrapping at the boundary keeps SDK types inside `infra/`, and lets the filter separate **503 (infrastructure — page on-call, client may retry)** from **500 (a bug — fix the code)**. In logs and alerts that split is the whole game. Think of it as the throw-side twin of the mapper: translate at the boundary, in both directions.

**Why thrown, not returned.** `Result` exists for outcomes the caller **routes** on. A handler does not route on "database down" — it aborts. The defensive layer AGENTS.md demands (retry with backoff, circuit breaker, timeout) lives *inside the adapter*, around the SDK call: the adapter absorbs the transient failure, and what escapes is terminal. Putting infra failures in `Result` would force every handler to write `if (saved.isFail()) return saved;` for an outcome it can do nothing with — ceremony that documents nothing.

## `Result`

```ts
// shared/domain/result.ts
export class Result<T, E> {
  private constructor(
    private readonly _value: T | undefined,
    private readonly _error: E | undefined,
    private readonly _ok: boolean,
  ) {}

  public static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(value, undefined, true);
  }

  public static fail<E, T = never>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error, false);
  }

  public isOk(): boolean {
    return this._ok;
  }

  public isFail(): boolean {
    return !this._ok;
  }

  /** Throws when accessed on the wrong side - THAT is a bug, and bugs throw. */
  public get value(): T {
    if (!this._ok) throw new Error('Result.value accessed on a failed result');
    return this._value as T;
  }

  public get error(): E {
    if (this._ok) throw new Error('Result.error accessed on a successful result');
    return this._error as E;
  }
}
```

Minimal on purpose: no `map`/`flatMap`/monad tower until the project actually feels the need — a use case reads better as three explicit `if (r.isFail()) return r;` lines than as a combinator pipeline the next agent has to decode.

## Deliberately not `extends Error`, deliberately no timestamp

**No `extends Error` on the returned types.** In this house a `DomainError` or `ApplicationError` is never thrown — it travels inside `Result` as a value. Extending `Error` would signal "throwable" and invite exactly the use the table forbids; with the types disjoint, the rule stays mechanical: **what extends Error gets thrown (`InfrastructureError`, bugs), what doesn't gets returned (rules, application outcomes).** It also skips two real costs: capturing a stack trace on every expected refusal (rule refusals are normal, sometimes hot flow — a stack answers "where did the programmer err", not "what did the business refuse"), and Error's non-enumerable fields serializing as `{}` in JSON logs while a plain object serializes clean. `InfrastructureError` pays both costs on purpose: a stack and a `cause` are exactly what you want when the database went away.

**No timestamp.** The edge logger already stamps every structured log line (AGENTS.md: JSON logging) — a timestamp inside the error duplicates it. Worse, a `new Date()` inside the error breaks the house rule that time enters as an argument: error equality in tests turns non-deterministic. When the moment of refusal is genuinely business data (an audit of attempts), model it explicitly in that flow — a field on the aggregate, or a domain event, whose `occurredAt` exists precisely because a *fact of the domain* deserves its time.

**Extend when a real case appears, not before.** The natural first additions: a structured `details?: Record<string, unknown>` on `DomainError` (current balance vs required, for a UI that must show the numbers) — today the message carries that in text; and a `retryable: boolean` on `InfrastructureError` when a consumer such as a queue worker must choose between re-enqueue and dead-letter — until then the code says enough.

## Who handles what

| Where | Produces | Handles |
|---|---|---|
| Aggregate / VO | `DomainError` in `Result` | — |
| Command handler | `ApplicationError` in `Result` (not found, forbidden, stale) | propagates both returned types upward; **never catches `InfrastructureError`** — it has nothing to do with it |
| Adapter (repository, gateway) | throws `InfrastructureError` after its own retries give up | translates a provider *refusal* (`payment.declined`) into a `DomainError` |
| Presentation | — | the returned union once, in `use-case-error.mapper.ts`; the thrown one once, in the global `thrown-error.filter.ts` — both in [application-cqrs.md](application-cqrs.md) |

Two channels, two single points of translation. A handler that catches, a controller that switches on `code` inline, or an adapter that rethrows the raw SDK error are each the same smell: translation leaking out of its one place.
