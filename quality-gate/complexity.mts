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
// if, ternary, case clause, loop, catch, and each short-circuit operator
// (&&, ||, ??). `else` does not count. Nested functions count separately -
// each function-like node gets its own score, without inheriting its
// children's.

import ts from 'typescript';

/** Above this, the function enters the count. Adapt per project if needed. */
export const CC_LIMIT = 5;

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
    ts.isSetAccessorDeclaration(node)
  );
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
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    return (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    );
  }
  return false;
}

function functionName(node: ts.Node): string {
  const named = node as { name?: ts.Node };
  if (named.name) return named.name.getText();
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText();
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText();
  return '(anonymous)';
}

/** CC of one function body, not descending into nested function-likes. */
function complexityOf(fn: ts.Node): number {
  let cc = 1;
  const walk = (node: ts.Node): void => {
    if (isDecisionPoint(node)) cc += 1;
    ts.forEachChild(node, (child) => {
      if (isFunctionLike(child)) return; // the nested function scores on its own
      walk(child);
    });
  };
  ts.forEachChild(fn, walk);
  return cc;
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

/** The offenders, worst first, ties by position. */
export function overComplexFunctions(
  all: readonly FunctionComplexity[],
  limit: number = CC_LIMIT,
): FunctionComplexity[] {
  return all
    .filter((f) => f.cc > limit)
    .sort((a, b) => b.cc - a.cc || a.file.localeCompare(b.file) || a.line - b.line);
}
