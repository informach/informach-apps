import assert from "node:assert/strict";
import { test } from "node:test";
import { identityTransform } from "@informach/edi-motion";
import { parseAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import { newProject } from "../../../shared/project";
import { buildPlayerWebExport } from "./player-web-export";

test("player export selects the requested populated artboard and carries the real portable scene", () => {
  const project = newProject();
  const board = structuredClone(project.artboards[0]);
  assert.ok(board);
  board.id = "artboard-art";
  board.name = "Desenho";
  board.scene.nodes = [
    {
      id: "node-shape",
      tag: "rect",
      name: "Quadrado",
      attrs: { x: "0", y: "0", width: "20", height: "20", fill: "#112233" },
      text: "",
      visible: true,
      locked: false,
      children: [],
      transform: identityTransform(),
    },
  ];
  project.artboards.push(board);
  const options = {
    format: "player-web",
    alt: "Quadrado",
    reduced: true,
    offscreen: true,
    artboardId: board.id,
  };
  const original = structuredClone(project);
  const result = buildPlayerWebExport(project, options);
  assert.equal(result.extension, "edi-animation.json");
  assert.equal(result.type, "application/json");
  const artifact = parseAnimationArtifact(result.content);
  assert.equal(artifact.document.content.length, 1);
  assert.deepEqual(project, original);
  assert.equal(buildPlayerWebExport(project, options).content, result.content);
  assert.throws(
    () => buildPlayerWebExport(project, { ...options, artboardId: "artboard-missing" }),
    /prancheta/i,
  );
  assert.throws(
    () => buildPlayerWebExport(project, { ...options, artboardId: project.defaultArtboardId }),
    /vazia/,
  );
});
