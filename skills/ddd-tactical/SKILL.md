---
name: ddd-tactical
description: Tactical domain-driven design in TypeScript and Java/Spring Boot — model aggregates, entities, value objects (records in Java), typed ids, domain errors and repositories with private constructors and static create/restore factories. Use whenever the user models a domain concept in code, creates or refactors an aggregate, entity or value object, adds a business rule or invariant, or applies DDD, a domain layer or a rich (vs anemic) model to code — and also when they just say "model X", "create the Y aggregate", "add a Z rule" without naming DDD. Reach for it too when deciding WHERE a new business rule should live, whether a failure should be returned or thrown (domain vs application vs infrastructure error), how an aggregate maps to tables with Spring Data JDBC, or when reviewing code where business rules hide in services or SQL instead of the domain.
---

# Tactical DDD

Model the domain so the rules live inside it — not scattered across services, handlers and SQL. The enemy has a name: the anemic model, a pile of loose functions orchestrating queries where the database enforces what the domain should own.

## Project decisions come first

Before any reference below, read `.agents/skill-decisions/ddd-tactical.md` in the project you are working in, when it exists. It records what the project settled differently from the defaults here — which id recipe, which error vocabulary, the kernel's own names — and it **wins** wherever the two disagree. The references stay generic and that file is the project's one layer over them: it is the project's own, outside the skill's directory, so an update of the skill never touches it (`Lukiita/toolbox` ADR-0002).

## The three questions (answer before writing any code)

1. **What is the aggregate?** Who is the root, and what lives inside its consistency boundary?
2. **What invariant does it protect?** The rule that can never be violated lives INSIDE the aggregate. The database (constraint, trigger, RLS) may enforce it as a second line of defense, but the domain owns the rule — never the other way around.
3. **What illegal state becomes unrepresentable?** Model with types that make invalid states impossible to construct, instead of scattering validation across callers.

Write the three answers as one short paragraph before coding — in the task, the design doc, or a comment. If you cannot answer them, the modeling conversation is not over; ask, don't guess.

Ceremony scales with the problem; the questions don't. An entity guarding its own invariant is already a single-element aggregate — that costs nothing and is often all a small project needs.

**Money is never a floating-point type** (`number` in TypeScript, `double` in Java): an integer in the currency's minor unit (cents), inside a `Money` value object that carries the currency — [value-object.md](references/value-object.md), [java/value-object.md](references/java/value-object.md).

## The building blocks

**In a Java project, read [java/layout.md](references/java/layout.md) first**: the stack, what the domain may import, the packages and the class names. Java departs from the TypeScript pages on purpose in three places, and each Java page says where: failures are thrown as named exceptions, Spring Data JDBC maps the domain directly, and every id and value object is a record.

| You need | Reach for | TypeScript | Java |
|---|---|---|---|
| A concept defined by its **value**, interchangeable, immutable (Money, Email, CPF, a date range) | Value Object | [value-object.md](references/value-object.md) | [java/value-object.md](references/java/value-object.md) |
| A concept with **identity** that survives change (an Order, a Subscription) | Entity / Aggregate | [entity-aggregate.md](references/entity-aggregate.md) | [java/entity-aggregate.md](references/java/entity-aggregate.md) |
| An **id** the compiler refuses to swap for another concept's (`SubscriptionId` vs `PlanId`) | Typed id | [typed-ids.md](references/typed-ids.md) | [java/typed-ids.md](references/java/typed-ids.md) |
| The base classes everything extends (the skill's own, in the shared kernel) | `shared/domain` | [base-classes.md](references/base-classes.md) | [java/base-classes.md](references/java/base-classes.md) |
| Failing — which error type, which channel: rule refused or use case blocked → returned in `Result` (TypeScript) or thrown as a named exception (Java); infra down → thrown | `DomainError` / `ApplicationError` / `InfrastructureError`; in Java `DomainException` / `ApplicationException` / `InfrastructureException` | [domain-errors.md](references/domain-errors.md) | [java/domain-errors.md](references/java/domain-errors.md) |
| Loading and saving aggregates without the domain knowing the database | Repository port | [repository.md](references/repository.md) | [java/repository.md](references/java/repository.md) |
| The layers around the domain — write via commands, read via direct queries, controllers, infra | Lightweight CQRS | [application-cqrs.md](references/application-cqrs.md) | [java/application-cqrs.md](references/java/application-cqrs.md) |
| Calling an external service (payment, mail, third-party API) without the SDK leaking inward | Gateway port | [gateway.md](references/gateway.md) | [java/gateway.md](references/java/gateway.md) |
| A read-side query with JOIN/GROUP BY/pagination that must survive data growth | `sql-quality` skill | `<skill-dir>/../sql-quality/SKILL.md` — `<skill-dir>` is the directory that contains this `SKILL.md` | same |

Read the reference for the block you are about to write — each carries the house template and the reasons behind it.

## The house pattern in one glance (TypeScript)

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

Why the constructor is private and empty: a `new` that throws forces try/catch on every caller and cannot return a rich, named error. `create` returns a `Result` — the caller routes on the error, nothing explodes mid-flow. And the names say what is happening: `create` is a domain birth, `restore` is rehydration. Java keeps the three doors and throws from `create` instead: [java/entity-aggregate.md](references/java/entity-aggregate.md).

## Per-project decisions (settle them once, at the first aggregate)

Write each answer in the project's decisions file (above), with a pointer to the ADR that holds the reasons where the project keeps them: the next session reads the decision, and the code never mixes two answers.

- **Does `restore` validate?** Greenfield: yes, same rules as `create` — the database was born under the invariant, and a violation there is corruption worth failing loudly on. Legacy: no — a validating `restore` makes invalid rows UNREADABLE, so nobody can even load them to fix them. Lenient restore then pairs with a validating save: you can read broken data, you cannot persist more of it. The debt only shrinks — a ratchet applied to data. Full pattern in [entity-aggregate.md](references/entity-aggregate.md).
- **Which id recipe?** TypeScript: the branded primitive unless the project has reason to pay for a class per concept — [typed-ids.md](references/typed-ids.md) prices both. Java has one recipe, a record per concept.
- **Domain events on or off?** The `AggregateRoot` base collects them, but wire a dispatcher only when some effect genuinely needs decoupling. Publishing events nobody consumes is ceremony.

## Where things live (package by feature)

The tree, the import rule and the file names below are TypeScript's. Java's packages, class names and import line are in [java/layout.md](references/java/layout.md).

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
    ├── controllers/               routes/handlers - call commands/queries, map the returned errors once
    └── requests/                  input contracts with SHAPE validation (zod/class-validator)
src/shared/                        the kernel, layered like a feature (same import direction)
├── domain/                        base classes + universal types (Money, Brand, Result, DomainError)
├── application/                   ApplicationError + the UseCaseError union
├── infra/                         InfrastructureError (the only thrown house error)
└── presentation/                  the global filter for the thrown channel
```

The write/read asymmetry is deliberate — commands pay the port ceremony because they protect invariants; queries go straight to the database because reads have none to protect. The full contract is in [application-cqrs.md](references/application-cqrs.md).

**What "pure" means for imports (TypeScript)** — the domain never imports frameworks, ORMs, I/O clients or anything with runtime wiring. It MAY import **pure computation libraries** (date-fns, decimal.js, big.js): deterministic functions with no I/O are the standard library JavaScript forgot to ship, and rewriting month arithmetic or decimal math by hand to satisfy a diagram trades real correctness for fake purity. Two conditions keep this honest: the library does computation only, and its types never cross a public domain signature (compute inside, emerge holding your own types — `Money` in, `Money` out).

**File naming (TypeScript)** — kebab-case with the type as a suffix, so the structure itself is greppable (`**/*.vo.ts`) and a case-only rename never breaks on a case-sensitive filesystem; per block:

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
| error mapper (returned channel) / filter (thrown channel) | `use-case-error.mapper.ts` per feature / `thrown-error.filter.ts` once in shared |
| shared-kernel base classes | no suffix (`value-object.ts`, `aggregate-root.ts`) — the name already is the type |

The TypeScript base classes import **no framework** — integration with NestJS (or anything else) is an adapter at the edge, never inheritance in the domain. The why and the adapter recipe are in [base-classes.md](references/base-classes.md). The Java kernel carries Spring Data mapping labels and nothing else of Spring: [java/base-classes.md](references/java/base-classes.md).
