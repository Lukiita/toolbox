import { describe, expect, it } from 'vitest';

import { circularDependencies, importGraph } from './cycles.mts';

const sources = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('importGraph', () => {
  it('resolves relative imports with and without extension', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': 'export const b = 1;',
      }),
    );
    expect(graph.get('src/a.ts')).toEqual(['src/b.ts']);
  });

  // `./b.js` is the ESM-correct specifier for `b.ts` and what `moduleResolution: bundler`
  // accepts. Unresolvable specifiers are dropped silently, so a missed edge reads as "no
  // cycle" on a metric frozen at zero (project-a review 2026-09-02, ported by issue #8).
  it('resolves a .js specifier to the TypeScript file that emits it', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from './b.js';",
        'src/b.ts': 'export const b = 1;',
      }),
    );
    expect(graph.get('src/a.ts')).toEqual(['src/b.ts']);
  });

  it('resolves a .mjs specifier to its .mts source', () => {
    const graph = importGraph(
      sources({
        'src/a.mts': "import { b } from './b.mjs';",
        'src/b.mts': 'export const b = 1;',
      }),
    );
    expect(graph.get('src/a.mts')).toEqual(['src/b.mts']);
  });

  it('finds a cycle written with .js specifiers', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from './b.js';",
        'src/b.ts': "import { a } from './a.js';",
      }),
    );
    expect(circularDependencies(graph)).toEqual([['src/a.ts', 'src/b.ts']]);
  });

  it('resolves a directory import to its index file', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { d } from './dir';",
        'src/dir/index.ts': 'export const d = 1;',
      }),
    );
    expect(graph.get('src/a.ts')).toEqual(['src/dir/index.ts']);
  });

  it('resolves the @/ alias to the repo root', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from '@/src/b';",
        'src/b.ts': 'export const b = 1;',
      }),
    );
    expect(graph.get('src/a.ts')).toEqual(['src/b.ts']);
  });

  it('ignores external packages', () => {
    const graph = importGraph(sources({ 'src/a.ts': "import { useState } from 'react';" }));
    expect(graph.get('src/a.ts')).toEqual([]);
  });

  it('counts export-from and dynamic import as edges', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "export { b } from './b'; const load = () => import('./c');",
        'src/b.ts': 'export const b = 1;',
        'src/c.ts': 'export const c = 1;',
      }),
    );
    expect(graph.get('src/a.ts')).toEqual(['src/b.ts', 'src/c.ts']);
  });
});

describe('circularDependencies', () => {
  it('finds a two-file cycle', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': "import { a } from './a';",
      }),
    );
    expect(circularDependencies(graph)).toEqual([['src/a.ts', 'src/b.ts']]);
  });

  it('finds a three-file cycle and rotates it to the smallest member', () => {
    const graph = importGraph(
      sources({
        'src/c.ts': "import { a } from './a';",
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': "import { c } from './c';",
      }),
    );
    expect(circularDependencies(graph)).toEqual([['src/a.ts', 'src/b.ts', 'src/c.ts']]);
  });

  it('a tree has no cycles', () => {
    const graph = importGraph(
      sources({
        'src/a.ts': "import { b } from './b'; import { c } from './c';",
        'src/b.ts': 'export const b = 1;',
        'src/c.ts': "import { b } from './b'; export const c = 1;",
      }),
    );
    expect(circularDependencies(graph)).toEqual([]);
  });

  it('two independent cycles are reported separately and sorted', () => {
    const graph = new Map<string, string[]>([
      ['src/x.ts', ['src/y.ts']],
      ['src/y.ts', ['src/x.ts']],
      ['src/a.ts', ['src/b.ts']],
      ['src/b.ts', ['src/a.ts']],
    ]);
    expect(circularDependencies(graph)).toEqual([
      ['src/a.ts', 'src/b.ts'],
      ['src/x.ts', 'src/y.ts'],
    ]);
  });
});

describe('config-driven alias prefixes (ADR-0001)', () => {
  it('resolves a project alias the default does not know, and ignores it by default', () => {
    const sources = new Map([
      ['app/a.ts', "import './b.ts'; import '~/a';"],
      ['app/b.ts', "import '~/a';"],
    ]);
    expect(importGraph(sources, { '~/': 'app/' }).get('app/b.ts')).toEqual(['app/a.ts']);
    expect(importGraph(sources).get('app/b.ts')).toEqual([]);
  });
});
