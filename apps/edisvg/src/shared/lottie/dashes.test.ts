import assert from "node:assert/strict";
import { test } from "node:test";
import { lottieFixture } from "../../../tests/lottieFixture";
import { prepareCubicConversion } from "../cubicConversion";
import { parsePath } from "../pathGeometry.js";
import { compileLottie, LottieExportError } from "./compile";
import { lottieDashProperties, lottieDashWork, prepareLottieDashes } from "./dashes";
import type { ShapeStroke } from "./model";
import { shapeLayers } from "./model";
import { inspectLottieCompatibility, prepareLottie } from "./prepare";

test("numeric Lottie dash patterns normalize odd lists and all-zero solid without admitting malformed/unbounded values", () => {
  assert.equal(prepareLottieDashes(undefined), undefined);
  assert.equal(prepareLottieDashes("none"), undefined);
  assert.equal(prepareLottieDashes("0, 0 0"), undefined);
  assert.deepEqual(prepareLottieDashes("2, 3\t4"), [2, 3, 4, 2, 3, 4]);
  assert.deepEqual(prepareLottieDashes("0 8"), [0, 8]);
  assert.deepEqual(prepareLottieDashes("+2e1 3.5"), [20, 3.5]);
  assert.equal(prepareLottieDashes(Array(32).fill("1").join(" "))?.length, 32);
  for (const value of [
    "",
    "-1 2",
    "NaN 2",
    "1e309 2",
    "10000001 2",
    "2px 3",
    "2% 3",
    "1,,2",
    ",1 2",
    "1 2,",
    "1-2",
    "var(--dash)",
    "2\u00a03",
    "2\f3",
    Array(33).fill("1").join(" "),
    " ".repeat(4097),
  ])
    assert.throws(() => prepareLottieDashes(value), value);
});

test("dash emission alternates d/g and appends explicit zero offset without mutating its pattern", () => {
  const pattern = Object.freeze([2, 3, 4, 2, 3, 4]),
    result = lottieDashProperties(pattern);
  assert.deepEqual(
    result.map((item) => item.n),
    ["d", "g", "d", "g", "d", "g", "o"],
  );
  assert.deepEqual(
    result.map((item) => item.v),
    [...pattern, 0].map((value) => ({ a: 0, k: value })),
  );
  assert.deepEqual(pattern, [2, 3, 4, 2, 3, 4]);
});

test("dash density uses the control polygon upper bound, includes dots and refuses excessive/tiny periods before export", () => {
  const geometry = parsePath("M0 0C0 100 100 100 100 0");
  assert.equal(lottieDashWork(geometry, undefined), 0);
  assert.equal(lottieDashWork(geometry, [5, 5]), 124);
  assert.equal(lottieDashWork(geometry, [0, 10]), 124);
  for (const pattern of [
    [0, 0],
    [1e-300, 1e-300],
    [Infinity, 1],
  ])
    assert.throws(() => lottieDashWork(geometry, pattern));
});

test("dashes preserve real inherited appearance and local units in compilation and leave project unchanged", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    node = board?.scene.nodes[0];
  assert.ok(board && node);
  node.attrs.d = prepareCubicConversion(node.attrs.d ?? "").pathData;
  delete node.attrs.stroke;
  board.scene.nodes = [
    {
      ...node,
      id: "node-dash-parent",
      name: "Tracejados herdados",
      tag: "g",
      attrs: { stroke: "red", "stroke-dasharray": "2,3,4" },
      children: [node],
      transform: { ...node.transform },
    },
  ];
  const before = structuredClone(fixture.project),
    options = {
      artboardId: board.id,
      animationId: fixture.clipId,
      confirmSampling: true,
      confirmRendererPrecision: true,
    },
    output = compileLottie(fixture.project, options),
    group = shapeLayers(output.document)[0]?.shapes[0];
  assert.ok(group?.ty === "gr");
  const pending = [...group.it];
  let stroke: ShapeStroke | undefined;
  while (pending.length) {
    const item = pending.pop();
    if (item?.ty === "st") {
      stroke = item;
      break;
    }
    if (item?.ty === "gr") pending.push(...item.it);
  }
  assert.ok(stroke?.ty === "st");
  assert.deepEqual(stroke.d, lottieDashProperties([2, 3, 4, 2, 3, 4]));
  assert.deepEqual(fixture.project, before);
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, true);
  node.attrs["stroke-dasharray"] = "1e-300 1e-300";
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  assert.throws(() => compileLottie(fixture.project, options), /Densidade/);
});

test("morph-introduced dash density at the inclusive last frame fails inspection and generation atomically", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    node = board?.scene.nodes[0];
  assert.ok(board && node);
  node.attrs = {
    d: prepareCubicConversion("M0 0L1 0L1 1Z").pathData,
    fill: "none",
    stroke: "red",
    "stroke-dasharray": "1 1",
  };
  board.rig = {
    version: 2,
    bones: [],
    targets: [],
    constraints: [],
    morphs: [
      {
        id: "morph-dash",
        name: "Densidade",
        targetId: node.id,
        weight: 0,
        geometry: prepareCubicConversion("M0 0L1000000 0L1000000 1000000Z").contours,
      },
    ],
    solos: [],
    skins: [],
    parameterClips: [
      {
        animationId: fixture.clipId,
        tracks: [
          {
            id: "track-dash-morph",
            targetId: "morph-dash",
            property: "weight",
            keys: [
              { id: "key-dash-start", frame: 0, value: 0, easing: "hold" },
              { id: "key-dash-end", frame: 30, value: 1, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(fixture.project),
    options = {
      artboardId: board.id,
      animationId: fixture.clipId,
      confirmSampling: true,
      confirmRendererPrecision: true,
    };
  assert.equal(prepareLottie(fixture.project, options).report.supported, true);
  const report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.equal(report.issues[0]?.objectId, node.id);
  assert.match(report.issues[0]?.message ?? "", /Densidade/);
  assert.throws(
    () => compileLottie(fixture.project, options),
    (error: unknown) => error instanceof LottieExportError && error.report.supported === false,
  );
  assert.deepEqual(fixture.project, before);
});
