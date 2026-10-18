import { newProject, parseProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
export function vectorEffectFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing effects board");
  board.scene.viewBox = [0, 0, 100, 100];
  const targetId = editScene(board.scene, null, "add", {
      tag: "rect",
      attrs: { x: "0", y: "0", width: "100", height: "100", fill: "#ff0000" },
    }),
    sourceId = editScene(board.scene, null, "add", {
      tag: "path",
      attrs: { d: "M0 0L40 0L40 60L0 60Z", fill: "#000000" },
    });
  if (!targetId || !sourceId) throw new Error("Missing effect objects");
  editScene(board.scene, sourceId, "rename", "Fonte da silhueta");
  editScene(board.scene, sourceId, "transform", { x: 10, y: 20, opacity: 50 });
  editScene(board.scene, sourceId, "visibility", false);
  editScene(board.scene, targetId, "effects", {
    clip: { sourceId, rule: "nonzero" },
    mask: { sourceId, rule: "nonzero", opacity: 0.5 },
  });
  project.motion.animations.push({
    id: "animation-effects",
    name: "Silhueta animada",
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [
      {
        id: "track-effects-x",
        targetId: sourceId,
        property: "x",
        keys: [
          { id: "key-effects-a", frame: 0, value: 10, easing: "linear" },
          { id: "key-effects-b", frame: 10, value: 50, easing: "linear" },
        ],
      },
    ],
  });
  return {
    project: parseProject(project),
    boardId: board.id,
    targetId,
    sourceId,
    animationId: "animation-effects",
  };
}
