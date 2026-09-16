// Circular dependencies between production files (AST + Tarjan).
//
// The canonical fitness function from Fundamentals of Software Architecture
// ch. 6 (there with JDepend): a cycle means no file in it can be reused,
// tested or understood without dragging the others - the on-ramp to the Big
// Ball of Mud. Auto-import makes cycles trivially easy to introduce and code
// review arrives too late; a build-time check does not.
//
// Own collector instead of madge/dependency-cruiser: the gate already parses
// every production file with the TypeScript API, and a ratchet metric must
// not depend on a per-project lint config. The layer-governance template
// (dependency-cruiser.example.cjs) is the threshold-kind complement, not a
// replacement for this count.
import { dirname, posix } from 'node:path';
import ts from 'typescript';
import { DEFAULT_QUALITY } from "../config/toolbox-config.mjs";
// Non-relative prefixes resolved as internal come from `quality.aliasPrefixes`
// (default `@/` -> repo root, what the source project's bundler and test
// configs alias).
function specifierCandidates(spec, fromFile, aliasPrefixes) {
    let resolved;
    if (spec.startsWith('./') || spec.startsWith('../')) {
        resolved = posix.normalize(posix.join(dirname(fromFile), spec));
    }
    else {
        for (const [prefix, target] of Object.entries(aliasPrefixes)) {
            if (spec.startsWith(prefix)) {
                resolved = posix.normalize(target + spec.slice(prefix.length));
                break;
            }
        }
    }
    if (resolved === undefined)
        return undefined; // external package - not ours
    return [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}/index.ts`,
        `${resolved}/index.tsx`,
        ...sourceOfEmit(resolved),
    ];
}
/**
 * `./b.js` is the ESM-correct specifier for `b.ts` and what `moduleResolution: bundler`
 * accepts, but the file on disk is the TypeScript one - so the emit extension is mapped back
 * before matching. Without this the specifier matched nothing, the edge vanished with no
 * message, and on a metric frozen at zero a missed edge reads as "no cycle" rather than as
 * "could not resolve" (project-a review 2026-09-02, ported by issue #8).
 */
const EMIT_EXTENSIONS = {
    '.js': ['.ts', '.tsx'],
    '.jsx': ['.tsx'],
    '.mjs': ['.mts'],
    '.cjs': ['.cts'],
};
function sourceOfEmit(resolved) {
    for (const [emit, sources] of Object.entries(EMIT_EXTENSIONS)) {
        if (!resolved.endsWith(emit))
            continue;
        const stem = resolved.slice(0, -emit.length);
        return sources.map((extension) => stem + extension);
    }
    return [];
}
function importSpecifiers(relPath, source) {
    const kind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, kind);
    const specs = [];
    const walk = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)) {
            specs.push(node.moduleSpecifier.text);
        }
        // Dynamic `import('x')` and `require('x')` count too - a cycle through a
        // lazy import is still a cycle in the design.
        if (ts.isCallExpression(node) && node.arguments.length === 1) {
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
            const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
            const arg = node.arguments[0];
            if ((isDynamicImport || isRequire) && ts.isStringLiteral(arg))
                specs.push(arg.text);
        }
        ts.forEachChild(node, walk);
    };
    walk(sf);
    return specs;
}
/** file → internal files it imports. Only edges between known files enter. */
export function importGraph(sources, aliasPrefixes = DEFAULT_QUALITY.aliasPrefixes) {
    const graph = new Map();
    for (const [file, source] of sources) {
        const edges = new Set();
        for (const spec of importSpecifiers(file, source)) {
            const candidates = specifierCandidates(spec, file, aliasPrefixes);
            if (!candidates)
                continue;
            const hit = candidates.find((c) => sources.has(c));
            if (hit && hit !== file)
                edges.add(hit);
        }
        graph.set(file, [...edges].sort());
    }
    return graph;
}
// Tarjan pops a component in visit order, which is NOT a walkable path - the
// report would print `a → c` where no such edge exists. Re-walk the component
// along real edges from its smallest member instead. A dense component with
// several interleaved cycles may have no single path through every member;
// the greedy walk covers what it can and appends the rest sorted - there is
// no "the cycle" to print in that case anyway.
function orderAlongEdges(component, graph) {
    const inComponent = new Set(component);
    const smallest = [...component].sort()[0];
    const ordered = [smallest];
    const visited = new Set([smallest]);
    let current = smallest;
    while (ordered.length < component.length) {
        const next = (graph.get(current) ?? []).find((w) => inComponent.has(w) && !visited.has(w));
        if (!next)
            break;
        ordered.push(next);
        visited.add(next);
        current = next;
    }
    for (const member of [...component].sort()) {
        if (!visited.has(member))
            ordered.push(member);
    }
    return ordered;
}
/**
 * Strongly connected components with more than one member - the cycles.
 * Tarjan, recursion kept simple because production graphs here are hundreds
 * of nodes, not millions. Each cycle starts at its smallest member and walks
 * real edges, and the list is sorted, so reports and baselines are stable
 * across runs.
 */
export function circularDependencies(graph) {
    let counter = 0;
    const index = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const cycles = [];
    const strongConnect = (v) => {
        index.set(v, counter);
        low.set(v, counter);
        counter += 1;
        stack.push(v);
        onStack.add(v);
        for (const w of graph.get(v) ?? []) {
            if (!index.has(w)) {
                strongConnect(w);
                low.set(v, Math.min(low.get(v), low.get(w)));
            }
            else if (onStack.has(w)) {
                low.set(v, Math.min(low.get(v), index.get(w)));
            }
        }
        if (low.get(v) === index.get(v)) {
            const component = [];
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                component.push(w);
            } while (w !== v);
            if (component.length > 1)
                cycles.push(orderAlongEdges(component, graph));
        }
    };
    for (const v of [...graph.keys()].sort()) {
        if (!index.has(v))
            strongConnect(v);
    }
    return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}
