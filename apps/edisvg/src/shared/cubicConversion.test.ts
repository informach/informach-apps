import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackContext, evaluatePlaybackFrame } from "@informach/edi-motion";
import { deformationFixture } from "../../tests/deformationFixture";
import { lottieRigFixture } from "../../tests/lottieFixture";
import { compileArtboard } from "./components";
import { prepareCubicConversion } from "./cubicConversion";
import { executeDocumentTransaction } from "./documentCommands";
import { createHistory } from "./history.js";
import { parsePath, pointOnSegment } from "./pathGeometry.js";
import { contentSnapshot, newProject, parseProject } from "./project";
import { editScene } from "./scene.js";

test("cubic conversion preserves every editable segment, anchors and closure without touching the source", () => {
  for (const source of [
    "M0 0L100 0L100 100Z",
    "M0 0H100V100",
    "M0 0C0 100 100 100 100 0S200 -100 200 0",
    "M0 0Q50 100 100 0T200 0",
    "M0 0A50 70 30 0 1 100 0Z",
    "M0 0L10 0 M20 20L20 30",
  ]) {
    const before = parsePath(source),
      copy = structuredClone(before),
      result = prepareCubicConversion(source),
      after = parsePath(result.pathData);
    assert.deepEqual(before, copy);
    assert.equal(after.length, before.length);
    assert.equal(/[LHQASTV]/i.test(result.pathData), false);
    assert.equal(prepareCubicConversion(result.pathData).changed, false);
    assert.equal(prepareCubicConversion(result.pathData).addedHandles, 0);
    for (const [index, contour] of before.entries()) {
      const converted = after[index];
      assert.ok(converted);
      assert.equal(converted.closed, contour.closed);
      assert.equal(converted.points.length, contour.points.length);
      const count = contour.points.length - (contour.closed ? 0 : 1);
      for (let segment = 0; segment < count; segment++)
        for (let step = 0; step <= 20; step++) {
          const a = pointOnSegment(contour, segment, step / 20),
            b = pointOnSegment(converted, segment, step / 20);
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.000002);
        }
    }
  }
});

test("conversion and its control-hull preview are bounded, including horizontal/vertical and zero length segments", () => {
  for (const source of [
    "M0 0L0 100",
    "M0 0L100 0",
    "M0 0L0 0",
    "M10000000 10000000L-10000000 -10000000",
  ]) {
    const result = prepareCubicConversion(source),
      box = result.preview.viewBox.split(" ").map(Number);
    assert.ok(box.every(Number.isFinite));
    assert.ok((box[2] ?? 0) > 0 && (box[3] ?? 0) > 0);
    assert.ok(result.preview.strokeWidth > 0);
  }
  for (const source of [
    "",
    "M0 0",
    "M0 0Z",
    "M0 0LNaN 2",
    "M0 0L10000001 2",
    `M0 0${"L1 1".repeat(4000)}`,
    " ".repeat(500001),
  ])
    assert.throws(() => prepareCubicConversion(source));
});

test("cubic conversion is a consent-gated atomic document transaction, retaining metadata and one reversible history entry", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  board.scene.source =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z"/></svg>';
  const id = editScene(board.scene, null, "add", {
    tag: "path",
    attrs: { d: "M0 0L100 0L100 100Z", fill: "red", stroke: "blue" },
  });
  assert.ok(id);
  const before = structuredClone(project),
    context = { project, sessionId: crypto.randomUUID(), revision: 0 },
    command = { type: "path-edit", operation: "cubicize", targetId: id },
    run = (commands: unknown[]) =>
      executeDocumentTransaction(context, {
        projectId: project.id,
        sessionId: context.sessionId,
        revision: 0,
        commands,
      });
  for (const confirmAppearanceChange of [undefined, false])
    assert.throws(() => run([{ ...command, confirmAppearanceChange }]));
  assert.deepEqual(project, before);
  const result = run([{ ...command, confirmAppearanceChange: true }]),
    node = result.project.artboards[0]?.scene.nodes[0],
    original = board.scene.nodes[0];
  assert.ok(node && original);
  assert.deepEqual(node, {
    ...original,
    attrs: { ...original.attrs, d: prepareCubicConversion(original.attrs.d ?? "").pathData },
  });
  assert.deepEqual(project, before);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(result.project))), result.project);
  const history = createHistory(contentSnapshot(project));
  history.commit(contentSnapshot(result.project));
  assert.deepEqual(history.undo(), contentSnapshot(project));
  assert.deepEqual(history.redo(), contentSnapshot(result.project));
  original.locked = true;
  const locked = structuredClone(project);
  assert.throws(() => run([{ ...command, confirmAppearanceChange: true }]), /Desbloqueie/);
  assert.deepEqual(project, locked);
});

test("a morph depending on missing handles blocks cubic conversion without publishing any part of a mixed transaction", () => {
  const fixture = deformationFixture(),
    before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        { type: "scene", operation: "rename", targetId: fixture.mouthId, value: "Não publicar" },
        {
          type: "path-edit",
          operation: "cubicize",
          targetId: fixture.mouthId,
          confirmAppearanceChange: true,
        },
      ]),
    /Morph requer alças correspondentes/,
  );
  assert.deepEqual(fixture.project(), before);
});

test("compatible vector skin retains weights/reference matrices and the same deformed curve locus after adding coincident handles", () => {
  const fixture = lottieRigFixture("skin"),
    board = fixture.project.artboards[0],
    skin = board?.rig?.skins?.[0];
  assert.ok(skin);
  const context = { project: fixture.project, sessionId: crypto.randomUUID(), revision: 0 },
    before = structuredClone(fixture.project),
    result = executeDocumentTransaction(context, {
      projectId: fixture.project.id,
      sessionId: context.sessionId,
      revision: 0,
      commands: [
        {
          type: "path-edit",
          operation: "cubicize",
          targetId: skin.targetId,
          confirmAppearanceChange: true,
        },
      ],
    });
  assert.deepEqual(result.project.artboards[0]?.rig, board.rig);
  assert.deepEqual(fixture.project, before);
  for (const frame of [0, 5, 10]) {
    const sample = (project: typeof fixture.project) => {
      const compiled = compileArtboard(project, fixture.boardId),
        clip = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId);
      assert.ok(clip);
      return evaluatePlaybackFrame(
        createPlaybackContext(compiled.playback),
        clip,
        frame,
      ).geometry.get(skin.targetId);
    };
    const a = sample(fixture.project),
      b = sample(result.project);
    assert.ok(a && b);
    for (const [index, contour] of a.entries()) {
      const converted = b[index];
      assert.ok(converted);
      for (let segment = 0; segment < contour.points.length; segment++)
        for (let step = 0; step <= 10; step++) {
          const p = pointOnSegment(contour, segment, step / 10),
            q = pointOnSegment(converted, segment, step / 10);
          assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-8);
        }
    }
  }
});
