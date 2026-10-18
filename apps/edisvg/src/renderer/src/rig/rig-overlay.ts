import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";

/** Workspace-only glyphs inherit the actual object's SVG transform, including
 * layout/basis/gesture previews. They are never part of the project/export. */
export function mountRigOverlay(
  svg: SVGSVGElement,
  board: Artboard,
  selected: string | null,
  select: (id: string) => void,
) {
  const rig = board.rig,
    owner = new AbortController(),
    hosts: {
      id: string;
      group: SVGGElement;
      path: SVGPathElement;
      circle: SVGCircleElement;
      length?: number;
    }[] = [];
  const objects = new Map(
    [...svg.querySelectorAll("[data-object]")].map((element) => [
      element.getAttribute("data-object"),
      element,
    ]),
  );
  const entries = new Map(flattenScene(board.scene).map((entry) => [entry.node.id, entry]));
  for (const item of [
    ...(rig?.bones.map((bone) => ({ id: bone.targetId, length: bone.length })) ?? []),
    ...(rig?.targets.map((id) => ({ id, length: undefined })) ?? []),
  ]) {
    const shape = objects.get(item.id)?.firstElementChild;
    if (!(shape instanceof SVGGraphicsElement))
      throw new Error("Grupo de rig não está renderizado.");
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g"),
      path = document.createElementNS("http://www.w3.org/2000/svg", "path"),
      circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    group.setAttribute("data-edi-rig-overlay", "");
    group.setAttribute("data-rig-object", item.id);
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute(
      "aria-label",
      `${item.length === undefined ? "Alvo" : "Osso"}: ${entries.get(item.id)?.node.name ?? item.id}`,
    );
    group.setAttribute(
      "stroke",
      item.id === selected ? "#ffe16a" : item.length === undefined ? "#62e6c4" : "#f27ac6",
    );
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("fill", item.length === undefined ? "none" : "#f27ac633");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");
    circle.setAttribute("vector-effect", "non-scaling-stroke");
    circle.setAttribute("stroke-width", "1.5");
    circle.setAttribute("fill", "#15233588");
    group.append(path, circle);
    shape.append(group);
    group.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        select(item.id);
      },
      { signal: owner.signal },
    );
    hosts.push({ ...item, group, path, circle });
  }
  const refresh = () => {
    for (const host of hosts) {
      const matrix = host.group.getScreenCTM(),
        scale = matrix
          ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
          : 0;
      if (scale <= 0 || !Number.isFinite(scale)) {
        host.group.setAttribute("display", "none");
        continue;
      }
      host.group.removeAttribute("display");
      const radius = 6 / scale;
      host.circle.setAttribute("r", String(radius));
      host.path.setAttribute(
        "d",
        host.length === undefined
          ? `M${-radius * 2} 0H${radius * 2}M0 ${-radius * 2}V${radius * 2}`
          : `M0 0L${host.length * 0.2} ${Math.min(host.length / 4, radius)}L${host.length} 0L${host.length * 0.2} ${-Math.min(host.length / 4, radius)}Z`,
      );
    }
  };
  refresh();
  return {
    refresh,
    destroy() {
      owner.abort();
      for (const host of hosts) host.group.remove();
      hosts.length = 0;
    },
  };
}
