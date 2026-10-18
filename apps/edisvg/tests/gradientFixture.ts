import type { Gradient } from "@informach/edi-motion/graphics";
import { newProject, parseProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
export function gradientFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing gradient board");
  board.scene.viewBox = [0, 0, 100, 100];
  const id = editScene(board.scene, null, "add", {
    tag: "rect",
    attrs: { x: "0", y: "0", width: "100", height: "100" },
  });
  if (!id) throw new Error("Missing gradient rect");
  const gradient: Gradient = {
    kind: "linear",
    units: "objectBoundingBox",
    spread: "pad",
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    stops: [
      { offset: 0, color: "#ff0000", opacity: 1 },
      { offset: 1, color: "#0000ff", opacity: 1 },
    ],
  };
  editScene(board.scene, id, "gradients", { fill: gradient });
  project.motion.animations.push({
    id: "animation-gradient",
    name: "Gradiente",
    fps: 10,
    frames: 10,
    mode: "loop",
    tracks: [],
  });
  return { project: parseProject(project), boardId: board.id, shapeId: id, gradient };
}
