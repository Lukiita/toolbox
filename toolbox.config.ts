// The toolbox ratchets itself with the canonical defaults (`^src/`, main).
// `src/cli/` is process glue (argv, stdin, exit codes) with no unit test by
// design - it is excluded from the coverage slice in vitest.quality.config.ts.
// Known gap: `hooks/*.mjs` is shipped code the collectors do not parse (they
// read .ts/.mts/.cts only), so it is measured by nothing but its own test.
// `pure-rule-outside-domain` is frozen at the size of the flat folders
// (`quality-gate/`, `pre-push/`, `config/`): tooling written before any
// feature here had a `domain/`, so by the place rule every tested module in
// them is "a rule outside the domain". `src/install/` is layered and does not
// count (README, "Code layout"). The frozen number only says "do not grow the
// flat tooling"; it is not a smell to chase.
import { defineToolboxConfig } from './src/config/index.mts';

export default defineToolboxConfig({});
