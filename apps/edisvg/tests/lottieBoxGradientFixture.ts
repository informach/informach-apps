import assert from "node:assert/strict";
import { parseGeometry } from "@informach/edi-motion/geometry";
import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { pathFromNode } from "../src/shared/pathGeometry.js";
import { parseProject } from "../src/shared/project";
import { flattenScene } from "../src/shared/scene.js";
import { lottieRigFixture } from "./lottieFixture";
import { lottieGradientFixture } from "./lottieGradientFixture";

export type LottieBoxGradientProfile =
  | "linear"
  | "matrix"
  | "curve"
  | "hierarchy"
  | "morph"
  | "skin"
  | "degenerate";
export const lottieBoxGradientProfiles: readonly LottieBoxGradientProfile[] = [
  "linear",
  "matrix",
  "curve",
  "hierarchy",
  "morph",
  "skin",
  "degenerate",
];

export function lottieBoxGradientFixture(
  profile: LottieBoxGradientProfile | "skin-linear" = "linear",
) {
  const fixture = lottieGradientFixture(profile === "hierarchy" ? "hierarchy" : "linear"),
    board = fixture.project.artboards[0],
    root = board?.scene.nodes[0],
    node = profile === "hierarchy" ? root?.children[0] : root,
    gradient = root?.gradients?.fill;
  assert.ok(board && root && node && gradient?.kind === "linear");
  Object.assign(gradient, {
    units: "objectBoundingBox",
    x1: 0.1,
    y1: 0.15,
    x2: 0.9,
    y2: 0.8,
    ...(profile === "matrix" ? { transform: [-1.2, 0.2, 0.35, 0.9, 1, 0.05] } : {}),
  });
  if (profile === "skin" || profile === "skin-linear") {
    const rigFixture = lottieRigFixture("skin"),
      rigBoard = rigFixture.project.artboards[0],
      target = rigBoard?.rig?.skins?.[0]?.targetId,
      art = rigBoard && flattenScene(rigBoard.scene).find(({ node }) => node.id === target)?.node;
    assert.ok(art);
    art.gradients = { fill: structuredClone(gradient) };
    art.attrs["fill-opacity"] = "80%";
    const sessionId = crypto.randomUUID(),
      project =
        profile === "skin"
          ? executeDocumentTransaction(
              { project: rigFixture.project, sessionId, revision: 0 },
              {
                projectId: rigFixture.project.id,
                sessionId,
                revision: 0,
                commands: [
                  {
                    type: "path-edit",
                    operation: "cubicize",
                    targetId: art.id,
                    confirmAppearanceChange: true,
                  },
                ],
              },
            ).project
          : rigFixture.project;
    assert.deepEqual(project.artboards[0]?.rig, rigBoard?.rig);
    return { ...rigFixture, project: parseProject(project) };
  }
  // Non-square bounds are essential: naive endpoint transforms appear correct
  // on some square/axis-aligned gradients but change the general scalar field.
  node.attrs.d = "M20 30C20 30 90 30 90 30C90 30 90 80 90 80C90 80 20 80 20 80C20 80 20 30 20 30Z";
  if (profile === "curve") node.attrs.d = "M20 70C0 -40 110 -20 90 70C90 70 20 70 20 70Z";
  if (profile === "morph" || profile === "degenerate") {
    const geometry = parseGeometry(pathFromNode(node));
    for (const contour of geometry)
      for (const point of contour.points)
        for (const value of [point, point.in, point.out])
          if (value) {
            value.x = profile === "degenerate" ? 50 : value.x * 0.5 + 20;
            if (profile === "morph") value.y = value.y * 1.2 - 10;
          }
    if (profile === "degenerate") {
      node.attrs.stroke = "#301020";
      node.attrs["stroke-width"] = "4";
    }
    board.rig = {
      version: 2,
      bones: [],
      constraints: [],
      targets: [],
      morphs: [{ id: "morph-relative", name: "Tamanho", targetId: node.id, weight: 0, geometry }],
      parameterClips: [
        {
          animationId: fixture.clipId,
          tracks: [
            {
              id: "track-relative-morph",
              targetId: "morph-relative",
              property: "weight",
              keys: [
                { id: "key-relative-morph-a", frame: 0, value: 0, easing: "linear" },
                { id: "key-relative-morph-b", frame: 15, value: 1, easing: "linear" },
                { id: "key-relative-morph-c", frame: 30, value: 0, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
  }
  return { ...fixture, project: parseProject(fixture.project) };
}
