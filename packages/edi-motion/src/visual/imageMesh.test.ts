import { expect, test } from "vitest";
import { transformPoint } from "../affine";
import { assetId, encodeAssetData, parseAsset } from "../assets/model";
import { png } from "../assets/testFixtures";
import { identityTransform } from "../model";
import { parseRig } from "../rig/model";
import { describeVisualScene } from "./describe";
import {
  imageMeshClips,
  imageMeshMatrices,
  imageMeshRest,
  imageMeshTriangleCount,
} from "./imageMesh";
import { serializeVisualElement } from "./serialize";

const mesh = { columns: 2, rows: 1 },
  attrs = { x: "10", y: "20", width: "200", height: "100", preserveAspectRatio: "none" },
  image = { width: 40, height: 10 };

test("the rest grid spans the image box and maps image pixels onto it exactly", () => {
  const rest = imageMeshRest(mesh, attrs)[0]?.points ?? [];
  expect(rest.map(({ x, y }) => [x, y])).toEqual([
    [10, 20],
    [110, 20],
    [210, 20],
    [10, 120],
    [110, 120],
    [210, 120],
  ]);
  const matrices = imageMeshMatrices(mesh, image, rest);
  expect(matrices).toHaveLength(imageMeshTriangleCount(mesh));
  // At rest every triangle is the same scale+offset: image px → box.
  for (const matrix of matrices)
    for (const [u, v, x, y] of [
      [0, 0, 10, 20],
      [40, 10, 210, 120],
      [20, 5, 110, 70],
    ] as const) {
      const point = transformPoint(matrix, u, v);
      expect(point.x).toBeCloseTo(x, 9);
      expect(point.y).toBeCloseTo(y, 9);
    }
  expect(() => imageMeshRest(mesh, { ...attrs, preserveAspectRatio: "xMidYMid" })).toThrow(
    /preserveAspectRatio="none"/,
  );
  expect(() => imageMeshRest(mesh, { ...attrs, width: "50%" })).toThrow(/absolutos/);
});

test("a deformed vertex moves exactly the triangles that share it", () => {
  const rest = imageMeshRest(mesh, attrs)[0]?.points ?? [],
    moved = rest.map((point, index) => (index === 4 ? { ...point, x: 150, y: 140 } : point)),
    before = imageMeshMatrices(mesh, image, rest),
    after = imageMeshMatrices(mesh, image, moved);
  // Vertex 4 (bottom middle) belongs to triangles 0, 1 and 3 of the 2×1 grid, not to 2.
  expect(after[2]).toEqual(before[2]);
  for (const index of [0, 1, 3]) expect(after[index]).not.toEqual(before[index]);
  const point = transformPoint(after[1] ?? [1, 0, 0, 1, 0, 0], 20, 10);
  expect(point.x).toBeCloseTo(150, 9);
  expect(point.y).toBeCloseTo(140, 9);
  // Clips are static, in image pixels, grown a little beyond each triangle.
  const [first] = imageMeshClips(mesh, image);
  const coordinates = (first ?? "").split(" ").map(Number);
  expect(Math.min(...coordinates)).toBeLessThan(0);
});

test("the renderer draws one clipped image copy per triangle with static clips", () => {
  const bytes = png(),
    asset = parseAsset({
      kind: "image",
      mime: "image/png",
      id: assetId(bytes),
      name: "Foto",
      data: encodeAssetData(bytes),
      byteLength: bytes.length,
      width: 1,
      height: 1,
    });
  const svg = serializeVisualElement(
    describeVisualScene(
      {
        viewBox: [0, 0, 300, 200],
        nodes: [
          {
            id: "node-photo",
            tag: "image",
            attrs,
            text: "",
            transform: identityTransform(),
            visible: true,
            children: [],
            assetId: asset.id,
            imageMesh: mesh,
          },
        ],
      },
      [asset],
      { mode: "runtime" },
    ),
  );
  expect(svg.match(/<clipPath id="edi-mesh-node-photo-\d"/g)).toHaveLength(4);
  expect(svg).toContain(`<g data-edi-image="${asset.id}" data-edi-mesh="2x1">`);
  expect(svg.split(`"><use href="#edi-${asset.id}"`)).toHaveLength(5);
});

test("rig skins and morphs accept a meshed image's grid as geometry", () => {
  const geometry = imageMeshRest(mesh, attrs),
    objects = new Map([
      ["node-bone", { tag: "g", parentId: null, transform: identityTransform() }],
      ["node-photo", { tag: "image", parentId: null, transform: identityTransform(), geometry }],
    ]);
  const rig = parseRig(
    {
      version: 2,
      bones: [{ targetId: "node-bone", length: 50, minRotation: -180, maxRotation: 180 }],
      constraints: [],
      morphs: [
        {
          id: "morph-bend",
          targetId: "node-photo",
          name: "Dobra",
          weight: 0,
          geometry: imageMeshRest(mesh, { ...attrs, y: "40" }),
        },
      ],
    },
    objects,
  );
  expect(rig.morphs?.[0]?.targetId).toBe("node-photo");
  expect(() =>
    parseRig(
      {
        version: 2,
        bones: [],
        constraints: [],
        morphs: [{ id: "morph-x", targetId: "node-photo", name: "X", weight: 0, geometry }],
      },
      new Map([["node-photo", { tag: "image", parentId: null, transform: identityTransform() }]]),
    ),
  ).toThrow(/malha/);
});
