# Repositories

The repository is how an aggregate crosses the persistence boundary without the domain learning what a database is. Two halves, two layers:

- **The port** — an interface in the feature's `domain/`, written in domain language, importing nothing but the domain.
- **The implementation** — in the feature's `infra/`, where the ORM/driver/SDK lives.

```ts
// <feature>/domain/subscription.repository.ts  (the port)
import type { Result } from '@/src/shared/domain/result';
import type { DomainError } from '@/src/shared/domain/domain-error';
import type { Subscription, SubscriptionId } from './subscription.aggregate';

export interface SubscriptionRepository {
  findById(id: SubscriptionId): Promise<Subscription | null>; // typed id: a PlanId here does not compile
  // Result because of the legacy data ratchet below (a rule refusal). A
  // greenfield project with a validating restore has nothing to refuse here:
  // `Promise<void>`. Infra failure is NOT in the signature either way - it throws.
  save(subscription: Subscription): Promise<Result<void, DomainError>>;
}
```

```ts
// <feature>/infra/repositories/subscription.mapper.ts
// The ONLY place that knows both worlds: column names on one side,
// restore()/snapshot() on the other. The repository never touches either.
import {
  PlanId,
  Subscription,
  SubscriptionId,
  type SubscriptionProps,
} from '../../domain/subscription.aggregate';

/** The row as the table speaks it - column names live HERE and nowhere else. */
export interface SubscriptionRow {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string;
}

export class SubscriptionMapper {
  public static toDomain(row: SubscriptionRow): Subscription {
    return Subscription.restore({
      id: SubscriptionId.from(row.id),
      planId: PlanId.from(row.plan_id), // typed ids: swapping the columns here would not compile
      status: row.status as SubscriptionProps['status'],
      currentPeriodEnd: new Date(row.current_period_end),
    });
  }

  public static toPersistence(subscription: Subscription): SubscriptionRow {
    const props = subscription.snapshot(); // readonly copy - the persistence door on Entity
    return {
      id: props.id.value,
      plan_id: props.planId.value,
      status: props.status,
      current_period_end: props.currentPeriodEnd.toISOString(),
    };
  }
}
```

```ts
// <feature>/infra/repositories/supabase-subscription.repository.ts  (the adapter)
import type { SupabaseClient } from '@supabase/supabase-js';

import type { DomainError } from '@/src/shared/domain/domain-error';
import { Result } from '@/src/shared/domain/result';
import { InfrastructureError } from '@/src/shared/infra/infrastructure-error';
import type { Subscription, SubscriptionId } from '../../domain/subscription.aggregate';
import type { SubscriptionRepository } from '../../domain/subscription.repository';
import { SubscriptionMapper, type SubscriptionRow } from './subscription.mapper';

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async findById(id: SubscriptionId): Promise<Subscription | null> {
    const { data } = await this.client
      .from('subscriptions')
      .select('*')
      .eq('id', id.value)
      .maybeSingle<SubscriptionRow>();
    if (!data) return null;
    return SubscriptionMapper.toDomain(data); // rehydration - restore lives inside the mapper
  }

  public async save(subscription: Subscription): Promise<Result<void, DomainError>> {
    // Legacy-mode projects enforce the data ratchet here: readable broken
    // rows stay readable, but nothing WORSE gets persisted (entity-aggregate.md).
    const violations = subscription.violations();
    if (violations.length > 0) return Result.fail(violations[0]);

    const { error } = await this.client
      .from('subscriptions')
      .upsert(SubscriptionMapper.toPersistence(subscription));
    if (error) {
      // Infra failed, no rule refused: THROWN, per the domain-errors table.
      // The handler has nothing to route on; the global filter turns this
      // into a 503 and logs `cause`. The Supabase error type stops here.
      throw new InfrastructureError(
        'subscription.persistence-failed',
        `upsert of subscription ${subscription.id.value} failed: ${error.message}`,
        { cause: error },
      );
    }
    return Result.ok(undefined);
  }
}
```

## The rules

- **One repository per aggregate root** — never per table, never per inner entity. Loading or saving part of an aggregate is how invariants rot: the boundary is atomic, the repository respects it.
- **Domain language in the port.** `findActiveByPlan`, not `queryWhere`. The port's methods document which lookups the domain actually needs — resist generic `findAll(filter)` escapes that turn the port into SQL with extra steps.
- **The mapper is its own file** (`subscription.mapper.ts`, beside the repository): a class with static `toDomain`/`toPersistence`. It is the only place that knows both worlds — column names on one side, `restore`/`snapshot` on the other — which keeps the repository pure orchestration and gives the mapping its own unit tests.
- **Rule refusals return, infra failures throw.** `save` returns `Result` only for what the *domain* can refuse (the legacy ratchet); a driver error is wrapped in a thrown `InfrastructureError` with the driver's error as `cause`. Returning `Result.fail` for a db outage would make every handler route on something it cannot handle ([domain-errors.md](domain-errors.md)).
- **Reads that bypass the domain are fine — for reading.** That is the house's read side: queries go straight to the database and return read models ([application-cqrs.md](application-cqrs.md)). The rule is one-directional: every WRITE goes through the aggregate. The moment a "read" path starts updating rows, it has become a smuggled write model.
- Dependency direction is enforced mechanically: `domain/` importing an ORM fails the layer rules (dependency-cruiser template). The port-in-domain shape is what makes that possible.
