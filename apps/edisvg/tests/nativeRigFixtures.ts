/** Fixture graph loaded once through tsx's scoped API by the plain-Node harness. */
export { compileInteractiveArtboard } from "../src/shared/interactive";
export { compileLottie } from "../src/shared/lottie/compile";
export { parseProject } from "../src/shared/project";
export { audioProjectFixture } from "./audioFixture";
export { deformationFixture } from "./deformationFixture";
export { gradientFixture } from "./gradientFixture";
export { imageSliceFixture } from "./imageSliceFixture";
export { rigFixture } from "./rigFixture";
export { svgEffectImportSources } from "./svgEffectImportFixture";
export { svgSemanticSource } from "./svgSemanticFixture";
export { trimFixture } from "./trimFixture";

import { applyAsset } from "../src/shared/assets";
import { newProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
import { fontFixture, imageFixture } from "./assetFixtures";
export function nativeAssetFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing native artboard");
  board.scene.viewBox = [0, 0, 320, 240];
  const font = fontFixture(),
    image = imageFixture();
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: font });
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: image });
  const text = editScene(board.scene, null, "add", {
    tag: "text",
    attrs: { x: "10", y: "180", "font-size": "40", "text-anchor": "start", fill: "#15171c" },
  });
  if (!text) throw new Error("Missing native text");
  editScene(board.scene, text, "text", "Edi SVG");
  applyAsset(project, board.scene, {
    type: "asset",
    operation: "set-font",
    targetId: text,
    assetId: font.id,
  });
  for (const x of [10, 110]) {
    const id = applyAsset(project, board.scene, {
      type: "asset",
      operation: "insert-image",
      assetId: image.id,
    });
    if (!id) throw new Error("Missing native image");
    editScene(board.scene, id, "attrs", { x: String(x), y: "10", width: "80", height: "80" });
  }
  return { project, boardId: board.id, fontId: font.id };
}
export { ease } from "@informach/edi-motion";
export { animationKeySelectionId } from "../src/shared/animationKeyReference";
export { fontFallbackFixture } from "./fontFallbackFixture";
export { semanticFixture } from "./semanticFixture";
export { vectorEffectFixture } from "./vectorEffectFixture";
