# Base classes — the shared kernel

The abstract classes every domain block extends. They live in `src/shared/domain/` and import **no framework, ORM or I/O client** — the domain stays pure by construction (the dependency-cruiser template enforces the internal-layer side), so a framework migration or a unit test never drags infrastructure along. Pure computation libraries (date-fns, decimal.js) are the deliberate exception — see "What pure means for imports" in SKILL.md.

## Why own base classes instead of extending the framework's

Extending `AggregateRoot` from `@nestjs/cqrs` (or an ORM's base entity) puts a framework import inside `domain/` — the one place the layer rules forbid it. The costs are concrete: the framework's release cycle becomes your domain's release cycle (strong connascence with code you don't own), unit tests load framework machinery, and moving one feature to a worker or another runtime drags NestJS with it. Own the ~60 lines below instead; wire the framework at the edge (adapter recipe at the bottom).

## `Brand`

The kernel of every typed id. The recipe built on it, its rules and the class-based alternative are in [typed-ids.md](typed-ids.md).

```ts
// shared/domain/brand.ts
declare const brand: unique symbol;

/**
 * A primitive that carries the name of its concept for the compiler only:
 * `Brand<'SubscriptionId'>` IS a string when the program runs.
 *
 * @example
 *   type SubscriptionId = Brand<'SubscriptionId'>;       // a string
 *   type LegacyOrderId = Brand<'LegacyOrderId', number>; // a serial key
 */
export type Brand<Name extends string, Primitive extends string | number = string> = Primitive & {
  readonly [brand]: Name;
};
```

The key is a `unique symbol` declared once, here, so this helper is the only thing that can produce the brand. A string-literal field (`{ __brand: 'UserId' }`) is matched by any type that happens to carry the same field — another library's brand, a hand-written object type — and the two become interchangeable in silence. The concept **name** is what tells two ids apart: `Brand<'UserId'>` written in two features is one type, right when both mean the same concept, so different concepts get different names.

An identifier IS a value object by taxonomy — immutable, compared by value, no identity of its own — and it stays outside the `ValueObject` base on purpose: that base's props-bag and structural equality serve multi-part values (`Money` = amount + currency), while an id is one primitive and the most-used type in the system. The lesson generalizes: taxonomy ("is a VO") does not obligate inheritance ("extends ValueObject") — inherit for reuse, not to satisfy a diagram.

## `ValueObject`

```ts
// shared/domain/value-object.ts
export abstract class ValueObject<Props extends Record<string, unknown>> {
  protected constructor(protected readonly props: Readonly<Props>) {}

  // Value objects are interchangeable when their parts are equal - identity
  // plays no role. Structural comparison is what makes `Money.equals` mean
  // "same amount, same currency" and nothing else.
  public equals(other: ValueObject<Props>): boolean {
    if (other === this) return true;
    if (!(other instanceof this.constructor)) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
```

`JSON.stringify` equality is deliberate: props are flat primitives in practice, and the alternative (deep-equal dependency or hand-rolled comparison per VO) buys nothing here. If a VO grows nested structure, override `equals` in that VO — locally, where the need is visible.

## `Entity`

```ts
// shared/domain/entity.ts
export abstract class Entity<Props extends { id: string | number }> {
  protected constructor(protected readonly props: Props) {}

  // `Props['id']`: the id exactly as the aggregate declared it, brand
  // included. Typed as the bare primitive, the getter would hand back an
  // untyped id and `repository.findById(subscription.id)` would not compile.
  public get id(): Props['id'] {
    return this.props.id;
  }

  // Two entities are the same THING when their ids match, however different
  // their current state looks - that is what identity means.
  public equals(other: Entity<Props>): boolean {
    if (other === this) return true;
    return other instanceof this.constructor && other.id === this.id;
  }

  // The persistence door: repositories need to READ the state to map it to
  // rows, and props is protected. A shallow readonly copy lets them look
  // without touching - state still changes only through domain methods.
  public snapshot(): Readonly<Props> {
    return { ...this.props };
  }
}
```

## `AggregateRoot`

```ts
// shared/domain/aggregate-root.ts
import { Entity } from './entity';

export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
}

export abstract class AggregateRoot<
  Props extends { id: string | number },
> extends Entity<Props> {
  private readonly _events: DomainEvent[] = [];

  // Events are COLLECTED here and PUBLISHED by whoever saves the aggregate
  // (the use case / repository decides when the transaction is real). The
  // aggregate never talks to a bus - it records facts.
  protected record(event: DomainEvent): void {
    this._events.push(event);
  }

  public pullDomainEvents(): DomainEvent[] {
    return this._events.splice(0, this._events.length);
  }
}
```

Recording is cheap and always on; **dispatching is opt-in**. A project with no cross-context effects simply never calls `pullDomainEvents` — zero ceremony paid.

## `Result`

See [domain-errors.md](domain-errors.md) — it lives in the shared kernel too (`shared/domain/result.ts`).

## Wiring NestJS (or any framework) without touching the domain

The framework integrates at the **application/infra edge**, after persistence succeeds:

```ts
// <feature>/application/commands/renew-subscription.command.ts (NestJS flavor)
const result = subscription.renew(clock);
if (result.isFail()) return result;

await this.subscriptions.save(subscription);
for (const event of subscription.pullDomainEvents()) {
  this.eventBus.publish(event);           // @nestjs/cqrs lives HERE, not in domain/
}
```

Same shape for any other stack: swap `eventBus.publish` for an outbox insert, a queue producer, or nothing at all. The domain never learns which one was chosen — that is the point.
