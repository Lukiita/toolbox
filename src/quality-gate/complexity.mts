// Cyclomatic complexity per function (AST-based).
//
// CC = the number of distinct paths through a function: 1 for a straight line,
// +1 for every decision point. Each path is a test case someone owes; past a
// point nobody tests them all and bugs live on the unvisited paths. Industry
// tolerates CC < 10; Richards & Ford prefer < 5 ("cohesive, well-factored
// code") - and this gate ratchets a COUNT of offenders, so the strict limit
// costs nothing on legacy: today's offenders freeze, new ones are barred.
//
// Why it earns a metric here: generative AI tends to solve by brute force,
// producing accidental complexity (Fundamentals of Software Architecture,
// ch. 6) - in a repo where agents write the code, CC watches the model's
// laziness. The classic caveat travels with it: CC cannot tell essential
// complexity (hard problem) from accidental (bad design) - which is exactly
// why this is a ratchet and not a hard rule.
//
// Counting follows McCabe as ESLint's `complexity` rule does: base 1, +1 for
// if, ternary, case clause, loop, catch, each short-circuit operator
// (&&, ||, ??, and their assignment forms &&= ||= ??=), each optional-chain
// link (?. on a property, a call or an index) and each default parameter.
// `else` does not count. Nested functions count separately -
// each function-like node gets its own score, without inheriting its
// children's.

import ts from 'typescript';

import { DEFAULT_QUALITY } from '../config/toolbox-config.mts';

// Ported back from project-a's copy (review of 2026-09-02, rounds 4-8), which had
// evolved past the toolbox - the drift issue #1 describes, in the other direction.

export interface FunctionComplexity {
  file: string;
  name: string;
  line: number;
  cc: number;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    isFieldInitializer(node) ||
    // A static block is a scope ESLint scores on its own, and its branches belonged to no
    // function here — the same "counted by nobody" gap as the field initialiser
    // (review 2026-09-02, round 6).
    ts.isClassStaticBlockDeclaration(node)
  );
}

/**
 * ESLint scores a class field initialiser as its own unit, and so must this: a field is not
 * function-like, so without an entry of its own the decision points inside
 * `private x = a ? b : c && d` belonged to NO function and were counted by nobody — complexity
 * invisible to the metric that exists to see it (review 2026-09-02, round 5).
 */
function isFieldInitializer(node: ts.Node): boolean {
  return ts.isPropertyDeclaration(node) && node.initializer !== undefined;
}

function isDecisionPoint(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node)
  ) {
    return true;
  }
  if (ts.isBinaryExpression(node)) return SHORT_CIRCUIT_OPERATORS.has(node.operatorToken.kind);
  // `a?.b` short-circuits on nullish exactly as `a && a.b` does, and a default parameter is
  // the branch "the argument came, or it did not". ESLint's `complexity` rule scores each +1;
  // scoring them 0 meant rewriting `a && a.b` as `a?.b` bought a free point off the ratchet,
  // and with 1043 `?.` tokens in src/ that was the reachable loophole, not `||=`
  // (review 2026-09-02, round 4 — parity with ESLint chosen deliberately, baseline re-frozen).
  if (hasOptionalChain(node)) return true;
  return hasDefaultValue(node);
}

/**
 * ESLint increments on every `AssignmentPattern`, and a default inside a binding pattern —
 * `f({ a = 1 })`, `const [a = 1] = xs` — carries its initialiser on the BindingElement, not
 * on the parameter. Counting only parameters left the same walk-down `?.` had:
 * `f(o){ const a = o.a ?? 1 }` scores 2 and `f({ a = 1 })` scored 1, for free
 * (review 2026-09-02, round 5; measured against ESLint 10.7.0 over all 145 src files, which
 * disagreed on exactly these).
 */
function hasDefaultValue(node: ts.Node): boolean {
  if (ts.isParameter(node)) return node.initializer !== undefined;
  return ts.isBindingElement(node) && node.initializer !== undefined;
}

function hasOptionalChain(node: ts.Node): boolean {
  const chainable = node as { questionDotToken?: ts.Node };
  return chainable.questionDotToken !== undefined;
}

// The logical ASSIGNMENT forms are short circuits too, and ESLint's `complexity` rule counts
// them. Leaving them out made `a ||= b` score one less than the `a = a || b` it replaces, so
// the ratchet could be walked down by a rewrite that simplifies nothing (review 2026-09-02).
const SHORT_CIRCUIT_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function functionName(node: ts.Node): string {
  if (ts.isClassStaticBlockDeclaration(node)) return '(static block)';
  if (ts.isPropertyDeclaration(node)) return `${node.name.getText()} (field)`;
  const named = node as { name?: ts.Node };
  if (named.name) return named.name.getText();
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText();
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText();
  return '(anonymous)';
}

/**
 * CC of one function body, not descending into nested function-likes.
 *
 * The guard runs on the function's OWN direct children as well, not only one level down:
 * a curried arrow's entire body IS the nested function, so without it `(a) => (b) => a && b`
 * charged the inner arrow's points to the outer (review 2026-09-02).
 */
function complexityOf(fn: ts.Node): number {
  let cc = 1;
  const walk = (node: ts.Node): void => {
    if (isDecisionPoint(node)) cc += 1;
    descend(node, walk);
  };
  descend(fn, walk);
  return cc;
}

function descend(node: ts.Node, walk: (child: ts.Node) => void): void {
  ts.forEachChild(node, (child) => {
    if (isFunctionLike(child)) return; // the nested function scores on its own
    walk(child);
  });
}

/** Every function in one source file, with its own score. Pure. */
export function functionComplexities(relPath: string, source: string): FunctionComplexity[] {
  const kind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, kind);
  const out: FunctionComplexity[] = [];
  const walk = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ file: relPath, name: functionName(node), line: line + 1, cc: complexityOf(node) });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/** The offenders above `quality.ccLimit` (default 5), worst first, ties by position. */
export function overComplexFunctions(
  all: readonly FunctionComplexity[],
  limit: number = DEFAULT_QUALITY.ccLimit,
): FunctionComplexity[] {
  return all
    .filter((f) => f.cc > limit)
    .sort((a, b) => b.cc - a.cc || a.file.localeCompare(b.file) || a.line - b.line);
}
