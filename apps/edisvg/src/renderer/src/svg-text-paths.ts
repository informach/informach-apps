import { parseTransformList, transformPoint } from "@informach/edi-motion";
import { type TextPath, textPathLength, textPathSchema } from "@informach/edi-motion/visual";
import { parsePath, serializePath } from "../../shared/pathGeometry.js";

const namespace = "http://www.w3.org/2000/svg",
  linkNamespace = "http://www.w3.org/1999/xlink";
/** Text laid on a local path: one textPath child with plain text, a local
 * href to a path, and startOffset. The referenced path's own transform
 * applies (SVG 2); its curve becomes the text's typed copy. */
export function createSvgTextPathCatalog(root: Element) {
  const document = root.ownerDocument;
  return {
    owns(text: Element) {
      return (
        text.localName === "text" &&
        [...text.children].some((child) => child.localName === "textPath")
      );
    },
    read(text: Element): { text: string; textPath: TextPath } {
      const element = text.firstElementChild;
      if (
        text.children.length !== 1 ||
        element?.localName !== "textPath" ||
        (element.namespaceURI ?? namespace) !== namespace ||
        [...text.childNodes].some(
          (node) => node !== element && node.nodeType !== 8 && (node.textContent ?? "").trim(),
        )
      )
        throw new Error("Texto em caminho aceita um único textPath, sem outro conteúdo.");
      if (element.children.length)
        throw new Error("textPath aceita somente texto simples, sem tspan.");
      let href: string | null = null,
        offset = "";
      for (const attribute of element.attributes) {
        if (
          attribute.name === "href" ||
          (attribute.localName === "href" && attribute.namespaceURI === linkNamespace)
        )
          href = attribute.value.trim();
        else if (attribute.name === "startOffset") offset = attribute.value.trim();
        else
          throw new Error(`Atributo de textPath fora do perfil: ${attribute.name.slice(0, 80)}.`);
      }
      const id = /^#([A-Za-z_][\w.-]{0,119})$/.exec(href ?? "")?.[1],
        target = id ? document.getElementById(id) : null;
      if (
        !target ||
        !root.contains(target) ||
        target.localName !== "path" ||
        (target.namespaceURI ?? namespace) !== namespace
      )
        throw new Error("textPath requer referência local a um path do documento.");
      if (target.hasAttribute("pathLength"))
        throw new Error("pathLength no caminho do texto não está no perfil.");
      const matrix = parseTransformList(target.getAttribute("transform") ?? ""),
        move = (point: { x: number; y: number }) => transformPoint(matrix, point.x, point.y),
        d = serializePath(
          parsePath(target.getAttribute("d") ?? "").map((contour) => ({
            closed: contour.closed,
            points: contour.points.map((point) => ({
              ...move(point),
              in: point.in ? move(point.in) : null,
              out: point.out ? move(point.out) : null,
            })),
          })),
        ),
        percent = /^(\d+(?:\.\d+)?)%$/.exec(offset),
        length = /^\d+(?:\.\d+)?$/.test(offset) ? Number(offset) : null;
      if (offset && !percent && length === null)
        throw new Error("startOffset aceita porcentagem ou comprimento sem unidade.");
      const total = length === null ? 1 : textPathLength(d),
        startOffset = percent ? Number(percent[1]) : length === null ? 0 : (length / total) * 100;
      if (!Number.isFinite(startOffset) || startOffset > 100)
        throw new Error("startOffset fica fora do caminho do texto.");
      return {
        text: element.textContent ?? "",
        textPath: textPathSchema.parse({ d, startOffset }),
      };
    },
  };
}
