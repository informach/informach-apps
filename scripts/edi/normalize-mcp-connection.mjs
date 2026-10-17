import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

// A reviewed two-file mechanical migration: all configuration behavior lives in
// the shared SDK; locateClient and every unrelated setting remain untouched.
for (const id of ["ediaula", "edifoto"]) {
  const path = `apps/${id}/src/main/aiSettings.ts`;
  let source = await readFile(path, "utf8");
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  for (const node of tree.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.body || !node.name) continue;
    if (node.name.text === "connectClient")
      edits.push({
        start: node.body.getStart(tree),
        end: node.body.end,
        text: `{ if (!await locateClient(id)) return { ok: false, message: "Cliente oficial não encontrado neste computador." }; return connectMcpClient({ client: id, home: homedir(), name: MCP_NAME, port }); }`,
      });
    if (node.name.text === "isConnected")
      edits.push({
        start: node.body.getStart(tree),
        end: node.body.end,
        text: `{ return isMcpClientConnected({ client: id, home: homedir(), name: MCP_NAME, port: ${id === "ediaula" ? "DEFAULT_MCP_PORT" : "port"} }); }`,
      });
  }
  if (edits.length !== 2)
    throw new Error(`Expected exactly two reviewed connection functions: ${path}`);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const imported =
    'import { connectMcpClient, isMcpClientConnected } from "@informach/edi-desktop/mcp-config";\n';
  if (!source.includes(imported)) source = imported + source;
  await writeFile(path, source);
}
