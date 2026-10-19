import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPlaybackContext,
  evaluatePlaybackFrame,
  multiply,
  transformMatrix,
  transformPoint,
} from "@informach/edi-motion";
import { rigFixture } from "../../tests/rigFixture";
import { buildClipExport } from "../renderer/src/clipExport";
import { buildExport } from "../renderer/src/export.js";
import { compileArtboard } from "./components";
import { worldMatrix } from "./composition";
import { compileInteractiveArtboard } from "./interactive";
import { PROJECT_VERSION, parseProject } from "./project";
import { inspectRig, inspectRigValue } from "./rigInspection";
import { flattenScene } from "./scene.js";

test("bones, targets and IK share transactions, persist, remap artboards and evaluate with the same playback contract", () => {
  const f = rigFixture(),
    project = f.project(),
    before = structuredClone(project),
    compiled = compileArtboard(project, f.rootId);
  assert.equal(compiled.playback.version, 3);
  const clip = compiled.playback.motion.animations.find((clip) => clip.id === f.clipId);
  if (!clip) throw new Error("Missing clip");
  const sampled = evaluatePlaybackFrame(createPlaybackContext(compiled.playback), clip, 10),
    upper = sampled.poses.get("node-upper"),
    lower = sampled.poses.get("node-lower");
  if (!upper || !lower) throw new Error("Missing poses");
  const tip = transformPoint(multiply(transformMatrix(upper), transformMatrix(lower)), 100, 0);
  assert.ok(Math.abs(tip.x) < 0.001);
  assert.ok(Math.abs(tip.y - 100) < 0.001);
  assert.equal(sampled.diagnostics[0]?.converged, true);
  assert.deepEqual(project, before);
  const staticExport = buildExport(
    { ...project, activeArtboardId: f.rootId },
    { format: "svg", alt: "Rig estático", reduced: false, offscreen: false },
  );
  assert.match(staticExport.content, /rotate\(90\)/);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  const { assets: _assets, ...legacyFields } = project;
  assert.equal(parseProject({ ...legacyFields, version: 12 }).version, PROJECT_VERSION);
  assert.equal(compileInteractiveArtboard(project, f.rootId).document.playback.version, 3);
  const exported = buildClipExport(
    project,
    f.clipId,
    { format: "svg", alt: "Rig", reduced: true, offscreen: false },
    "",
  );
  assert.match(exported.content, /data-edi-object="node-lower"[^>]*><animateTransform/);
  const duplicated = f.run([
    {
      type: "artboard",
      operation: "duplicate",
      id: f.rootId,
      newId: "artboard-copy",
      name: "Cópia",
    },
  ]).project.artboards[1];
  if (!duplicated?.rig) throw new Error("Missing copied rig");
  const ids = new Set(flattenScene(duplicated.scene).map(({ node }) => node.id));
  assert.ok(duplicated.rig.bones.every((bone) => ids.has(bone.targetId)));
  assert.ok(duplicated.rig.targets.every((id) => ids.has(id)));
  assert.ok(duplicated.rig.constraints.every((constraint) => ids.has(constraint.targetId)));
});

test("rig definitions are read by explicit ID/page/chunk, and a reused rig scopes its bone identities and clock", () => {
  const f = rigFixture(),
    rig = f.project().artboards[0]?.rig;
  const page = inspectRig(rig, { collection: "bones", limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.nextOffset, 1);
  const chunk = inspectRigValue(rig, {
    collection: "constraints",
    id: "constraint-hand",
    offset: 0,
  });
  assert.deepEqual(JSON.parse(chunk.value), rig?.constraints[0]);
  assert.throws(
    () =>
      inspectRigValue(rig, {
        collection: "constraints",
        id: "constraint-hand",
        offset: chunk.totalCharacters + 1,
      }),
    /Offset/,
  );
  const result = f.run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-owner",
      name: "Owner",
      width: 300,
      height: 300,
    },
    {
      type: "component",
      operation: "create",
      name: "Rig aninhado",
      instance: {
        artboardId: f.rootId,
        animationId: f.clipId,
        width: 300,
        height: 300,
        fit: "contain",
        speed: 2,
        offsetSeconds: 0,
        overrides: [],
      },
    },
  ]);
  const compiled = compileArtboard(result.project, "artboard-owner"),
    clip = compiled.playback.motion.animations.find((clip) => clip.id === f.clipId);
  if (!clip) throw new Error("Missing clip");
  const scope = compiled.playback.rigScopes?.[0];
  assert.ok(scope?.clockId);
  assert.equal(scope?.instancePath.length, 1);
  const sampled = evaluatePlaybackFrame(createPlaybackContext(compiled.playback), clip, 5),
    bones = scope?.rig.bones;
  const upper = bones?.[0] ? sampled.poses.get(bones[0].targetId) : undefined,
    lower = bones?.[1] ? sampled.poses.get(bones[1].targetId) : undefined;
  if (!upper || !lower) throw new Error("Missing scoped bones");
  const tip = transformPoint(multiply(transformMatrix(upper), transformMatrix(lower)), 100, 0);
  assert.ok(Math.abs(tip.x) < 0.001);
  assert.ok(Math.abs(tip.y - 100) < 0.001);
});
test("binding preserves the rest world pose while explicitly allowing new bone motion influence; locked or invalid edits publish nothing", () => {
  const f = rigFixture(),
    root = f.project().artboards[0];
  if (!root) throw new Error("Missing board");
  const art = flattenScene(root.scene).find(({ node }) => node.tag === "rect")?.node;
  if (!art) throw new Error("Missing art");
  const rest = worldMatrix(root.scene, art.id);
  f.run([
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: f.clipId,
        targetId: "node-upper",
        property: "rotation",
        frame: 0,
        value: 0,
      },
    },
    {
      type: "rig",
      operation: "bind",
      boneId: "node-lower",
      targetIds: [art.id],
      confirmRestPose: true,
    },
  ]);
  const bound = f.project().artboards[0];
  if (!bound) throw new Error("Missing board");
  assert.deepEqual(worldMatrix(bound.scene, art.id), rest);
  const before = structuredClone(f.project());
  assert.throws(
    () => f.run([{ type: "rig", operation: "unregister-bone", targetId: "node-lower" }]),
    /IK|ossos/,
  );
  assert.deepEqual(f.project(), before);
  f.run([{ type: "scene", operation: "lock", targetId: "node-upper", value: true }]);
  const locked = structuredClone(f.project());
  assert.throws(
    () =>
      f.run([
        {
          type: "rig",
          operation: "update-bone",
          targetId: "node-lower",
          length: 120,
          minRotation: -180,
          maxRotation: 180,
        },
      ]),
    /bloqueado/,
  );
  assert.deepEqual(f.project(), locked);
});
