# Entities and Aggregates

An **entity** has identity: it stays the same thing while its state changes (a Subscription is the same subscription after renewal). An **aggregate** is the consistency boundary: the cluster of entities and value objects that must change together for an invariant to hold, reached only through its **root**. An entity guarding its own invariant alone is already a single-element aggregate — most of the time that is all you need.

Deciding the boundary is the three-questions exercise from SKILL.md. One test that settles most disputes: *if these two things can be correct independently for a moment, they belong to different aggregates; if they cannot, they are one.*

## The factory pattern (the heart of the house style)

```ts
// <feature>/domain/subscription.aggregate.ts
import { addMonths } from 'date-fns'; // pure computation lib - allowed in the domain (see SKILL.md)

import { AggregateRoot } from '@/src/shared/domain/aggregate-root';
import { DomainError } from '@/src/shared/domain/domain-error';
import { Identifier } from '@/src/shared/domain/identifier';
import { Result } from '@/src/shared/domain/result';

// The typed id lives with its owner and is exported from here. The private
// brand is what makes it nominal - without it, TypeScript's structural typing
// would still accept a PlanId in a SubscriptionId slot (base-classes.md).
export class SubscriptionId extends Identifier<string> {
  private readonly __brand!: 'SubscriptionId';
  public static from(value: string): SubscriptionId {
    return new SubscriptionId(value);
  }
}

// In real code PlanId is exported from plan.aggregate.ts - declared here only
// to keep the example self-contained.
export class PlanId extends Identifier<string> {
  private readonly __brand!: 'PlanId';
  public static from(value: string): PlanId {
    return new PlanId(value);
  }
}

// Exported: restore() and the repository mapper speak this type.
export interface SubscriptionProps {
  id: SubscriptionId;
  planId: PlanId; // the compiler now refuses id/planId swapped anywhere
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date;
}

type CreateSubscriptionInput = Omit<SubscriptionProps, 'id' | 'status'>;

export class Subscription extends AggregateRoot<SubscriptionProps> {
  // Always private, never validates. A `new` that throws forces try/catch on
  // every caller and cannot return a rich, named error - so `new` is not the
  // public door.
  private constructor(props: SubscriptionProps) {
    super(props);
  }

  // The domain birth: ALL validation lives here. Born valid or not born at all.
  public static create(input: CreateSubscriptionInput): Result<Subscription, DomainError> {
    if (input.currentPeriodEnd.getTime() <= Date.now()) {
      return Result.fail(
        new DomainError(
          'subscription.period-in-past',
          `currentPeriodEnd must be in the future, received ${input.currentPeriodEnd.toISOString()}`,
        ),
      );
    }
    return Result.ok(
      new Subscription({
        ...input,
        id: SubscriptionId.from(crypto.randomUUID()),
        status: 'active',
      }),
    );
  }

  // Rehydration from persistence. Whether it validates is a per-project
  // decision - see "The restore decision" below.
  public static restore(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  // Behavior lives ON the aggregate. State changes only through methods that
  // hold the invariant - there are no public setters, ever.
  public renew(now: Date): Result<void, DomainError> {
    if (this.props.status === 'canceled') {
      return Result.fail(
        new DomainError('subscription.canceled', 'a canceled subscription cannot renew'),
      );
    }
    // rolling clock: the new period anchors on the PREVIOUS end, not on `now` -
    // renewing early must not shorten what was already paid for
    const anchor = this.props.currentPeriodEnd.getTime() > now.getTime()
      ? this.props.currentPeriodEnd
      : now;
    this.props.currentPeriodEnd = addMonths(anchor, 1);
    return Result.ok(undefined);
  }
}
```

Why three doors instead of one public constructor:

- **`create`** speaks the domain birth. It validates everything, generates identity, sets the legal initial state. Its input type (`CreateSubscriptionInput`) excludes what a caller may not choose (`id`, `status`) — illegal initial states are unrepresentable in the signature itself.
- **`restore`** speaks rehydration. Persistence already holds the full props (id included); re-running birth rules there is a category error — see below.
- **The constructor** is plumbing shared by both, and private so no caller can bypass the doors.

## The restore decision (per project, settled at the first aggregate)

**Greenfield — restore validates.** Every row was written through `create` and the validating save; a violation on read is corruption, and failing loudly at the source beats failing weirdly three layers up.

**Legacy — restore is lenient, save validates.** A legacy database holds rows that predate the invariant. If `restore` validates, those rows become *unreadable*: nobody can load them even to fix them — the guard rail turns into a locked door. So the leniency is on read only, and the write side holds the line:

```ts
// restore stays permissive, and the aggregate can report its violations:
public violations(): DomainError[] { /* run the create-time checks, return findings */ }

// the repository (or use case) refuses to persist what got WORSE:
public save(subscription: Subscription): Promise<Result<void, DomainError>> {
  const violations = subscription.violations();
  if (violations.length > 0) return Result.fail(violations[0]);
  // ...
}
```

You can read broken data, triage it (`violations()` over a batch), fix it — and the system never persists new damage. The debt only shrinks: a ratchet applied to data. Record which mode the project uses in an ADR; the two modes must not mix silently.

## Rules that keep the model rich

- **No public setters.** Every state change is a named method that checks the invariant (`renew`, `cancel`, `suspend`) — the method names become the ubiquitous language in code.
- **Time and randomness come in as arguments** (`now: Date`, injected id generators) when the rule depends on them — an aggregate that reads the wall clock cannot be tested at the boundary (the rolling-clock rule above is exactly the kind of rule that dies untested otherwise).
- **Return `Result`, don't throw**, for expected rule failures. Throwing is for bugs; see [domain-errors.md](domain-errors.md).
- **Keep the aggregate small.** Big aggregates serialize writes and bloat transactions. If two parts never need to be consistent in the same instant, split them and reference by id.
