import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { collect } from "./import-tools.mjs";

let total = 0;
for (const tool of EDI_TOOLS) {
  const root = join("apps", tool.id);
  for (const file of await collect(root)) {
    if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    const path = join(root, file.path);
    let source = await readFile(path, "utf8");
    const tree = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const edits = [];
    function visit(node) {
      if (ts.isReturnStatement(node) && node.expression) {
        let owner = node.parent;
        while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
        if (owner?.type?.kind === ts.SyntaxKind.VoidKeyword) {
          const statements = [];
          function collectExpression(expression) {
            if (ts.isParenthesizedExpression(expression))
              return collectExpression(expression.expression);
            if (
              ts.isBinaryExpression(expression) &&
              expression.operatorToken.kind === ts.SyntaxKind.CommaToken
            ) {
              collectExpression(expression.left);
              collectExpression(expression.right);
            } else statements.push(expression.getText(tree));
          }
          collectExpression(node.expression);
          edits.push({
            start: node.getStart(tree),
            end: node.end,
            replacement: `{ ${statements.join("; ")}; return; }`,
          });
          return;
        }
      }
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        const parent = node.parent;
        const isForEach =
          ts.isCallExpression(parent) &&
          ts.isPropertyAccessExpression(parent.expression) &&
          parent.expression.name.text === "forEach" &&
          parent.arguments[0] === node;
        if (isForEach || node.type?.kind === ts.SyntaxKind.VoidKeyword) {
          const expressions = [];
          function statements(expression) {
            if (ts.isParenthesizedExpression(expression)) return statements(expression.expression);
            if (
              ts.isBinaryExpression(expression) &&
              expression.operatorToken.kind === ts.SyntaxKind.CommaToken
            ) {
              statements(expression.left);
              statements(expression.right);
            } else expressions.push(expression.getText(tree));
          }
          statements(node.body);
          edits.push({
            start: node.body.getStart(tree),
            end: node.body.end,
            replacement: `{ ${expressions.join("; ")}; }`,
          });
          return;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    for (const edit of edits.sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    if (edits.length) await writeFile(path, source);
    total += edits.length;
  }
}
console.log(`Normalized ${total} void/forEach callbacks, preserving expression order.`);
