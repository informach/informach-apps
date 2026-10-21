import assert from "node:assert/strict";
import { test } from "node:test";
import { identityTransform } from "@informach/edi-motion";
import { parseGeometry } from "@informach/edi-motion/geometry";
import {
  lottieGradientFixture,
  lottieGradientProfiles,
  lottiePaintHierarchyFixture,
} from "../../../tests/lottieGradientFixture";
import { pathFromNode } from "../pathGeometry.js";
import { compileLottie } from "./compile";
import type { ShapeElement } from "./model";
import { shapeLayers } from "./model";
import { inspectLottieCompatibility, prepareLottie } from "./prepare";

test("paint-space hierarchy depth is refused by inspection before structural JSON overflow, not after recording output", () => {
  for (const profile of ["gradient", "stroke"] as const)
    for (const depth of [26, 28, 29, 31]) {
      const fixture = lottiePaintHierarchyFixture(profile, depth),
        before = JSON.stringify(fixture.project),
        options = { artboardId: fixture.boardId, animationId: fixture.clipId },
        report = inspectLottieCompatibility(fixture.project, options),
        progress: number[] = [];
      assert.equal(report.supported, depth <= 28, `${profile} ${depth}`);
      if (depth <= 28)
        compileLottie(fixture.project, {
          ...options,
          confirmSampling: true,
          confirmRendererPrecision: true,
        });
      else {
        assert.ok(report.issues.some((issue) => issue.code === "hierarchy"));
        assert.throws(
          () =>
            compileLottie(
              fixture.project,
              { ...options, confirmSampling: true, confirmRendererPrecision: true },
              (completed) => progress.push(completed),
            ),
          /profundidade|Hierarquia/,
        );
        assert.deepEqual(progress, []);
      }
      assert.equal(JSON.stringify(fixture.project), before);
    }
});

test("maximum paint-space depth still exports animated morphology at the JSON depth boundary", () => {
  const fixture = lottieGradientFixture(),
    board = fixture.project.artboards[0],
    animation = fixture.project.motion.animations[0],
    node = board?.scene.nodes[0];
  assert.ok(board && animation && node?.attrs.d);
  const geometry = parseGeometry(pathFromNode(node));
  for (const contour of geometry)
    for (const point of contour.points) {
      point.y += 10;
      if (point.in) point.in.y += 10;
      if (point.out) point.out.y += 10;
    }
  board.rig = {
    version: 2,
    bones: [],
    constraints: [],
    targets: [],
    morphs: [{ id: "morph-depth", name: "Profundidade", targetId: node.id, weight: 0, geometry }],
    parameterClips: [
      {
        animationId: animation.id,
        tracks: [
          {
            id: "track-depth-morph",
            targetId: "morph-depth",
            property: "weight",
            keys: [
              { id: "key-depth-morph-a", frame: 0, value: 0, easing: "linear" },
              { id: "key-depth-morph-b", frame: animation.frames, value: 1, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  for (let index = 0; index < 28; index++)
    board.scene.nodes = [
      {
        id: `node-morph-depth-${index}`,
        name: "Grupo",
        tag: "g",
        attrs: {},
        text: "",
        transform: identityTransform(),
        visible: true,
        locked: false,
        children: board.scene.nodes,
      },
    ];
  const options = { artboardId: fixture.boardId, animationId: animation.id };
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, true);
  const result = compileLottie(fixture.project, {
    ...options,
    confirmSampling: true,
    confirmRendererPrecision: true,
  });
  assert.deepEqual(JSON.parse(result.content), result.document);
  assert.ok(
    elements(shapeLayers(result.document)[0]?.shapes ?? []).some(
      (shape) => shape.ty === "sh" && shape.ks.a === 1,
    ),
  );
});

const elements = (values: ShapeElement[]): ShapeElement[] =>
  values.flatMap((value) => [value, ...(value.ty === "gr" ? elements(value.it) : [])]);
test("typed gradient fills emit real gf styles in their local paint hierarchy, retain source and require all conversion consents", () => {
  for (const profile of lottieGradientProfiles) {
    const fixture = lottieGradientFixture(profile),
      before = JSON.stringify(fixture.project),
      options = { artboardId: fixture.boardId, animationId: fixture.clipId },
      report = inspectLottieCompatibility(fixture.project, options);
    assert.equal(report.supported, true, `${profile}: ${JSON.stringify(report)}`);
    assert.equal(report.requiresRendererPrecisionConsent, true);
    assert.throws(() => compileLottie(fixture.project, options), /Confirme/);
    const output = compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
      shapes = elements(shapeLayers(output.document)[0]?.shapes ?? []),
      gradients = shapes.filter((shape) => shape.ty === "gf");
    assert.equal(
      gradients.length,
      profile === "solid-override" ? 0 : profile === "hierarchy" ? 2 : 1,
    );
    for (const gradient of gradients) {
      assert.equal(gradient.g.p, profile === "hard-stops" ? 4 : 3);
      assert.equal(gradient.g.k.k.length, gradient.g.p * 6);
      assert.equal(gradient.o.k, 80);
    }
    assert.equal(
      shapes.some((shape) => shape.ty === "st"),
      profile === "fill-and-stroke",
    );
    assert.deepEqual(JSON.parse(output.content), output.document);
    assert.equal(JSON.stringify(fixture.project), before);
  }
});

test("unsupported radial relative gradients and effective gradient strokes refuse output instead of falling back to inherited solids", () => {
  for (const channel of ["fill", "stroke"] as const) {
    const fixture = lottieGradientFixture("radial"),
      node = fixture.project.artboards[0]?.scene.nodes[0],
      gradient = node?.gradients?.fill;
    assert.ok(node && gradient);
    node.gradients =
      channel === "fill"
        ? { fill: { ...gradient, units: "objectBoundingBox" } }
        : { stroke: gradient };
    node.attrs.stroke = "none";
    const before = JSON.stringify(fixture.project),
      options = { artboardId: fixture.boardId, animationId: fixture.clipId };
    assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
    assert.throws(() =>
      compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
    );
    assert.equal(JSON.stringify(fixture.project), before);
  }
});

test("gradient inspection visits late world-coordinate bounds and never publishes a partial export", () => {
  const fixture = lottieGradientFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0],
    node = board?.scene.nodes[0],
    gradient = node?.gradients?.fill;
  assert.ok(board && clip && node && gradient?.kind === "linear");
  Object.assign(gradient, { x1: 90000, y1: 0, x2: 100000, y2: 0 });
  board.scene.nodes = [
    {
      id: "node-gradient-size",
      name: "Escala",
      tag: "g",
      attrs: {},
      text: "",
      transform: { ...identityTransform(), sx: 20, sy: 20 },
      children: [node],
      visible: true,
      locked: false,
    },
  ];
  clip.tracks.push({
    id: "track-gradient-size",
    targetId: node.id,
    property: "sx",
    keys: [
      { id: "key-gradient-size-a", frame: 0, value: 1, easing: "hold" },
      { id: "key-gradient-size-b", frame: 30, value: 20, easing: "linear" },
    ],
  });
  const options = { artboardId: fixture.boardId, animationId: fixture.clipId },
    before = JSON.stringify(fixture.project);
  assert.equal(prepareLottie(fixture.project, options).report.supported, true);
  const report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.match(report.issues[0]?.message ?? "", /gradiente transformado/);
  assert.throws(
    () =>
      compileLottie(fixture.project, {
        ...options,
        confirmSampling: true,
        confirmRendererPrecision: true,
      }),
    /gradiente transformado/,
  );
  assert.equal(JSON.stringify(fixture.project), before);
});

test("gradient sample cost is included in preflight before progress or output recording", () => {
  const fixture = lottieGradientFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0],
    source = board?.scene.nodes[0];
  assert.ok(board && clip && source);
  board.scene.nodes = Array.from({ length: 20 }, (_, index) => ({
    ...structuredClone(source),
    id: index === 0 ? source.id : `node-gradient-cost-${index}`,
  }));
  clip.frames = 1199;
  const options = { artboardId: fixture.boardId, animationId: fixture.clipId },
    progress: number[] = [],
    report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => issue.code === "cost"));
  assert.throws(() =>
    compileLottie(
      fixture.project,
      { ...options, confirmSampling: true, confirmRendererPrecision: true },
      (completed) => progress.push(completed),
    ),
  );
  assert.deepEqual(progress, []);
});
