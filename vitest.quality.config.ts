import { defineConfig } from 'vitest/config';

// The ratchet's own slice of this repo (`pnpm quality`): every `.mts` under
// src/ with no threshold; the comparison against quality-baseline.json is what
// fails. Kept apart from vitest.config.ts for the reason the template gives:
// two measurements, one file, they fight.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'hooks/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['json'],
      reportsDirectory: 'coverage-quality',
      include: ['src/**/*.mts'],
      exclude: ['src/**/*.test.ts', 'src/cli/**'],
    },
  },
});
