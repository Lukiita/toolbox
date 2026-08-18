# Application, Infra and Presentation — CQRS around the domain

The domain owns the rules; the layers around it move data in and out. The house style is **lightweight CQRS — even on a single database**: commands and queries are separate paths with deliberately different rules, not separate infrastructures. No event sourcing, no second store, no bus — those enter only when their problem shows up.

## The asymmetry (the whole idea in one table)

| | Command (write) | Query (read) |
|---|---|---|
| Purpose | change state, protect invariants | project data for a screen/report |
| Path | handler → aggregate → repository **port** | straight to the database, ORM inline |
| Returns | `Result<void \| Id, DomainError>` | a **read model** shaped for the consumer |
| Ceremony | pays for dependency inversion | deliberately skips it |

Why the sides differ: a repository exists to load *aggregates*, and an aggregate is a **write-consistency boundary**, not a read format. A screen wants joins, projections, pagination — loading aggregates to list them is slow and wrong. Reads have no invariant to protect, so they do not pay the port tax. The write boundary stays sacred: **every state change goes through the aggregate** ([repository.md](repository.md)); the read boundary is pragmatic — a join mutates nothing.

## Commands

```ts
// <feature>/application/commands/renew-subscription.command.ts
import { DomainError } from '@/src/shared/domain/domain-error';
import { Result } from '@/src/shared/domain/result';
import { SubscriptionId } from '../../domain/subscription.aggregate';
import type { SubscriptionRepository } from '../../domain/subscription.repository';

export interface RenewSubscriptionCommand {
  subscriptionId: string;
}

export class RenewSubscriptionHandler {
  // Ports injected through the constructor (AGENTS.md) - the handler never
  // knows which database implements them.
  public constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: () => Date,
  ) {}

  public async execute(command: RenewSubscriptionCommand): Promise<Result<void, DomainError>> {
    const subscription = await this.subscriptions.findById(SubscriptionId.from(command.subscriptionId));
    if (!subscription) {
      return Result.fail(
        new DomainError('subscription.not-found', `no subscription for id ${command.subscriptionId}`),
      );
    }

    const renewed = subscription.renew(this.clock());
    if (renewed.isFail()) return renewed;

    return this.subscriptions.save(subscription);
  }
}
```

The rules that keep a handler honest:

- **Thin.** Load → call the aggregate method → save. Business logic appearing here is the anemic model sneaking back in through the application door — push it down into the aggregate.
- **One handler, one transaction.** The command handler is the transactional boundary; if the save and the event publishing must be atomic, this is where the unit of work lives.
- **A command handler IS the write-side use case** — the CQRS naming replaces `.use-case.ts`, it does not add a layer on top of it.
- Events, when the project turned them on: after a successful save, `pullDomainEvents()` and hand them to the dispatcher ([base-classes.md](base-classes.md)).

## Queries

```ts
// <feature>/application/queries/list-active-subscriptions.query.ts
//
// The read side goes STRAIGHT to the database - deliberately. No repository,
// no aggregate: reads have no invariant to protect, and the port tax would
// buy indirection, not safety. The ORM/driver import here is the documented
// exception to application purity - for the read path only.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Read model: shaped for the consumer, owned by this query - never an ORM
 *  row type and never a domain aggregate leaking out. */
export interface ActiveSubscriptionRow {
  id: string;
  planName: string;
  currentPeriodEnd: string;
}

export class ListActiveSubscriptionsQuery {
  public constructor(private readonly db: SupabaseClient) {}

  public async execute(planId?: string): Promise<ActiveSubscriptionRow[]> {
    // join, filter, paginate - whatever the screen needs. HOW the SQL stays
    // cheap as data grows (fan-out, paginate-first) is the sql-quality skill.
    /* select from subscriptions join plans ... map to ActiveSubscriptionRow */
    return [];
  }
}
```

The four rules that keep the read side from rotting:

1. **A query never writes.** No insert/update/delete, ever — the moment a "read" path touches state it has become a smuggled write model, and the invariants it bypasses will break silently.
2. **A query returns its own read model.** Never the ORM's row type (couples every consumer to the schema), never a domain aggregate (that is the write model's shape, and rehydrating it for display is the cost CQRS exists to avoid).
3. **Cross-table reads are fine; the file still has one home.** A report may join tables owned by several features — the join mutates nothing. The query file lives in the feature that owns the *question* (the screen/report), and the cross-feature import rule stays about code, not tables.
4. **A query's cost is bounded by its output.** Skipping the port does not mean skipping the scan bound: joins that cross independent 1:N branches, aggregation before pagination, scans with no WHERE — that whole shape discipline is its own skill. Before writing any query with a JOIN or GROUP BY, load `~/.agents/skills/sql-quality/references/query-shape.md`.

## Presentation

Controllers, routes, UI handlers — the translation layer, and nothing else:

```ts
// <feature>/presentation/requests/renew-subscription.request.ts
// The input contract: SHAPE validation only (present? a uuid?). Rule
// validation lives in the domain - this file never knows what makes a
// renewal legal.
export const renewSubscriptionRequest = z.object({ subscriptionId: z.string().uuid() });

// <feature>/presentation/controllers/subscription.controller.ts (NestJS flavor; same shape anywhere)
public async renew(@Param('id') id: string) {
  const input = renewSubscriptionRequest.parse({ subscriptionId: id });
  const result = await this.renewSubscription.execute(input);
  if (result.isFail()) throw toHttpException(result.error);
  return { ok: true };
}
```

- **Shape vs rule:** the request contract checks the envelope (types, presence, format); the domain checks the business. Duplicating rule checks in the controller is drift waiting to happen.
- **The single error mapping** promised in [domain-errors.md](domain-errors.md) lives here — one file per presentation:

```ts
// <feature>/presentation/controllers/domain-error.mapper.ts (NestJS flavor)
import { ConflictException, HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import type { DomainError } from '@/src/shared/domain/domain-error';

// Route by PREFIX or exact code - whichever reads better per feature. The
// fallback is 422: an unmapped DomainError is still a rule refusal, never a
// 500 (a 500 means a bug, and rule refusals are not bugs).
const BY_CODE: Record<string, (e: DomainError) => HttpException> = {
  'subscription.not-found': (e) => new NotFoundException(e.message),
  'subscription.canceled': (e) => new ConflictException(e.message),
};

export function toHttpException(error: DomainError): HttpException {
  const build = BY_CODE[error.code] ?? ((e: DomainError) => new UnprocessableEntityException(e.message));
  return build(error);
}
```
- Presentation calls commands and queries; it may see domain **types** (`DomainError`, a VO to format) but never touches repositories or the ORM — if a controller needs data, that is a query waiting to be written.

## Infra

The outside of the ports, organized by kind:

- **`repositories/`** — port implementations plus their mappers ([repository.md](repository.md)): each aggregate gets a `subscription.mapper.ts` beside its repository — a class with static `toDomain`/`toPersistence`, the only code that knows both column names and `restore`/`snapshot`.
- **`gateways/`** — adapters for external services (payment provider, mail, a third-party API). Same inversion as repositories: the port (`payment.gateway.ts`) sits in `domain/` when a rule depends on it, the adapter (`stripe-payment.gateway.ts`) sits here.

Frameworks live here and in presentation — never below. Note what does NOT live here: queries (they sit in `application/queries/`, ORM inline — the read path's documented shortcut skips this layer entirely).

## Where everything lives

```
src/<feature>/
├── domain/                        aggregates, VOs, ports, errors (the other references)
├── application/
│   ├── commands/                  renew-subscription.command.ts   (write: via port + aggregate)
│   └── queries/                   list-active-subscriptions.query.ts  (read: ORM inline + read model)
├── infra/
│   ├── repositories/              supabase-subscription.repository.ts + subscription.mapper.ts
│   └── gateways/                  stripe-payment.gateway.ts
└── presentation/
    ├── controllers/               subscription.controller.ts
    └── requests/                  renew-subscription.request.ts (shape validation)
```
