import assert from "node:assert/strict";
import { test } from "node:test";
import { grantAllows } from "../../../packages/edi-desktop/src/access.ts";
import {
  AI_TOOL_NAMES,
  AI_TOOLS,
  callPaths,
  describeCall,
  PANEL_FORBIDDEN,
  PATH_FIELDS,
  scopesAllow,
  TOOL_PERMISSIONS,
  toolPermission,
} from "../src/shared/aiTools.ts";

test("every tool says what it needs: read, propose or write", () => {
  for (const name of AI_TOOL_NAMES)
    assert.ok(
      (TOOL_PERMISSIONS as readonly string[]).includes(AI_TOOLS[name].permission),
      `${name} has no permission`,
    );
  // Anything that changes the project, opens files or switches the lesson is a write.
  for (const name of [
    "cut_text",
    "cut_ranges",
    "apply_cleanup",
    "protect_text",
    "undo",
    "transcribe",
    "import_media",
    "add_image",
    "set_audio",
    "save_publish_info",
    "open_project",
    "create_project",
  ] as const)
    assert.equal(toolPermission(name), "write", name);
  assert.equal(toolPermission("propose_cuts"), "propose");
  assert.equal(toolPermission("propose_off_script"), "propose");
  for (const name of [
    "get_overview",
    "get_transcript",
    "find_cleanup",
    "get_script",
    "seek",
  ] as const)
    assert.equal(toolPermission(name), "read", name);
});

test("a client connected to read and propose must ask before every write", () => {
  const connected = { scopes: ["read", "propose"] as ("read" | "propose" | "write")[] };
  const asks = AI_TOOL_NAMES.filter((name) => !grantAllows(connected, toolPermission(name)));
  assert.deepEqual(
    asks,
    AI_TOOL_NAMES.filter((name) => toolPermission(name) === "write"),
  );
  assert.ok(!scopesAllow(["read", "propose"], "write"));
  assert.ok(scopesAllow(["read", "propose", "write"], "write"));
  assert.ok(scopesAllow(["read"], "read"));
  assert.ok(!scopesAllow(["read"], "propose"));
});

test("the chat inside EdiAula never opens or creates projects", () => {
  assert.deepEqual([...PANEL_FORBIDDEN].sort(), ["create_project", "open_project"]);
});

test("path fields exist in their tools and every path in a call is found", () => {
  for (const [name, fields] of Object.entries(PATH_FIELDS)) {
    const shape = (AI_TOOLS[name as keyof typeof AI_TOOLS].input as { shape: object }).shape;
    for (const field of fields ?? []) assert.ok(field in shape, `${name}.${field}`);
  }
  assert.deepEqual(callPaths("import_media", { paths: ["C:\\a.mp4", "C:\\b.mp4"] }), [
    { field: "paths", path: "C:\\a.mp4" },
    { field: "paths", path: "C:\\b.mp4" },
  ]);
  assert.deepEqual(callPaths("add_image", { path: "\\\\host\\x.png" }), [
    { field: "path", path: "\\\\host\\x.png" },
  ]);
  assert.deepEqual(callPaths("set_audio", { denoise: true }), []);
  assert.deepEqual(callPaths("cut_text", { quotes: [{ text: "C:\\x" }] }), []);
});

test("the approval dialog gets a short description of the call", () => {
  assert.equal(describeCall("undo", {}), "Desfazer");
  const long = describeCall("cut_text", { quotes: [{ text: "a".repeat(500) }] });
  assert.ok(long.startsWith("Cortar frases: "));
  assert.ok(long.length < 280);
});
