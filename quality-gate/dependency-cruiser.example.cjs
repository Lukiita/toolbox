// Layer governance for the package-by-feature layout - the ArchUnit of this
// stack (Fundamentals of Software Architecture, ch. 6, Example 6.4), as a
// threshold-kind fitness function: a forbidden import fails the build the
// moment it appears, instead of waiting for a review that arrives too late.
//
// The layout it governs (AGENTS.md): the folder is the domain, the layers
// live inside it -
//
//   src/<feature>/domain/         pure rules, imports nothing but itself + shared
//   src/<feature>/application/    use cases, orchestrate the domain
//   src/<feature>/infra/          adapters (db, http, queues)
//   src/<feature>/presentation/   ui / controllers
//   src/shared/                   the minimal shared kernel (Money, ids, Result)
//
// Complementary, not redundant, with the ratchet: `cycles.mts` counts cycles
// as a trend metric with zero config; this file adds the DIRECTION rules that
// need to know the project's layout. Adapt the globs on import.
//
// Requires: dependency-cruiser as a dev dependency.
//   npx depcruise --config .dependency-cruiser.cjs src

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle means no file in it can be reused or understood alone.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'The domain OWNS the rules and imports nothing outside itself and the shared kernel - maximum stability by construction (Ce ~ 0), no metric needed.',
      from: { path: '^src/([^/]+)/domain/' },
      to: {
        pathNot: ['^src/$1/domain/', '^src/shared/'],
        path: '^src/',
      },
    },
    {
      name: 'application-orchestrates-its-own-domain',
      severity: 'error',
      comment:
        'Use cases reach their own domain and the shared kernel; infra and presentation are below them, never imported upward.',
      from: { path: '^src/([^/]+)/application/' },
      to: {
        path: '^src/$1/(infra|presentation)/',
      },
    },

    // ── Cross-feature policy (canon, decided 2026-08-17): public API only ─
    // A feature imports only what another feature publishes in its root
    // index.ts - direct function calls, zero HTTP, zero ceremony, but
    // through a NAMED boundary: the context's published language in
    // miniature. If a context ever becomes a service, its public API
    // already is the contract - extraction becomes mechanics, not
    // archaeology. (Stricter/looser variants exist - nothing-crosses via
    // shared only, or domain-only - but they are deviations from the canon,
    // not options to pick.)
    {
      name: 'cross-feature-via-public-api',
      severity: 'error',
      comment:
        'A feature never reaches into another feature\'s internals - only its published API (the root index.ts). If a symbol is not exported there, it is private to the feature.',
      from: { path: '^src/([^/]+)/' },
      to: {
        path: '^src/(?!shared/)([^/]+)/',
        pathNot: ['^src/$1/', '^src/[^/]+/index\\.ts$'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
