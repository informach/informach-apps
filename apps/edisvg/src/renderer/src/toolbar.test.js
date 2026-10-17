import assert from "node:assert/strict";
import { test } from "node:test";
import { activateTool, TOOLS, toolbar, toolShortcut } from "./toolbar.js";

test("toolbar matches the nine tools and three groups in the Pen reference", () => {
  assert.deepEqual(
    TOOLS.map((tool) => tool.id),
    ["select", "pen", "shapes", "text", "bone", "mesh", "constraints", "hand", "zoom"],
  );
  const html = toolbar({ tool: "select", view: "design", scene: {} });
  assert.equal((html.match(/<svg /g) || []).length, 9);
  assert.equal((html.match(/role="separator"/g) || []).length, 2);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /aria-orientation="vertical"/);
  assert.doesNotMatch(html, /rail-bottom/);
});

test("unavailable and unknown tools cannot change editor state", () => {
  const state = { tool: "select", playing: true, view: "animate", scene: null };
  const before = structuredClone(state);
  for (const id of ["pen", "shapes", "text", "bone", "mesh", "constraints", "unknown"]) {
    assert.equal(activateTool(state, id).ok, false);
    assert.deepEqual(state, before);
  }
  assert.equal(activateTool({ ...state, view: "machine" }, "hand").ok, false);
});

test("canvas tool selection stops playback and switches editable scenes to Design", () => {
  const state = { tool: "select", playing: true, view: "animate", scene: { nodes: [] } };
  assert.deepEqual(activateTool(state, "pen"), { ok: true });
  assert.equal(state.tool, "pen");
  assert.equal(state.view, "design");
  assert.equal(state.playing, false);
});

test("shortcuts preserve system combinations, IME composition and repeat handling", () => {
  assert.deepEqual(toolShortcut({ key: "P" }), { id: "pen" });
  assert.deepEqual(toolShortcut({ key: "r" }), { id: "shapes", shape: "rect" });
  assert.deepEqual(toolShortcut({ key: "o" }), { id: "shapes", shape: "circle" });
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing"]) {
    assert.equal(toolShortcut({ key: "p", [modifier]: true }), null);
  }
});
