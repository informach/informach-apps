import assert from "node:assert/strict";
import { test } from "node:test";
import { grantAllows } from "../../../packages/edi-desktop/src/access.ts";
import {
  AI_TOOL_NAMES,
  AI_TOOLS,
  callPaths,
  callPermission,
  describeCall,
  PANEL_FORBIDDEN,
  PATH_FIELDS,
  TOOL_PERMISSIONS,
  toolPermission,
  writesDraft,
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

test("apply_cleanup only proposes by default: a propose grant is enough; cutting right away is a write", () => {
  assert.equal(callPermission("apply_cleanup", {}), "propose");
  assert.equal(callPermission("apply_cleanup", { mode: "propose", fillers: false }), "propose");
  assert.equal(callPermission("apply_cleanup", { mode: "apply" }), "write");
  // Anything it cannot read is treated as the stricter call.
  assert.equal(callPermission("apply_cleanup", { mode: "cut" }), "write");
  assert.equal(callPermission("cut_text", { quotes: [{ text: "oi" }] }), "write");
  assert.equal(callPermission("find_cleanup", {}), "read");
});

test("broad edits only write a draft by default; changing the lesson at once is a write", () => {
  const inputs = {
    add_annotations: { items: [{ kind: "label", text: "Play", at: 2 }] },
    auto_zoom: {},
    place_inserts: { insert_ids: "all" },
    set_palette: { palette: "Sistema Zero" },
  } as const;
  for (const [name, input] of Object.entries(inputs) as [keyof typeof inputs, object][]) {
    assert.equal(toolPermission(name), "write", name);
    assert.equal(callPermission(name, input), "propose", name);
    assert.ok(writesDraft(name, input), name);
    assert.equal(callPermission(name, { ...input, mode: "apply" }), "write", name);
    assert.ok(!writesDraft(name, { ...input, mode: "apply" }), name);
  }
  // A call it cannot read is the stricter one.
  assert.equal(callPermission("add_annotations", {}), "write");
  // The course template only ever makes a draft; the check only reads.
  assert.equal(callPermission("apply_editing_template", { source: "course" }), "propose");
  assert.ok(writesDraft("apply_editing_template", {}));
  assert.equal(toolPermission("check_before_export"), "read");
  assert.equal(toolPermission("prepare_lesson"), "write");
  assert.ok(!writesDraft("add_annotation", { kind: "arrow" }));
});

test("a client connected to read and propose must ask before every write", () => {
  const connected = { scopes: ["read", "propose"] as ("read" | "propose" | "write")[] };
  const asks = AI_TOOL_NAMES.filter((name) => !grantAllows(connected, toolPermission(name)));
  assert.deepEqual(
    asks,
    AI_TOOL_NAMES.filter((name) => toolPermission(name) === "write"),
  );
  assert.ok(!grantAllows({ scopes: ["read", "propose"] }, "write"));
  assert.ok(grantAllows({ scopes: ["read", "propose", "write"] }, "write"));
  assert.ok(grantAllows({ scopes: ["read"] }, "read"));
  assert.ok(!grantAllows({ scopes: ["read"] }, "propose"));
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
