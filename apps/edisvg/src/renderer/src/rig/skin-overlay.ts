import type { Geometry } from "@informach/edi-motion/geometry";
import { imageMeshRest } from "@informach/edi-motion/visual";
import { pathFromNode } from "../../../shared/pathGeometry.js";
import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";

/** Control polygon and vertex weights, never persisted or exported markup. */
export function mountSkinOverlay(
  svg: SVGSVGElement,
  board: Artboard,
  selectedId: string | null,
  selectedVertex: number,
  selectVertex: (index: number) => void,
) {
  const skin = board.rig?.skins?.find((skin) => skin.targetId === selectedId),
    node = flattenScene(board.scene).find(({ node }) => node.id === selectedId)?.node,
    wrapper = [...svg.querySelectorAll("[data-object]")].find(
      (element) => element.getAttribute("data-object") === selectedId,
    );
  if (!skin || !node || !(wrapper instanceof SVGGraphicsElement)) return;
  // A meshed image is weighted per grid vertex, in the same local space as a path.
  const base =
      node.tag === "image" && node.imageMesh
        ? imageMeshRest(node.imageMesh, node.attrs)
        : pathFromNode(node),
    owner = new AbortController(),
    ns = "http://www.w3.org/2000/svg",
    group = document.createElementNS(ns, "g"),
    edges = document.createElementNS(ns, "path"),
    points = base.flatMap((contour) => contour.points);
  group.setAttribute("data-edi-rig-overlay", "");
  group.setAttribute("data-edi-skin-overlay", skin.id);
  edges.setAttribute("fill", "none");
  edges.setAttribute("stroke", "#62e6c4");
  edges.setAttribute("vector-effect", "non-scaling-stroke");
  edges.setAttribute("stroke-width", "1");
  edges.setAttribute("pointer-events", "none");
  group.append(edges);
  const circles = points.map((_, index) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("data-skin-vertex", String(index));
    circle.setAttribute("role", "button");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", `Vértice ${index} da malha`);
    circle.setAttribute("aria-pressed", String(index === selectedVertex));
    circle.setAttribute("fill", index === selectedVertex ? "#ffe16a" : "#152335");
    circle.setAttribute("stroke", "#62e6c4");
    circle.setAttribute("vector-effect", "non-scaling-stroke");
    circle.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
        event.preventDefault();
      },
      { signal: owner.signal },
    );
    circle.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        selectVertex(index);
      },
      { signal: owner.signal },
    );
    circle.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        selectVertex(index);
      },
      { signal: owner.signal },
    );
    group.append(circle);
    return circle;
  });
  wrapper.append(group);
  function refresh(geometries?: ReadonlyMap<string, Geometry>) {
    const geometry = geometries?.get(skin?.targetId ?? "") ?? base,
      matrix = wrapper instanceof SVGGraphicsElement ? wrapper.getScreenCTM() : null,
      scale = matrix ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : 0;
    if (scale <= 0 || !Number.isFinite(scale)) {
      group.setAttribute("display", "none");
      return;
    }
    group.removeAttribute("display");
    const mesh = node?.tag === "image" ? node.imageMesh : undefined,
      line = (points: readonly { x: number; y: number }[]) =>
        points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
    edges.setAttribute(
      "d",
      mesh
        ? // The grid's rows and columns, not the row-major vertex order.
          (() => {
            const vertices = geometry.flatMap((contour) => contour.points),
              width = mesh.columns + 1;
            return [
              ...Array.from({ length: mesh.rows + 1 }, (_, row) =>
                line(vertices.slice(row * width, row * width + width)),
              ),
              ...Array.from({ length: width }, (_, column) =>
                line(vertices.filter((_, index) => index % width === column)),
              ),
            ].join(" ");
          })()
        : geometry.map((contour) => line(contour.points) + (contour.closed ? "Z" : "")).join(" "),
    );
    let index = 0;
    for (const contour of geometry)
      for (const point of contour.points) {
        const circle = circles[index++];
        if (!circle) throw new Error("Topologia da prévia da malha mudou.");
        circle.setAttribute("cx", String(point.x));
        circle.setAttribute("cy", String(point.y));
        circle.setAttribute("r", String(5 / scale));
      }
  }
  refresh();
  return {
    refresh,
    destroy() {
      owner.abort();
      group.remove();
    },
  };
}
