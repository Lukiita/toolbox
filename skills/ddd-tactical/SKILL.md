---
name: ddd-tactical
description: Tactical domain-driven design in TypeScript — model aggregates, entities, value objects, domain errors and repositories with private constructors, static create/restore factories and framework-free base classes. Use whenever the user models a domain concept, creates or refactors an aggregate, entity or value object, adds a business rule or invariant, or mentions DDD, domain layer, rich vs anemic model — and also when they just say "model X", "create the Y aggregate", "add a Z rule" without naming DDD. Reach for it too when deciding WHERE a new business rule should live, or when reviewing code where logic sits in services/SQL instead of the domain.
---

# Tactical DDD

Model the domain so the rules live inside it — not scattered across services, handlers and SQL. The enemy has a name: the anemic model, a pile of loose functions orchestrating queries where the database enforces what the domain should own.

## The three questions (answer before writing any code)

1. **What is the aggregate?** Who is the root, what sits inside the consistency boundary?
2. **What invariant does it protect?** The rule that can never be violated lives INSIDE the aggregate. The database (constraint, trigger, RLS) may enforce it as a second line of defense — the domain owns it.
3. **What illegal state becomes unrepresentable?** Model with types that make invalid states impossible to construct, instead of validation scattered across callers.

Write the answers as one short paragraph before coding — in the task, the design doc, or a comment. If you cannot answer them, the modeling conversation is not over; ask, don't guess.

## Ceremony scales with the problem — the questions don't

An entity guarding its own invariant is already a single-element aggregate; that costs nothing and is often all a small feature needs. Domain events, extra services and elaborate factories enter only when their problem shows up (cross-context effects, async side effects) — never by default. What never shrinks: the invariant lives inside the domain object, and money is never a float (integer minor units inside a `Money` value object).

## The building blocks

| You need | Reach for | Read |
|---|---|---|
| A concept defined by its **value**, interchangeable, immutable (Money, Email, CPF, a date range) | Value Object | [value-object.md](references/value-object.md) |
| A concept with **identity** that survives change (an Order, a Subscription) | Entity / Aggregate | [entity-aggregate.md](references/entity-aggregate.md) |
| The base classes everything extends (framework-free, in the shared kernel) | `shared/domain` | [base-classes.md](references/base-classes.md) |
| Failing without throwing — named errors the caller can route on | `Result` + `DomainError` | [domain-errors.md](references/domain-errors.md) |
| Loading and saving aggregates without the domain knowing the database | Repository port | [repository.md](references/repository.md) |
| The layers around the domain — write via commands, read via direct queries, controllers, infra | Lightweight CQRS | [application-cqrs.md](references/application-cqrs.md) |
| Calling an external service (payment, mail, third-party API) without the SDK leaking inward | Gateway port | [gateway.md](references/gateway.md) |

Read the reference for the block you are about to write — each carries the house template and the reasons behind it.

## The house pattern in one glance

```ts
export class Subscription extends AggregateRoot<SubscriptionProps> {
  private constructor(props: SubscriptionProps) { super(props); }        // always private, never validates

  public static create(input: CreateSubscriptionInput): Result<Subscription, DomainError> {
    // ALL validation lives here - born valid or not born at all
  }

  public static restore(props: SubscriptionProps): Subscription {
    // rehydration from persistence - validation policy is a per-project decision (see below)
  }

  public renew(clock: Clock): Result<void, DomainError> {
    // behavior lives ON the aggregate; state changes only through methods that hold the invariant
  }
}
```

Why the constructor is private and empty: a `new` that throws forces try/catch on every caller and cannot return a rich, named error. `create` returns a `Result` — the caller routes on the error, nothing explodes mid-flow. And the names say what is happening: `create` is a domain birth, `restore` is rehydration.

## Per-project decisions (settle them once, at the first aggregate)

- **Does `restore` validate?** Greenfield: yes, same rules as `create` — the database was born under the invariant, and a violation there is corruption worth failing loudly on. Legacy: no — a validating `restore` makes invalid rows UNREADABLE, so nobody can even load them to fix them. Lenient restore then pairs with a validating save: you can read broken data, you cannot persist more of it. The debt only shrinks — a ratchet applied to data. Full pattern in [entity-aggregate.md](references/entity-aggregate.md).
- **Domain events on or off?** The `AggregateRoot` base collects them, but wire a dispatcher only when some effect genuinely needs decoupling. Publishing events nobody consumes is ceremony.

## Where things live (package by feature)

```
src/<feature>/
├── domain/                        the blocks above - pure, imports only itself and shared
├── application/
│   ├── commands/                  write side: handler → aggregate → repository port
│   └── queries/                   read side: ORM inline, returns a read model (no aggregate)
├── infra/
│   ├── repositories/              port implementations + their mappers (subscription.mapper.ts)
│   └── gateways/                  adapters for external services (payment, mail, third-party APIs)
└── presentation/
    ├── controllers/               routes/handlers - call commands/queries, map DomainError once
    └── requests/                  input contracts with SHAPE validation (zod/class-validator)
src/shared/domain/                 the base classes + universal VOs (Money, Id, Result)
```

The write/read asymmetry is deliberate — commands pay the port ceremony because they protect invariants; queries go straight to the database because reads have none to protect. The full contract is in [application-cqrs.md](references/application-cqrs.md).

**What "pure" means for imports** — the domain never imports frameworks, ORMs, I/O clients or anything with runtime wiring. It MAY import **pure computation libraries** (date-fns, decimal.js, big.js): deterministic functions with no I/O are the standard library JavaScript forgot to ship, and rewriting month arithmetic or decimal math by hand to satisfy a diagram trades real correctness for fake purity. Two conditions keep this honest: the library does computation only, and its types never cross a public domain signature (compute inside, emerge holding your own types — `Money` in, `Money` out).

**File naming** — kebab-case with the type as a suffix, so the structure itself is greppable:

| block | file |
|---|---|
| value object | `money.vo.ts` (+ `money.vo.test.ts`) |
| aggregate root | `subscription.aggregate.ts` |
| inner entity | `plan.entity.ts` |
| repository port / adapter | `subscription.repository.ts` / `supabase-subscription.repository.ts` |
| mapper (rows ↔ domain) | `subscription.mapper.ts` (class, static `toDomain`/`toPersistence`) |
| command (write use case) | `renew-subscription.command.ts` |
| query + its read model | `list-active-subscriptions.query.ts` (read model interface lives inside it) |
| request contract | `renew-subscription.request.ts` |
| controller | `subscription.controller.ts` |
| gateway adapter | `stripe-payment.gateway.ts` (its port: `payment.gateway.ts` in domain) |
| domain event | `subscription-renewed.event.ts` |
| shared-kernel base classes | no suffix (`value-object.ts`, `aggregate-root.ts`) — the name already is the type |

The base classes import **no framework** — integration with NestJS (or anything else) is an adapter at the edge, never inheritance in the domain. The why and the adapter recipe are in [base-classes.md](references/base-classes.md).
