import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { collect } from "./import-tools.mjs";

// Mechanical JSX migration, not a regex rewrite. Forms and spread props require
// manual review so that an intended submit button is never silently changed.
let count = 0;
for (const tool of EDI_TOOLS) {
  const root = join("apps", tool.id);
  for (const file of await collect(root)) {
    if (!file.path.endsWith(".tsx")) continue;
    const path = join(root, file.path);
    let source = await readFile(path, "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    function visit(node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(tree) === "button" &&
        !node.attributes.properties.some(
          (attr) => ts.isJsxSpreadAttribute(attr) || attr.name.getText(tree) === "type",
        )
      ) {
        let parent = node.parent;
        let form = false;
        while (parent) {
          if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(tree) === "form")
            form = true;
          parent = parent.parent;
        }
        if (!form) edits.push(node.tagName.end);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    for (const offset of edits.sort((a, b) => b - a))
      source = `${source.slice(0, offset)} type="button"${source.slice(offset)}`;
    if (edits.length) await writeFile(path, source);
    count += edits.length;
  }
}
console.log(`Normalized ${count} non-form buttons.`);
