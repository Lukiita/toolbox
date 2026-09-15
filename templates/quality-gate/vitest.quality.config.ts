import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Used only by the quality ratchet (`pnpm quality`).
//
// It is separate from `vitest.config.ts` because the two measurements answer
// different questions and would fight over one file:
//
// - `vitest.config.ts` measures `src/domain/**` and `src/application/**` against
//   the NFR-08 thresholds (90/90/85). That is "is the new rule covered?", and the
//   narrow slice is deliberate: averaging in the legacy component surface would
//   hide the very number that matters.
//
// - here the slice is all of `src/**/*.ts`, with no threshold. That is "did
//   anything get worse since the last commit?", and it has to see `src/utils/`
//   and `src/components/` — where business rules land when they land in the wrong
//   place. A 90% threshold here would leave the gate permanently red, which is the
//   same as having no gate; what fails a build is the comparison against the
//   frozen baseline, file by file.
//
// `.tsx` is excluded from both: AGENTS.md says to extract logic out of a component
// into the domain and leave the rendering shell behind, so charging for render
// coverage would push the other way.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/contract/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // The `integration` suite stays out: it needs a real Supabase, and this runs on
    // every tlc task and every pull request.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // `json` because the reader is the ratchet (`toolbox quality`), not a person.
      reporter: ['json'],
      // Its own directory. `pnpm test:coverage` and `pnpm quality` write reports of
      // different slices, and in a shared directory the last one to run erased the
      // other — the ratchet's `--skip-tests` then read the wrong report, or none.
      reportsDirectory: 'coverage-quality',
      // Without `include`, only files some test imported reach the report — and a
      // file no test ever imported is exactly the 100%-uncovered case the ratchet
      // needs to see.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
});
