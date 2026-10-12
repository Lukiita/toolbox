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
// SubscriptionId`. The rule fails the forges an agent reaches for first and
// stays quiet on everything else: a guard that cries wolf gets disabled.
//
// Fails an assertion (`as`, or `<T>x`) whose target is an id type, a union
// with one, an array of them (`X[]`, `readonly X[]`, `Array<X>`), or
// `Brand<...>` applied. An id type is a non-generic type named `<Concept>Id` -
// the house naming, which this leans on. Passes: the factory (a function
// inside a PascalCase `*Id` constant, however the object is wrapped), an empty
// array literal (`[] as XId[]`, the reduce seed), a type parameter (`TId`), a
// generic helper (`WithId<T>`), a library's qualified type (`Types.ObjectId`).
//
// Two cuts came before this one (2026-10-05). The first exempted every
// declarator whose name ended in `Id`, so `const subscriptionId = raw as
// SubscriptionId` - the most natural forge - passed. The second matched an id
// name anywhere inside the target and failed `{} as Record<XId, number>`, a
// type parameter and a commerce `Brand` entity. Run on ESLint 9.39 and 10.7
// with typescript-eslint 8: 16 forges fail, 12 legitimate assertions and 4
// factory shapes pass.
//
// What it cannot see, by construction - it reads names, not types: an id
// inside another generic or a tuple (`Promise<XId>`), a qualified name or an
// import type, an indexed access (`SubscriptionProps['id']`), `as never`, a
// type parameter constrained to an id, an alias that renames the id type,
// another concept's id asserted inside a factory. It also fails a non-generic
// type that merely ends in `Id` (a library's `ObjectId`): narrow ID_NAME then.
// `@typescript-eslint/no-unsafe-type-assertion` (type-aware) sees all of it,
// at the price of refusing every narrowing assertion in the codebase.
const ID_NAME = '/^[A-Z][a-z]\\w*Id$/';
const ID_TYPE = `:matches(TSTypeReference[typeName.name=${ID_NAME}]:not([typeArguments]), TSTypeReference[typeName.name='Brand'][typeArguments])`;
const ID_LIST = `:matches(TSArrayType[elementType.typeName.name=${ID_NAME}], TSTypeOperator[typeAnnotation.elementType.typeName.name=${ID_NAME}], TSTypeReference[typeName.name=/^(Readonly)?Array$/][typeArguments.params.0.typeName.name=${ID_NAME}])`;
const EMPTY_ARRAY = "[expression.type='ArrayExpression'][expression.elements.length=0]";
const ID_FACTORY = `VariableDeclarator[id.name=${ID_NAME}] :matches(ArrowFunctionExpression, FunctionExpression)`;
const FORGED_ID = `:matches(TSAsExpression, TSTypeAssertion):not(${EMPTY_ARRAY}) > .typeAnnotation:matches(${ID_TYPE}, TSUnionType:has(> ${ID_TYPE}), ${ID_LIST}):not(${ID_FACTORY} *)`;
const FORGED_ID_MESSAGE =
  'An id comes out of its own factory: call <Concept>Id.restore(value), or annotate the variable instead of asserting (ddd-tactical, typed-ids.md).';

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
