# Domain errors and Result

A business rule saying "no" is not an exception — it is an expected outcome the caller must route on. Throwing for it has three costs: every caller needs try/catch or the flow explodes mid-use-case; the error type disappears from the signature (`renew(): void` lies about what can happen); and catch blocks catch *everything*, mixing "rule said no" with genuine bugs. So the house style: **rules return `Result`, bugs throw.**

## `DomainError`

```ts
// shared/domain/domain-error.ts
export class DomainError {
  public constructor(
    /** Stable, greppable code: '<concept>.<violation>' - e.g. 'subscription.canceled'. */
    public readonly code: string,
    /** Human message carrying the offending value and the expected shape (AGENTS.md rule). */
    public readonly message: string,
  ) {}
}
```

The code is the contract: use cases route on it, tests assert on it, the presentation layer maps it to a status code or a UI message. The message carries context — `received X, expected Y` — because a vague error costs whoever debugs it (human or agent) an extra round.

## Deliberately not `extends Error`, deliberately no timestamp

**No `extends Error`.** In this house a DomainError is never thrown — it travels inside `Result` as a value. Extending `Error` would signal "throwable" and invite exactly the use the table below forbids; with the types disjoint, the rule stays mechanical: what extends Error gets thrown (bugs), what is a DomainError gets returned (rules). It also skips two real costs: capturing a stack trace on every expected refusal (rule refusals are normal, sometimes hot flow — a stack answers "where did the programmer err", not "what did the business refuse"), and Error's non-enumerable fields serializing as `{}` in JSON logs while a plain DomainError serializes clean.

**No timestamp.** The edge logger already stamps every structured log line (AGENTS.md: JSON logging) — a timestamp inside the error duplicates it. Worse, a `new Date()` inside the error breaks the house rule that time enters as an argument: error equality in tests turns non-deterministic. When the moment of refusal is genuinely business data (an audit of attempts), model it explicitly in that flow — a field on the aggregate, or a domain event, whose `occurredAt` exists precisely because a *fact of the domain* deserves its time.

**Extend when a real case appears, not before:** the natural first addition is a structured `details?: Record<string, unknown>` (current balance vs required, for a UI that must show the numbers) — today the message carries that in text, which is enough until it isn't.

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

## The line between Result and throw

| Situation | Channel |
|---|---|
| Business rule refused (`subscription.canceled`, insufficient balance) | `Result.fail(DomainError)` |
| Caller misused the API (accessed `.value` on a fail, negative array index) | `throw` — it is a bug, let it crash and be fixed |
| Infrastructure failed (db down, timeout) | throw/reject in infra, translated at the use-case boundary if the flow must survive it |

Use cases propagate: check `isFail`, return the same `Result` upward. The presentation edge is where a `DomainError` finally becomes a 422, a toast, or a CLI message — one mapping, at one place.
