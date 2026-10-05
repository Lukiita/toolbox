# Typed ids

Every id is a typed id. TypeScript compares types by shape, so `subscriptionId: string` and `planId: string` are one type: a swap compiles, lints and passes every test that does not happen to hit that line. A typed id gives each concept a type of its own and the swap becomes a compile error — connascence of *type*, used in your favor.

Two recipes do it. A repository uses **one**: the brand below, unless its `PROJECT.md` names the class ([SKILL.md](../SKILL.md) § Project decisions come first).

## The house recipe: a branded primitive

```ts
// declared in the owning aggregate's file (subscription.aggregate.ts) and exported from there
import type { Brand } from '@/src/shared/domain/brand';

export type SubscriptionId = Brand<'SubscriptionId'>;
export const SubscriptionId = {
  /** A new identity: this context owns the concept, so it mints the value. */
  create: (): SubscriptionId => crypto.randomUUID() as SubscriptionId,
  /** Names a value that already exists - a row, a request, an event - as this identity. */
  restore: (value: string): SubscriptionId => value as SubscriptionId,
};
```

The type and the constant share a name on purpose: in a signature `SubscriptionId` is the type, in `SubscriptionId.restore(row.id)` it is the factory — one import, and the same call shape as an aggregate's `create`/`restore`.

- **The id IS its primitive when the program runs.** The brand ([base-classes.md](base-classes.md)) exists for the compiler only, so `===`, `includes`, `Map` and `Set` keys, JSON and template strings treat the id as the text it is. This is why the brand is the default: JavaScript compares objects by reference and gives no hook to change that, so an id wrapped in an object answers `false` to `a === b` for two ids of the same value, without a word from the compiler.
- **Two doors hold the only two `as`.** `create` mints, `restore` names; every other id in the codebase came out of one of them.
- **An id minted by another bounded context** gets its own type here with `restore` alone: this context cannot mint it and does not own its format, so it checks neither. Text crosses a context boundary; the type is declared again on the receiving side.
- **Format checks go inside `restore`**, and only for an id this context mints whose malformed stored value must fail loudly.
- **A serial key** brands a number: `Brand<'LegacyOrderId', number>`.

## What the compiler refuses, and what it cannot see

Measured with `tsc --strict` 5.9.3:

| Written | Result |
|---|---|
| a `PlanId` passed where a `SubscriptionId` is expected | TS2345 |
| a raw `'abc'` passed where a `SubscriptionId` is expected | TS2345 |
| `subscriptionId === planId` | TS2367 — the types have no overlap |
| `subscriptionIds.includes(planId)` | TS2345 |
| `const text: string = subscriptionId` | compiles — an id is still text |
| `raw as SubscriptionId` outside the two doors | compiles — the lint rule below refuses it |

The last two rows are the price of a brand:

- **Where an id is accepted as plain text, the brand is gone.** Two ids of different concepts that both reached a `string` parameter compare as text. With UUIDs two concepts never share a value; with serial keys they do (plan 5, subscription 5) — a repository on serial keys weighs the class recipe below.
- **An assertion forges an id.** The `no-restricted-syntax` block in `@lukiita/toolbox`'s `templates/quality-gate/eslint.fitness.example.mjs` fails every assertion to a `*Id` type outside a factory; copy it into the project's lint config with the first typed id.

## The alternative: a class per concept

The id is an object that knows its concept while the program runs. Choose it when that is worth its price: serial keys shared across concepts, no lint in the pipeline to hold the forge, or a codebase that wants every domain value to be a class.

```ts
// shared/domain/identity.ts - a contract, each id stands alone
export interface Identity<Name extends string = string> {
  readonly value: string;
  /** In the contract so that leaving it out is TS2420, where a forgotten line used to compile. */
  readonly __brand: Name;
  equals(other?: Identity<Name>): boolean;
}
```

```ts
// declared in the owning aggregate's file, as in the house recipe
import type { Identity } from '@/src/shared/domain/identity';

export class SubscriptionId implements Identity<'SubscriptionId'> {
  // Declared, never assigned: an initializer would put the field on every instance.
  public readonly __brand!: 'SubscriptionId';

  private constructor(public readonly value: string) {}

  public static create(): SubscriptionId {
    return new SubscriptionId(crypto.randomUUID());
  }

  public static restore(value: string): SubscriptionId {
    return new SubscriptionId(value);
  }

  public equals(other?: SubscriptionId): boolean {
    return other instanceof SubscriptionId && other.value === this.value;
  }
}
```

What changes around it:

- **`Entity`** constrains `Props extends { id: Identity }` and compares with `other.id.equals(this.id)`.
- **The mapper** unwraps on the way out (`id: props.id.value`); `restore` already wraps on the way in.
- **Equality is `equals`, every time.** Two instances of one value are two objects: `a === b` is `false`, `ids.includes(id)` is `false`, a `Map` keyed by the id never finds it, and none of it is a compile error. Compare with `a.equals(b)`, search with `ids.some((id) => id.equals(wanted))`, key collections by `id.value`. Where this was skipped in the project the recipe comes from (project-d), the one list lookup in its domain had taken `string[]` in place of the typed id.
- **Ids share a contract and nothing else.** Rules two ids have in common (minting a value, checking a stored one) are functions in the kernel. The base class this skill once shipped (`Identifier`) is gone: its `equals` answered `true` across sibling concepts, every id redeclared its factory anyway, and a subclass that forgot the brand line compiled (issues #2 and #4).

## The two recipes side by side

| | Brand (default) | Class per concept |
|---|---|---|
| Swap, raw value, comparison across concepts | compile error | compile error |
| `===`, `includes`, `Map` and `Set` keys | work | silently `false` — `equals` instead |
| Id passed where text is expected | compiles | compile error |
| Forged by an assertion | from any string | from an object literal (`{ value } as SubscriptionId`) |
| Types lost while running (`any`, a `string` parameter) | compares as text | still tells the concepts apart |
| At the persistence edge | nothing to unwrap | `.value` out |

The same lint rule holds the forge in both. The decision and the study behind it are in issue #4 (2026-10-05): languages with a type per id either erase it to the primitive (Kotlin `value class`, Scala `opaque type`, Rust newtype, Go named type) or wrap it in a value the language compares by content (Java `record`, C# `record struct`). A TypeScript class is the wrapper without the comparison, so the brand is the faithful translation.
