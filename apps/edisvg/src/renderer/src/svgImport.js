import { identity, svgAttributes, validAttributes, validateScene } from "../../shared/scene.js";
export function importSvg(source, Parser = globalThis.DOMParser) {
  if (typeof source !== "string" || source.length > 1500000 || /<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error("SVG muito grande ou contendo entidades não suportadas.");
  const doc = new Parser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg")
    throw new Error("O arquivo não contém um SVG válido.");
  const root = doc.documentElement;
  let counter = 0;
  let box = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!box) {
    const dimension = (name) => {
      const v = root.getAttribute(name) || "";
      if (!/^\d+(?:\.\d+)?(?:px)?$/.test(v))
        throw new Error("SVG precisa de viewBox ou dimensões em pixels.");
      return parseFloat(v);
    };
    box = [0, 0, dimension("width"), dimension("height")];
  }
  const allowed = new Set([
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
  ]);
  function attrs(el, isRoot = false) {
    const result = {};
    for (const a of el.attributes) {
      if (isRoot && ["width", "height", "x", "y"].includes(a.name)) continue;
      if (/^on/i.test(a.name) || /href$/i.test(a.name))
        throw new Error("SVG com eventos ou referências externas não é aceito.");
      if (a.name === "style") {
        for (const part of a.value.split(";").filter((p) => p.trim())) {
          const i = part.indexOf(":");
          if (i < 1) throw new Error("Estilo SVG inválido.");
          const key = part.slice(0, i).trim(),
            value = part.slice(i + 1).trim();
          if (!svgAttributes.has(key)) throw new Error(`Estilo ainda não suportado: ${key}`);
          result[key] = value;
        }
      } else if (
        svgAttributes.has(a.name) &&
        !(isRoot && ["width", "height", "x", "y"].includes(a.name))
      )
        result[a.name] = a.value;
      else if (
        !["id", "class", "version", "xmlns", "viewBox", "preserveAspectRatio"].includes(a.name) &&
        !a.name.includes(":")
      )
        throw new Error(`Atributo ainda não suportado: ${a.name}`);
    }
    return validAttributes(result);
  }
  function walk(el, depth = 0) {
    if (depth > 32 || ++counter > 2000) throw new Error("SVG excede os limites de complexidade.");
    if (["title", "desc", "metadata"].includes(el.localName)) return null;
    if (
      !allowed.has(el.localName) ||
      !["", "http://www.w3.org/2000/svg"].includes(el.namespaceURI || "")
    )
      throw new Error(`Elemento ainda não suportado: ${el.localName}. Use formas e cores sólidas.`);
    const node = {
      id: `node-${counter}`,
      name: (el.getAttribute("id") || `${el.localName} ${counter}`).slice(0, 120),
      tag: el.localName,
      attrs: attrs(el),
      text: el.localName === "text" ? el.textContent : "",
      transform: identity(),
      visible: true,
      locked: false,
      children: [],
    };
    for (const child of el.children) {
      const parsed = walk(child, depth + 1);
      if (parsed) node.children.push(parsed);
    }
    return node;
  }
  const nodes = [...root.children].map((el) => walk(el)).filter(Boolean);
  const rootAttrs = attrs(root, true);
  return validateScene({
    viewBox: box,
    nodes: Object.keys(rootAttrs).length
      ? [
          {
            id: "node-root",
            name: "SVG",
            tag: "g",
            attrs: rootAttrs,
            children: nodes,
            transform: identity(),
          },
        ]
      : nodes,
    source,
  });
}
