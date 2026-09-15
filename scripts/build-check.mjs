#!/usr/bin/env node
// Fails when the committed `dist/` does not match a fresh build of `src/`.
//
// Why a script and not a one-liner: `git diff --quiet -- dist` ignores
// UNTRACKED files, so a new module emitted by tsc passed the check while the
// tag shipped without it (review, round 2); and `a && b || c` blamed "stale"
// for a compile error. A clean build (rm + tsc) also surfaces orphans - tsc
// never deletes the .mjs of a source that is gone.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
try {
  execFileSync('./node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
} catch {
  execFileSync('git', ['checkout', '--', 'dist']);
  console.error(
    'build:check: the build failed (see above); dist/ restored from HEAD, not compared',
  );
  process.exit(1);
}
const stale = execFileSync('git', ['status', '--porcelain', '--', 'dist'], {
  encoding: 'utf8',
}).trim();
if (stale) {
  console.error(`build:check: dist/ is stale - run \`pnpm build\` and commit it:\n${stale}`);
  process.exit(1);
}
console.log('build:check: dist/ matches src/');
