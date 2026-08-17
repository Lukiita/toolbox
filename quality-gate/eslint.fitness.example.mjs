// Threshold-kind fitness functions as ESLint rules - the complement to the
// ratchet. The ratchet gates on DIRECTION over legacy debt; these gate on a
// hard THRESHOLD and suit new code / new projects, where there is no debt to
// freeze. Copy what applies into the project's eslint config (flat config);
// on a legacy repo, prefer the ratchet metrics over flipping these to error.
//
// Requires: typescript-eslint (and @vitest/eslint-plugin for the last block).

// @ts-check
import tseslint from 'typescript-eslint';

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
