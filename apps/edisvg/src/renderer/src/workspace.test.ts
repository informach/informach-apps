import assert from "node:assert/strict";
import { test } from "node:test";
import { newProject } from "../../shared/project";
import { encodeWorkspace, parseWorkspace, resolvePreviewRange } from "./workspace";

test("preview transport handles presets with no clip ID/range and only accepts a matching valid authored range", () => {
  const preset = { frames: 120 };
  for (const range of [null, undefined, { clipId: "animation-old", start: 20, end: 60 }])
    assert.deepEqual(resolvePreviewRange(preset, range), { start: 0, end: 120 });
  const clip = { id: "animation-current", frames: 100 },
    range = { clipId: clip.id, start: 10, end: 50 };
  assert.deepEqual(resolvePreviewRange(clip, range), range);
  for (const invalid of [
    { ...range, clipId: "animation-other" },
    { ...range, end: 120 },
    { ...range, start: 50 },
  ])
    assert.deepEqual(resolvePreviewRange(clip, invalid), { start: 0, end: 100 });
});

test("workspace is project-scoped, validated, does not change content and drops stale references", () => {
  const project = newProject(),
    before = structuredClone(project);
  const encoded = encodeWorkspace(project.id, {
    activeArtboardId: project.defaultArtboardId,
    activeClipId: null,
    view: "design",
    sidebarTab: "artboards",
    frame: 0,
    zoom: 100,
    pan: { x: 10, y: 20 },
    artboardViews: {
      "artboard-main": {
        x: 42,
        y: 0,
        originX: 0,
        originY: 0,
        scaleX: 125,
        scaleY: 100,
        rotation: 15,
        opacity: 100,
      },
    },
  });
  assert.equal(parseWorkspace(encoded, project)?.sidebarTab, "artboards");
  assert.equal(parseWorkspace(encoded, project)?.artboardViews?.["artboard-main"]?.scaleX, 125);
  assert.deepEqual(project, before);
  assert.equal(parseWorkspace(encoded, newProject()), null);
  const stale = parseWorkspace(encoded.replace("artboard-main", "artboard-deleted"), project);
  assert.equal(stale?.activeArtboardId, project.defaultArtboardId);
  assert.throws(() => parseWorkspace("broken{", project));
  assert.throws(() => parseWorkspace(encoded.replace('"zoom":100', '"zoom":1e999'), project));
  assert.throws(() => parseWorkspace("x".repeat(20001), project));
});
