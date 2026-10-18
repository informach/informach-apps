import { emptyBehavior } from "@informach/edi-motion/behavior";
import { newProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";
export function semanticFixture() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing semantic board");
  const buttonId = editScene(board.scene, null, "add", "rect"),
    decorativeId = editScene(board.scene, null, "add", "circle");
  if (!buttonId || !decorativeId) throw new Error("Missing semantic shapes");
  editScene(board.scene, buttonId, "attrs", { x: "20", y: "20", width: "120", height: "60" });
  editScene(board.scene, decorativeId, "attrs", { cx: "240", cy: "50", r: "20" });
  editScene(board.scene, buttonId, "semantics", {
    kind: "button",
    label: "Acenar para você",
    description: "Ativa o aceno pelo teclado ou toque.",
  });
  editScene(board.scene, decorativeId, "semantics", { kind: "decorative" });
  board.scene.viewBox = [0, 0, 300, 100];
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-active", kind: "boolean", name: "Ativado", initial: false }],
    listeners: [
      {
        id: "listener-activate",
        targetId: buttonId,
        event: "activate",
        actions: [{ kind: "set-input", inputId: "input-active", value: true }],
      },
    ],
  };
  return { project, boardId: board.id, buttonId, decorativeId };
}
