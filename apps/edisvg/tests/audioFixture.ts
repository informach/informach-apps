import { emptyBehavior } from "@informach/edi-motion/behavior";
import { newProject } from "../src/shared/project";
import { audioFixture } from "./assetFixtures";
export function audioProjectFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing audio board");
  const asset = audioFixture();
  project.assets = [asset];
  project.motion = {
    version: 2,
    animations: [
      { id: "animation-tone", name: "Som", fps: 10, frames: 10, mode: "once", tracks: [] },
    ],
  };
  board.behavior = {
    ...emptyBehavior(),
    events: [
      { id: "event-tone", animationId: "animation-tone", frame: 1, name: "Confirmação", data: {} },
    ],
  };
  board.audio = {
    version: 1,
    bindings: [
      {
        id: "audio-tone",
        eventId: "event-tone",
        assetId: asset.id,
        volume: 0.5,
        caption: "Tom de confirmação",
      },
    ],
  };
  return { project, boardId: board.id, asset };
}
