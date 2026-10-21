import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackContext, evaluatePlaybackFrame } from "@informach/edi-motion";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { imageMeshRest } from "@informach/edi-motion/visual";
import { sliceImageFixture } from "../../tests/assetFixtures";
import { rigFixture } from "../../tests/rigFixture";
import { buildClipExport } from "../renderer/src/clipExport";
import { compileArtboard } from "./components";
import { compileInteractiveArtboard } from "./interactive";
import { parseProject } from "./project";
import { renderScene } from "./scene.js";

/** The rig fixture's two bones bend an image laid along them. */
function meshed() {
  const fixture = rigFixture(),
    image = sliceImageFixture();
  const rig = fixture.project().artboards[0]?.rig;
  assert.ok(rig);
  fixture.run([
    { type: "rig", operation: "replace", value: { ...rig, constraints: [] } },
    { type: "asset", operation: "put", value: image },
  ]);
  const id = fixture.run([
    { type: "asset", operation: "insert-image", assetId: image.id },
  ]).selected;
  assert.ok(id);
  fixture.run([
    {
      type: "scene",
      operation: "attrs",
      targetId: id,
      value: { x: "0", y: "-20", width: "200", height: "40", preserveAspectRatio: "none" },
    },
    { type: "scene", operation: "image-mesh", targetId: id, value: { columns: 4, rows: 1 } },
  ]);
  const node = () => fixture.project().artboards[0]?.scene.nodes.find((item) => item.id === id);
  return { ...fixture, id, image, node };
}

test("a meshed image exposes its grid and the rig skins it by bones", () => {
  const f = meshed();
  assert.deepEqual(f.node()?.imageMesh, { columns: 4, rows: 1 });
  assert.throws(
    () =>
      f.run([
        {
          type: "scene",
          operation: "attrs",
          targetId: f.id,
          value: { preserveAspectRatio: "xMidYMid" },
        },
      ]),
    /preserveAspectRatio="none"/,
  );
  f.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-photo",
      targetId: f.id,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const skin = f.project().artboards[0]?.rig?.skins?.[0];
  assert.equal(skin?.targetId, f.id);
  assert.equal(skin?.weights.length, 10);
  // Changing the grid would break the captured weights: refused, not silently remapped.
  assert.throws(() =>
    f.run([
      { type: "scene", operation: "image-mesh", targetId: f.id, value: { columns: 2, rows: 1 } },
    ]),
  );
  assert.throws(
    () => parseProject({ ...structuredClone(f.project()), version: 22 }),
    /requer projeto v23/,
  );
});

test("bending the lower bone deforms the grid by the captured weights", () => {
  const f = meshed();
  f.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-photo",
      targetId: f.id,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-rig",
        targetId: "node-lower",
        property: "rotation",
        frame: 10,
        value: 60,
      },
    },
  ]);
  const board = f.project().artboards[0];
  assert.ok(board);
  const compiled = compileArtboard(f.project(), board.id),
    context = createPlaybackContext(compiled.playback),
    clip = compiled.playback.motion.animations.find((item) => item.id === "animation-rig");
  assert.ok(clip);
  const rest = imageMeshRest({ columns: 4, rows: 1 }, f.node()?.attrs ?? {})[0]?.points ?? [],
    bent = evaluatePlaybackFrame(context, clip, 10).geometry.get(f.id)?.[0]?.points ?? [];
  assert.equal(bent.length, 10);
  // Inverse-square weights: the far-left vertex barely moves, the far-right one follows the lower bone.
  const moved = (index: number) =>
    Math.hypot(
      (bent[index]?.x ?? 0) - (rest[index]?.x ?? 0),
      (bent[index]?.y ?? 0) - (rest[index]?.y ?? 0),
    );
  assert.ok(moved(4) > 20 && moved(0) < moved(4) / 5, JSON.stringify([moved(0), moved(4)]));
  const interactive = compileInteractiveArtboard(f.project(), board.id, {
    animationId: "animation-rig",
  });
  const content = parseInteractiveDocument(interactive.document).content.find(
    (object) => object.id === f.id,
  );
  assert.deepEqual(content?.imageMesh, { columns: 4, rows: 1 });
  assert.equal(interactive.svg.match(/clip-path="url\(#edi-mesh-/g)?.length, 8);
  assert.match(renderScene(board.scene, { assets: f.project().assets }), /data-edi-mesh="4x1"/);
  assert.throws(
    () =>
      buildClipExport(
        f.project(),
        "animation-rig",
        { format: "svg", alt: "Malha", reduced: false, offscreen: false, artboardId: board.id },
        "",
      ),
    /Malha raster deformada/,
  );
});
