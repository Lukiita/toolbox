// Threshold-kind fitness functions as ESLint rules - the complement to the
// ratchet. The ratchet gates on DIRECTION over legacy debt; these gate on a
// hard THRESHOLD and suit new code / new projects, where there is no debt to
// freeze. Copy what applies into the project's eslint config (flat config);
// on a legacy repo, prefer the ratchet metrics over flipping these to error.
//
// Requires: typescript-eslint (and @vitest/eslint-plugin for the last block).

// @ts-check
import tseslint from 'typescript-eslint';

// ddd-tactical (typed-ids.md): a type assertion forges a typed id - `raw as
// SubscriptionId` compiles, and in the class recipe so does `{ value } as
// SubscriptionId`. The selector fails an assertion whose target NAMES an id
// type, anywhere but inside the factory object that holds the only
// legitimate ones. Leans on the house naming: id types are `<Concept>Id`.
//
// The first cut exempted every declarator whose name ended in `Id`, so
// `const subscriptionId = raw as SubscriptionId` - the most natural forge -
// passed (review 2026-10-05). The exemption is now the factory itself: a
// PascalCase `*Id` constant initialised with an object literal.
//
// Run against ESLint 9.39 and 10.7 with typescript-eslint 8 (2026-10-05), 20
// forges fail: plain `as`, double cast, `<XId>raw`, a camelCase `*Id` variable,
// a union, an array, a tuple, a generic (`Promise<XId>`), a qualified name, an
// import type, `Brand<'X'>` itself. The factories pass, with or without
// `as const` / `satisfies`. What it cannot see: another concept's id asserted
// INSIDE a factory object; an assertion to a type that only CONTAINS an id
// (`{ id: raw } as SubscriptionProps`); an alias that renames the id type.
// `@typescript-eslint/no-unsafe-type-assertion` (type-aware) closes those too,
// at the price of refusing every narrowing assertion.
const ID_TYPE =
  ":matches(TSTypeReference[typeName.name=/Id$/], TSTypeReference[typeName.right.name=/Id$/], TSTypeReference[typeName.name='Brand'], TSImportType[qualifier.name=/Id$/])";
const ID_FACTORY =
  "VariableDeclarator[id.name=/^[A-Z]\\w*Id$/]:matches([init.type='ObjectExpression'], [init.expression.type='ObjectExpression'])";
const FORGED_ID = `:matches(TSAsExpression, TSTypeAssertion) > .typeAnnotation:matches(${ID_TYPE}, :has(${ID_TYPE})):not(${ID_FACTORY} *)`;
const FORGED_ID_MESSAGE =
  'An id is named only by its own factories: call <Concept>Id.restore(value) (ddd-tactical, typed-ids.md).';

export default tseslint.config({
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  rules: {
    // AGENTS.md: the signature is the agent's ground truth. `public` is the
    // default in TS - writing it anyway is deliberate: intent stated, not
    // inherited. Return types are declared; inference is acceptable only for
    // genuinely complex library-internal types, via a one-off disable comment
    // that states the reason.
    '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      {
        // Inline callbacks stay inferable - annotating every `.map(x => ...)`
        // is noise, and the surrounding signature already pins the types.
        allowExpressions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      },
    ],

    // AGENTS.md bans new `any`. On a fresh project this can be a hard error;
    // on legacy it breaks the build on day one - that repo uses the ratchet's
    // `explicit-any` metric instead (see any-count.mts for the reasoning).
    '@typescript-eslint/no-explicit-any': 'error',

    // Cyclomatic complexity, hard mode. New code can hold the strict limit
    // (Richards & Ford: < 5 reads as cohesive, well-factored); legacy repos
    // use the ratchet's `cc-over-limit` count instead of this rule.
    complexity: ['error', 5],

    // AGENTS.md: max 2 indentation levels - early returns over nested ifs.
    'max-depth': ['error', 2],

    // ddd-tactical (typed-ids.md): an id is named only by its own factories.
    'no-restricted-syntax': ['error', { selector: FORGED_ID, message: FORGED_ID_MESSAGE }],
  },
});

// For test files, one more threshold-kind fitness function closes the classic
// coverage cheat (a test that "examines" the code but asserts nothing still
// counts as covered - Fundamentals of Software Architecture, ch. 6). It is
// the third net behind the tlc Verifier's discrimination sensor and the
// test-adequacy review:
//
//   import vitest from '@vitest/eslint-plugin';
//   { files: ['**/*.test.ts'], plugins: { vitest }, rules: { 'vitest/expect-expect': 'error' } }
