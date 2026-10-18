import assert from "node:assert/strict";
import { identityTransform } from "@informach/edi-motion";
import type { Gradient } from "@informach/edi-motion/graphics";
import { parseProject } from "../src/shared/project";
import { lottieFixture, lottieStrokeFixture } from "./lottieFixture";

export type LottieGradientProfile =
  | "linear"
  | "linear-matrix"
  | "radial"
  | "radial-focus"
  | "radial-reflection"
  | "hierarchy"
  | "solid-override"
  | "fill-and-stroke"
  | "global-affine"
  | "radial-global-affine"
  | "animated-affine"
  | "hard-stops";
export const lottieGradientProfiles: readonly LottieGradientProfile[] = [
  "linear",
  "linear-matrix",
  "radial",
  "radial-focus",
  "radial-reflection",
  "hierarchy",
  "solid-override",
  "fill-and-stroke",
  "global-affine",
  "radial-global-affine",
  "animated-affine",
  "hard-stops",
];
export function lottieGradientFixture(profile: LottieGradientProfile = "linear") {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    first = board?.scene.nodes[0];
  assert.ok(board && first);
  first.attrs.d = "M20 30C20 30 80 30 80 30C80 30 80 90 80 90C80 90 20 90 20 90C20 90 20 30 20 30Z";
  first.attrs["fill-opacity"] = "80%";
  const common = {
    units: "userSpaceOnUse",
    spread: "pad",
    stops: [
      { offset: 0, color: "#e33a60", opacity: 0.2 },
      { offset: 0.5, color: "#2050b0", opacity: 0.7 },
      { offset: 1, color: "#4fe3c1", opacity: 1 },
    ],
  } as const;
  // Mutable owned stops are required by the document schema, not readonly
  // assertions passed through as mutable production objects.
  const gradient: Gradient = profile.startsWith("radial")
    ? {
        ...common,
        stops: structuredClone([...common.stops]),
        kind: "radial",
        cx: 50,
        cy: 60,
        r: 35,
        fx: profile === "radial" ? 50 : 60,
        fy: profile === "radial" ? 60 : 53,
        ...(profile === "radial-reflection" ? { transform: [-1, 0, 0, 1, 100, 0] } : {}),
      }
    : {
        ...common,
        stops: structuredClone([...common.stops]),
        kind: "linear",
        x1: 20,
        y1: 30,
        x2: 80,
        y2: 90,
        ...(profile === "linear-matrix" ? { transform: [1.2, 0.2, 0.35, 0.9, -12, 4] } : {}),
      };
  first.gradients = { fill: gradient };
  if (profile === "hard-stops")
    gradient.stops.splice(2, 0, { offset: 0.5, color: "#f0a020", opacity: 0.4 });
  if (profile === "global-affine" || profile === "radial-global-affine")
    Object.assign(fixture.project.transforms, { sx: 1.2, sy: 0.7, rotation: -3, opacity: 80 });
  if (profile === "animated-affine") {
    const clip = fixture.project.motion.animations[0];
    assert.ok(clip);
    first.transform.px = 50;
    first.transform.py = 60;
    for (const [property, end] of [
      ["sx", -1],
      ["sy", 0.5],
      ["skewX", 12],
    ] as const)
      clip.tracks.push({
        id: `track-gradient-${property}`,
        targetId: first.id,
        property,
        keys: [
          {
            id: `key-gradient-${property}-a`,
            frame: 0,
            value: property === "skewX" ? 0 : 1,
            easing: "linear",
          },
          { id: `key-gradient-${property}-b`, frame: 30, value: end, easing: "linear" },
        ],
      });
  }
  if (profile === "fill-and-stroke") {
    first.attrs.stroke = "#301020";
    first.attrs["stroke-width"] = "4";
  }
  if (profile === "hierarchy" || profile === "solid-override") {
    delete first.gradients;
    first.attrs.fill = profile === "solid-override" ? "#123456" : "inherit";
    const sibling = {
      ...structuredClone(first),
      id: "node-gradient-overlap",
      transform: { ...identityTransform(), x: 20, y: 10 },
    };
    board.scene.nodes = [
      {
        id: "node-gradient-parent",
        name: "Grupo gradiente",
        tag: "g",
        attrs: { opacity: "0.65" },
        text: "",
        transform: {
          ...identityTransform(),
          x: 8,
          y: 6,
          sx: 1.2,
          sy: 0.75,
          rotation: 12,
          skewX: 9,
        },
        gradients: { fill: gradient },
        children: [first, sibling],
        visible: true,
        locked: false,
      },
    ];
    fixture.project.transforms.opacity = 80;
  }
  return { ...fixture, project: parseProject(fixture.project) };
}

export function lottiePaintHierarchyFixture(profile: "gradient" | "stroke", depth: number) {
  const fixture =
      profile === "gradient"
        ? lottieGradientFixture()
        : lottieStrokeFixture({ cap: "butt", animated: false, reflection: false }),
    board = fixture.project.artboards[0];
  assert.ok(board);
  const wrappers = profile === "gradient" ? depth : depth - 1;
  for (let index = 0; index < wrappers; index++)
    board.scene.nodes = [
      {
        id: `node-export-depth-${index}`,
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
  return { ...fixture, project: parseProject(fixture.project) };
}
