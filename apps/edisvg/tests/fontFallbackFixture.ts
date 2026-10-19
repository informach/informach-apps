import { emptyBehavior } from "@informach/edi-motion/behavior";
import { applyAsset } from "../src/shared/assets";
import { newProject, parseProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
import { fontFixture, mathFontFixture } from "./assetFixtures";

export function fontFallbackFixture() {
  const project = newProject(),
    board = project.artboards[0],
    primary = fontFixture(),
    fallback = mathFontFixture();
  if (!board) throw new Error("Missing font board");
  board.scene.viewBox = [0, 0, 300, 100];
  for (const font of [primary, fallback])
    applyAsset(project, board.scene, { type: "asset", operation: "put", value: font });
  const textId = editScene(board.scene, null, "add", {
    tag: "text",
    attrs: { x: "10", y: "55", "font-size": "30", fill: "#000000", "text-anchor": "start" },
  });
  if (!textId) throw new Error("Missing fallback text");
  editScene(board.scene, textId, "text", "Texto 𝒜");
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    targetId: textId,
    assetId: primary.id,
    fontFallbackIds: [fallback.id],
  });
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-text", kind: "string", name: "Texto", initial: "Texto 𝒜" }],
    bindings: [
      {
        id: "binding-text",
        inputId: "input-text",
        targetId: textId,
        kind: "text",
        direction: "two-way",
      },
    ],
  };
  return { project: parseProject(project), boardId: board.id, textId, primary, fallback };
}
