# Application, Infra and Presentation — CQRS around the domain

The domain owns the rules; the layers around it move data in and out. The house style is **lightweight CQRS — even on a single database**: commands and queries are separate paths with deliberately different rules, not separate infrastructures. No event sourcing, no second store, no bus — those enter only when their problem shows up.

## The asymmetry (the whole idea in one table)

| | Command (write) | Query (read) |
|---|---|---|
| Purpose | change state, protect invariants | project data for a screen/report |
| Path | handler → aggregate → repository **port** | straight to the database, ORM inline |
| Returns | `Result<void \| Id, UseCaseError>` | a **read model** shaped for the consumer |
| Ceremony | pays for dependency inversion | deliberately skips it |

Why the sides differ: a repository exists to load *aggregates*, and an aggregate is a **write-consistency boundary**, not a read format. A screen wants joins, projections, pagination — loading aggregates to list them is slow and wrong. Reads have no invariant to protect, so they do not pay the port tax. The write boundary stays sacred: **every state change goes through the aggregate** ([repository.md](repository.md)); the read boundary is pragmatic — a join mutates nothing.

## Commands

```ts
// <feature>/application/commands/renew-subscription.command.ts
import { ApplicationError, type UseCaseError } from '@/src/shared/application/application-error';
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

  // UseCaseError = DomainError | ApplicationError: the signature says the
  // handler can fail because a RULE refused or because it never REACHED the
  // rule. An InfrastructureError is not in the signature - it is thrown.
  public async execute(command: RenewSubscriptionCommand): Promise<Result<void, UseCaseError>> {
    const subscription = await this.subscriptions.findById(SubscriptionId.from(command.subscriptionId));
    if (!subscription) {
      // The aggregate never says "not found" - the HANDLER does. That makes it
      // an application outcome, not a domain refusal (domain-errors.md).
      return Result.fail(
        new ApplicationError('subscription.not-found', `no subscription for id ${command.subscriptionId}`),
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
- **No try/catch.** A handler routes on what comes back in `Result`; what is thrown (an `InfrastructureError` from the repository, a bug) has nothing a handler can do about it, so it passes through untouched to the global filter. A `catch` here is either swallowing a bug or re-implementing the filter.
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
- **Two channels, two single points of translation** ([domain-errors.md](domain-errors.md)): the *returned* union is mapped per feature, the *thrown* type is mapped once per app.

The returned channel — one mapper per feature, because domain codes are feature-specific:

```ts
// <feature>/presentation/controllers/use-case-error.mapper.ts (NestJS flavor)
import { ConflictException, HttpException, UnprocessableEntityException } from '@nestjs/common';

import type { UseCaseError } from '@/src/shared/application/application-error';
import type { DomainError } from '@/src/shared/domain/domain-error';
import { applicationErrorToHttp } from '@/src/shared/presentation/application-error.mapper';

// Rule refusals route by exact code. The fallback is 422: an unmapped
// DomainError is still a rule refusal, never a 500 (500 means bug).
const DOMAIN_BY_CODE: Record<string, (e: DomainError) => HttpException> = {
  'subscription.canceled': (e) => new ConflictException(e.message),
};

export function toHttpException(error: UseCaseError): HttpException {
  // Exhaustive on `kind`: add a third returned type and this stops compiling
  // until it is handled - that is the discriminant earning its keep.
  switch (error.kind) {
    case 'domain': {
      const build = DOMAIN_BY_CODE[error.code] ?? ((e: DomainError) => new UnprocessableEntityException(e.message));
      return build(error);
    }
    case 'application':
      return applicationErrorToHttp(error);
  }
}
```

```ts
// shared/presentation/application-error.mapper.ts (NestJS flavor)
//
// Application outcomes share one small vocabulary across every feature
// (not-found / forbidden / stale), so the mapping lives ONCE in shared -
// a copy per feature would be connascence of algorithm across features.
import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

import type { ApplicationError } from '../application/application-error';

// Routes by the SUFFIX of '<concept>.<outcome>'. The fallback is 409, not
// 422: the request was well-formed and no rule refused it - the world moved.
const BY_OUTCOME: Record<string, (e: ApplicationError) => HttpException> = {
  'not-found': (e) => new NotFoundException(e.message),
  forbidden: (e) => new ForbiddenException(e.message),
  stale: (e) => new ConflictException(e.message),
};

export function applicationErrorToHttp(error: ApplicationError): HttpException {
  const outcome = error.code.split('.').pop() ?? '';
  const build = BY_OUTCOME[outcome] ?? ((e: ApplicationError) => new ConflictException(e.message));
  return build(error);
}
```

The thrown channel — one global filter per app, the only place `instanceof InfrastructureError` is ever written:

```ts
// shared/presentation/thrown-error.filter.ts (NestJS flavor; an Express error
// middleware has the same three branches)
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { InfrastructureError } from '../infra/infrastructure-error';

// Three outcomes, by type:
//   HttpException       -> already translated (use-case mapper, shape validation): pass through
//   InfrastructureError -> 503: infra failed after the adapter gave up; client may retry, on-call is paged
//   anything else       -> 500: a bug. Never echo the message; always log the stack
@Catch()
export class ThrownErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrownErrorFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof InfrastructureError) {
      // Structured JSON (AGENTS.md): `code` is the greppable field, `cause` is the SDK error.
      this.logger.error({ code: exception.code, message: exception.message, cause: exception.cause });
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ code: exception.code, message: 'service temporarily unavailable' });
      return;
    }

    this.logger.error({ code: 'unhandled', error: exception });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal-error' });
  }
}
```

Register it once (`app.useGlobalFilters(new ThrownErrorFilter())`). The 503/500 split is the payoff: an alert on 503 says "something we depend on is down", an alert on 500 says "we shipped a bug" — two different people get paged.

- Presentation calls commands and queries; it may see domain **types** (`DomainError`, a VO to format) and the thrown infra type (for the filter's `instanceof`) but never touches repositories, gateways or the ORM — if a controller needs data, that is a query waiting to be written.

## Infra

The outside of the ports, organized by kind:

- **`repositories/`** — port implementations plus their mappers ([repository.md](repository.md)): each aggregate gets a `subscription.mapper.ts` beside its repository — a class with static `toDomain`/`toPersistence`, the only code that knows both column names and `restore`/`snapshot`.
- **`gateways/`** — adapters for external services (payment provider, mail, a third-party API). Same inversion as repositories: the port (`payment.gateway.ts`) sits in `domain/` when a rule depends on it, the adapter (`stripe-payment.gateway.ts`) sits here.
- **Both translate on the way out.** A provider *refusal* the flow routes on becomes a `DomainError` in `Result`; a provider *failure* becomes a thrown `InfrastructureError` wrapping the SDK error as `cause` — after the adapter's own retry/backoff/circuit breaker gave up. SDK error classes never leave this folder on either channel.

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
    ├── controllers/               subscription.controller.ts + use-case-error.mapper.ts
    └── requests/                  renew-subscription.request.ts (shape validation)
src/shared/                        the kernel, layered like a feature - each layer may import only its own and the ones below
├── domain/                        base classes, Money, Id, Result, domain-error.ts
├── application/                   application-error.ts (+ the UseCaseError union)
├── infra/                         infrastructure-error.ts
└── presentation/                  application-error.mapper.ts, thrown-error.filter.ts
```
