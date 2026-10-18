import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import { applyAsset } from "../src/shared/assets";
import { newProject, parseProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
import { sliceImageFixture } from "./assetFixtures";
export function imageSliceFixture(layout = true) {
  const project = newProject(),
    board = project.artboards[0],
    asset = sliceImageFixture();
  if (!board) throw new Error("Missing image board");
  board.scene.viewBox = [0, 0, 100, 60];
  applyAsset(project, board.scene, { type: "asset", operation: "put", value: asset });
  const id = applyAsset(project, board.scene, {
    type: "asset",
    operation: "insert-image",
    assetId: asset.id,
  });
  if (!id) throw new Error("Missing image object");
  editScene(board.scene, id, "attrs", { x: "0", y: "0", width: "100", height: "60" });
  editScene(board.scene, id, "image-slice", { top: 10, right: 10, bottom: 10, left: 10 });
  if (layout)
    board.layout = {
      version: 1,
      root: { ...defaultLayoutContainer(), flow: "column", align: "stretch", gap: [0, 0] },
      containers: [],
      items: [
        {
          ...defaultLayoutItem(id),
          width: { kind: "fill", weight: 1 },
          height: { kind: "fill", weight: 1 },
        },
      ],
    };
  return { project: parseProject(project), boardId: board.id, imageId: id, asset };
}
