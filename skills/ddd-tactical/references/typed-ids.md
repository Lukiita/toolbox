# Typed ids

Every id is a typed id, named `<Concept>Id`. TypeScript compares types by shape, so `subscriptionId: string` and `planId: string` are one type: a swap compiles, lints and passes every test that does not happen to hit that line. That is why an id is never a bare `string`, the common shape in TypeScript DDD examples. A typed id gives each concept a type of its own and the swap becomes a compile error — connascence of *type*, used in your favor.

Two recipes do it. A project uses **one**: the brand below, unless its decisions file names the class ([SKILL.md](../SKILL.md) § Project decisions come first).

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

- **The id IS its primitive when the program runs.** The brand ([base-classes.md](base-classes.md)) exists for the compiler only, so `===`, `includes`, `Map` and `Set` keys, JSON and template strings treat the id as the text it is. JavaScript compares objects by reference and gives no hook to change that; an id wrapped in an object pays for it everywhere (the class recipe below), which is why the brand is the default.
- **Two doors hold the only two `as`.** `create` mints, `restore` names; every other id in the codebase came out of one of them. The names are this skill's choice, matching the aggregate's own doors — other ecosystems say `new`, `parse` or `from`, and none of them is a standard.
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

- **Where an id is accepted as plain text, the brand is gone.** Two ids of different concepts that both reached a `string` parameter compare as text. With UUIDs two concepts never share a value; with serial keys they do (plan 5, subscription 5) — a project on serial keys weighs the class recipe below.
- **An assertion forges an id.** The typed-id block of `templates/quality-gate/eslint.fitness.example.mjs` in `@lukiita/toolbox` fails an assertion whose target names an id type — `<Concept>Id` bare or inside a union, an array, a tuple or a generic, or `Brand<…>` itself — anywhere but inside a factory object. Copy it into the project's lint config with the first typed id; its header lists what it cannot see.

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
  // `declare`: the field exists for the compiler only. Written as
  // `__brand!: 'SubscriptionId'` it is emitted under an ES2022 target as a
  // real property, `undefined` on every instance, visible in logs and spreads.
  public declare readonly __brand: 'SubscriptionId';

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

- **`Entity` and `AggregateRoot`** constrain `Props extends { id: Identity }`, and `Entity.equals` compares with `other.id.equals(this.id)`.
- **Every edge unwraps with `.value`**: the mapper (`id: props.id.value`), a query filter (`.eq('id', id.value)`), a log or an error message (`${subscription.id.value}`). An id object dropped into a template string prints `[object Object]`, into JSON `{"value":"…"}`, and the compiler accepts both.
- **Equality is `equals`, every time.** Two instances of one value are two objects: `a === b` is `false`, `ids.includes(id)` is `false`, a `Map` keyed by the id never finds it, and none of it is a compile error. Compare with `a.equals(b)`, search with `ids.some((id) => id.equals(wanted))`, key collections by `id.value`. In the project this recipe comes from (project-d) that price showed up once: the one list lookup in its domain takes `string[]` in place of the typed id.
- **Ids share a contract and nothing else.** Rules two ids have in common (minting a value, checking a stored one) are functions in the kernel. The base class this skill once shipped (`Identifier`) is gone: its `equals` answered `true` across sibling concepts, every id redeclared its factory anyway, and a subclass that forgot the brand line compiled (`Lukiita/toolbox#2`, `#4`).

## The two recipes side by side

| | Brand (default) | Class per concept |
|---|---|---|
| Swap, raw value, comparison across concepts | compile error | compile error |
| `===`, `includes`, `Map` and `Set` keys | work | silently `false` — `equals` instead |
| Id passed where text is expected | compiles | compile error |
| Where the id meets text (rows, filters, logs) | nothing to unwrap | `.value`, every time |
| Forged by an assertion | from any string | from an object literal (`{ value } as SubscriptionId`) |
| Types lost while running (`any`, a `string` parameter) | compares as text | still tells the concepts apart |

The same lint rule holds the forge in both. The study behind the default is in `Lukiita/toolbox#4` (2026-10-05): languages with a type per id either erase it to the primitive (Kotlin `value class`, Scala `opaque type`, Rust newtype, Go named type) or wrap it in a value the language compares by content (Java `record`, C# `record struct`). A TypeScript class is the wrapper without the comparison, so the brand is the faithful translation.
