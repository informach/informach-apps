import { emptyBehavior } from "@informach/edi-motion/behavior";
import { geometryPath } from "@informach/edi-motion/geometry";
import { applyAsset } from "../src/shared/assets";
import { parsePath } from "../src/shared/pathGeometry.js";
import { editScene } from "../src/shared/scene.js";
import { audioFixture, fontFixture, imageFixture, sliceImageFixture } from "./assetFixtures";
import { vectorEffectFixture } from "./vectorEffectFixture";
export function portableVisualFixture() {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  if (!board) throw new Error("Missing portable board");
  // Canonical source syntax also represents actual pre-v6 effect definitions.
  const source = board.scene.nodes.find((node) => node.id === fixture.sourceId);
  if (!source || !source.attrs.d) throw new Error("Missing source");
  editScene(board.scene, source.id, "attrs", { d: geometryPath(parsePath(source.attrs.d)) });
  const font = fontFixture(),
    audio = audioFixture(),
    image = sliceImageFixture();
  for (const asset of [font, audio, image, imageFixture()])
    applyAsset(fixture.project, board.scene, { type: "asset", operation: "put", value: asset });
  const textId = editScene(board.scene, null, "add", {
    tag: "text",
    attrs: { x: "10", y: "95", "font-size": "10" },
  });
  if (!textId) throw new Error("Missing portable text");
  editScene(board.scene, textId, "text", "EdiSVG");
  applyAsset(fixture.project, board.scene, {
    type: "asset",
    operation: "set-font",
    targetId: textId,
    assetId: font.id,
  });
  const imageId = applyAsset(fixture.project, board.scene, {
    type: "asset",
    operation: "insert-image",
    assetId: image.id,
  });
  if (!imageId) throw new Error("Missing portable image");
  editScene(board.scene, imageId, "attrs", { x: "80", y: "80", width: "20", height: "20" });
  editScene(board.scene, imageId, "image-slice", { top: 10, right: 10, bottom: 10, left: 10 });
  board.behavior = {
    ...emptyBehavior(),
    events: [
      {
        id: "event-portable",
        animationId: fixture.animationId,
        frame: 2,
        name: "Confirmação",
        data: {},
      },
    ],
  };
  board.audio = {
    version: 1,
    bindings: [
      {
        id: "audio-portable",
        eventId: "event-portable",
        assetId: audio.id,
        volume: 0.5,
        caption: "Confirmação portátil",
      },
    ],
  };
  return { ...fixture, font, audio, image, imageId, textId };
}
