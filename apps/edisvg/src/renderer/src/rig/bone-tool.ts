import { inverse } from "@informach/edi-motion";
import type { Artboard } from "../../../shared/project";
import type { RigCommand } from "../../../shared/rig";
import { flattenScene } from "../../../shared/scene.js";
import type { Scene } from "../../../shared/sceneTypes";

interface State {
  scene: Scene;
  artboards: Artboard[];
  activeArtboardId: string | null;
  selected: string | null;
  sessionId: string;
  revision: number;
}
function screenInverse(matrix: DOMMatrix | null) {
  if (!matrix) throw new Error("Espaço do osso indisponível.");
  return new DOMMatrix(inverse([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]));
}
/** Drag owns only a workspace line. Pointerup publishes one guarded command. */
export function bindBoneTool(
  svg: SVGSVGElement,
  state: State,
  actions: { execute(command: RigCommand): void; render(): void; notify(message: string): void },
) {
  let cancelActive: (() => void) | undefined;
  svg.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelActive?.();
    try {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId),
        parent = !event.altKey
          ? board?.rig?.bones.find((bone) => bone.targetId === state.selected)
          : undefined,
        parentEntry = parent
          ? flattenScene(state.scene).find(({ node }) => node.id === parent.targetId)
          : undefined;
      if (parentEntry?.locked) throw new Error("Desbloqueie o osso pai antes de criar a cadeia.");
      const wrapper = parent
        ? [...svg.querySelectorAll("[data-object]")].find(
            (element) => element.getAttribute("data-object") === parent.targetId,
          )?.firstElementChild
        : svg;
      if (!(wrapper instanceof SVGGraphicsElement))
        throw new Error("Osso pai não está renderizado.");
      const rootInverse = screenInverse(svg.getScreenCTM()),
        localInverse = screenInverse(wrapper.getScreenCTM()),
        at = (event: { clientX: number; clientY: number }) =>
          new DOMPoint(event.clientX, event.clientY).matrixTransform(localInverse),
        start = parent ? new DOMPoint(parent.length, 0) : at(event),
        rootStart = start.matrixTransform(localInverse.inverse()).matrixTransform(rootInverse),
        context = { scene: state.scene, sessionId: state.sessionId, revision: state.revision },
        owner = new AbortController(),
        preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.setAttribute("data-bone-draft", "");
      preview.setAttribute("stroke", "#f27ac6");
      preview.setAttribute("stroke-width", "2");
      preview.setAttribute("fill", "none");
      preview.setAttribute("vector-effect", "non-scaling-stroke");
      preview.setAttribute("pointer-events", "none");
      svg.append(preview);
      let done = false,
        moved = false,
        end = start;
      const cleanup = () => {
        owner.abort();
        preview.remove();
        cancelActive = undefined;
        if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      };
      const cancel = () => {
        if (done) return;
        done = true;
        cleanup();
      };
      cancelActive = cancel;
      const move = (next: PointerEvent) => {
        end = at(next);
        moved ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) >= 3;
        const rootEnd = new DOMPoint(next.clientX, next.clientY).matrixTransform(rootInverse);
        preview.setAttribute("d", `M${rootStart.x} ${rootStart.y}L${rootEnd.x} ${rootEnd.y}`);
      };
      svg.addEventListener("pointermove", move, { signal: owner.signal });
      svg.addEventListener(
        "pointerup",
        (next) => {
          if (done) return;
          move(next);
          done = true;
          cleanup();
          if (!moved) return;
          if (
            context.scene !== state.scene ||
            context.sessionId !== state.sessionId ||
            context.revision !== state.revision
          ) {
            actions.notify("O documento mudou; crie o osso novamente.");
            return;
          }
          try {
            actions.execute({
              type: "rig",
              operation: "create-bone",
              id: `node-${crypto.randomUUID()}`,
              name: `Osso ${(board?.rig?.bones.length ?? 0) + 1}`,
              parentId: parent?.targetId ?? null,
              x: start.x,
              y: start.y,
              length: Math.hypot(end.x - start.x, end.y - start.y),
              rotation: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
            });
          } catch (error) {
            actions.notify(error instanceof Error ? error.message : "Criação do osso recusada.");
          }
          actions.render();
        },
        { signal: owner.signal },
      );
      svg.addEventListener("pointercancel", cancel, { signal: owner.signal });
      svg.addEventListener("lostpointercapture", cancel, { signal: owner.signal });
      window.addEventListener("blur", cancel, { signal: owner.signal });
      document.addEventListener(
        "keydown",
        (key) => {
          if (key.key !== "Escape") return;
          key.preventDefault();
          key.stopImmediatePropagation();
          cancel();
        },
        { capture: true, signal: owner.signal },
      );
      try {
        svg.setPointerCapture(event.pointerId);
      } catch (error) {
        cancel();
        throw error;
      }
    } catch (error) {
      actions.notify(error instanceof Error ? error.message : "Não foi possível iniciar o osso.");
    }
  };
  return () => {
    cancelActive?.();
    svg.onpointerdown = null;
  };
}
