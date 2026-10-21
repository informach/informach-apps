import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lottieBoxGradientFixture,
  lottieBoxGradientProfiles,
} from "../../../tests/lottieBoxGradientFixture";
import { compileLottie } from "./compile";
import type { ShapeElement } from "./model";
import { shapeLayers } from "./model";
import { inspectLottieCompatibility, prepareLottie } from "./prepare";

function elements(shapes: readonly ShapeElement[]): ShapeElement[] {
  return shapes.flatMap((shape) => (shape.ty === "gr" ? [shape, ...elements(shape.it)] : [shape]));
}

test("relative paint emits real sampled Lottie coordinates/opacity after morph and skin without persisting derived bounds", () => {
  for (const profile of lottieBoxGradientProfiles) {
    const fixture = lottieBoxGradientFixture(profile),
      before = JSON.stringify(fixture.project),
      options = { artboardId: fixture.boardId, animationId: fixture.clipId },
      report = inspectLottieCompatibility(fixture.project, options);
    assert.equal(report.supported, true, `${profile}: ${JSON.stringify(report.issues)}`);
    const output = compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
      shapes = elements(shapeLayers(output.document)[0]?.shapes ?? []),
      paint = shapes.find((shape) => shape.ty === "gf");
    assert.ok(paint?.ty === "gf");
    assert.equal(paint.g.p, 3);
    assert.equal(paint.g.k.k.length, 18);
    assert.equal(output.content.includes("relative-gradient"), false);
    assert.deepEqual(JSON.parse(output.content), output.document);
    assert.equal(JSON.stringify(fixture.project), before);
    if (profile === "morph") {
      assert.equal(paint.s.a, 1);
      assert.equal(paint.e.a, 1);
      if (paint.s.a !== 1) throw new Error("Missing sampled gradient");
      assert.deepEqual(paint.s.k.find((key) => key.t === 15)?.s, [33.5, 35]);
    }
    if (profile === "degenerate") {
      assert.equal(paint.o.a, 1);
      if (paint.o.a !== 1) throw new Error("Missing sampled opacity");
      assert.equal(paint.o.k.find((key) => key.t === 15)?.s[0], 0);
      assert.ok(paint.o.k.some((key) => key.t > 15 && key.s[0] === 80));
      assert.ok(shapes.some((shape) => shape.ty === "st"));
    }
  }
});

test("relative inspection rejects a late morph's gradient bounds, preserving the source and object diagnostic", () => {
  const fixture = lottieBoxGradientFixture("morph"),
    board = fixture.project.artboards[0],
    node = board?.scene.nodes[0],
    gradient = node?.gradients?.fill,
    morph = board?.rig?.morphs?.[0];
  assert.ok(board && node && gradient?.kind === "linear" && morph);
  Object.assign(gradient, { x1: 0, y1: 0, x2: 100000, y2: 0 });
  for (const contour of morph.geometry)
    for (const point of contour.points)
      for (const value of [point, point.in, point.out]) if (value) value.x *= 4;
  const before = JSON.stringify(fixture.project),
    options = { artboardId: board.id, animationId: fixture.clipId },
    report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.equal(report.issues[0]?.objectId, node.id);
  assert.match(report.issues[0]?.message ?? "", /Coordenadas de gradiente/);
  assert.throws(
    () =>
      compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
    /Coordenadas de gradiente/,
  );
  assert.equal(JSON.stringify(fixture.project), before);
});

test("relative extrema work is included in preflight before recording or progress", () => {
  const fixture = lottieBoxGradientFixture(),
    board = fixture.project.artboards[0],
    source = board?.scene.nodes[0],
    clip = fixture.project.motion.animations[0];
  assert.ok(board && source && clip);
  board.scene.nodes = Array.from({ length: 8 }, (_, index) => ({
    ...structuredClone(source),
    id: index === 0 ? source.id : `node-relative-cost-${index}`,
  }));
  clip.frames = 1199;
  const options = { artboardId: board.id, animationId: clip.id },
    before = JSON.stringify(fixture.project),
    progress: number[] = [],
    prepared = prepareLottie(fixture.project, options);
  assert.equal(prepared.report.supported, false);
  assert.ok(prepared.report.issues.some((issue) => issue.code === "cost"));
  assert.throws(
    () =>
      compileLottie(
        fixture.project,
        { ...options, confirmSampling: true, confirmRendererPrecision: true },
        (value) => progress.push(value),
      ),
    /orçamento/,
  );
  assert.deepEqual(progress, []);
  assert.equal(JSON.stringify(fixture.project), before);
  for (const node of board.scene.nodes) {
    const gradient = node.gradients?.fill;
    assert.ok(gradient);
    gradient.units = "userSpaceOnUse";
  }
  assert.equal(prepareLottie(fixture.project, options).report.supported, true);
});

test("relative native-line skin is refused before sampling instead of silently changing rasterized borders", () => {
  const fixture = lottieBoxGradientFixture("skin-linear"),
    before = JSON.stringify(fixture.project),
    options = { artboardId: fixture.boardId, animationId: fixture.clipId },
    progress: number[] = [],
    report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => /segmentos cúbicos na fonte/.test(issue.message)));
  assert.throws(
    () =>
      compileLottie(
        fixture.project,
        { ...options, confirmSampling: true, confirmRendererPrecision: true },
        (value) => progress.push(value),
      ),
    /segmentos cúbicos na fonte/,
  );
  assert.deepEqual(progress, []);
  assert.equal(JSON.stringify(fixture.project), before);
});

test("relative paint does not silently cubicize native primitives, quadratic curves or arcs", () => {
  for (const profile of ["rect", "circle", "quadratic", "arc"] as const) {
    const fixture = lottieBoxGradientFixture(),
      board = fixture.project.artboards[0],
      node = board?.scene.nodes[0];
    assert.ok(node);
    if (profile === "rect" || profile === "circle") {
      node.tag = profile;
      delete node.attrs.d;
      Object.assign(
        node.attrs,
        profile === "rect"
          ? { x: "20", y: "30", width: "70", height: "50" }
          : { cx: "50", cy: "50", r: "20" },
      );
    } else
      node.attrs.d = profile === "quadratic" ? "M20 30Q50 0 90 30Z" : "M20 30A30 20 0 0 1 90 30Z";
    const before = JSON.stringify(fixture.project),
      report = inspectLottieCompatibility(fixture.project, {
        artboardId: fixture.boardId,
        animationId: fixture.clipId,
      });
    assert.equal(report.supported, false);
    assert.ok(
      report.issues.some((issue) => /segmentos cúbicos na fonte/.test(issue.message)),
      profile,
    );
    assert.equal(JSON.stringify(fixture.project), before);
  }
});
