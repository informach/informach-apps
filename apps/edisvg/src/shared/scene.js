import { PATH_TAGS, parsePath, serializePath } from "./pathGeometry.js";

const tags = new Set([
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
export const identity = () => ({ x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 });
export function editScene(scene, id, operation, value) {
  const draft = validateScene(scene);
  const entry = flattenScene(draft).find((e) => e.node.id === id);
  const uid = () => `node-${crypto.randomUUID()}`;
  let selected = id;
  if (operation === "add") {
    const [x, y, w, h] = draft.viewBox,
      cx = x + w / 2,
      cy = y + h / 2;
    const definitions = {
      rect: ["Retângulo", { x: x + w / 4, y: y + h / 4, width: w / 2, height: h / 2 }],
      circle: ["Círculo", { cx, cy, r: Math.min(w, h) / 4 }],
      line: [
        "Linha",
        {
          x1: x + w / 4,
          y1: cy,
          x2: x + (w * 3) / 4,
          y2: cy,
          stroke: "#4fe3c1",
          "stroke-width": 4,
        },
      ],
      text: [
        "Texto",
        {
          x: cx,
          y: cy,
          "font-size": Math.min(w, h) / 12,
          "font-family": "Arial",
          "text-anchor": "middle",
        },
      ],
    };
    definitions.path = [
      "Caminho",
      {
        d: "",
        fill: "none",
        stroke: "#4fe3c1",
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
    ];
    const supplied = value && typeof value === "object" ? value.attrs : null;
    value = value && typeof value === "object" ? value.tag : value;
    if (!Object.hasOwn(definitions, value)) throw new Error("Forma não suportada.");
    if (value === "path" && (!supplied?.d || typeof supplied.d !== "string"))
      throw new Error("Caminho vazio.");
    const [name, attrs] = definitions[value];
    selected = uid();
    draft.nodes.push({
      id: selected,
      name,
      tag: value,
      attrs: {
        fill: value === "line" ? "none" : "#4fe3c1",
        ...Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
        ...validAttributes(supplied ?? {}),
      },
      text: value === "text" ? "Seu texto" : "",
      children: [],
      transform: identity(),
      visible: true,
      locked: false,
    });
  } else {
    if (!entry) throw new Error("Selecione um objeto.");
    if (entry.locked) throw new Error("Desbloqueie o objeto e seus grupos para editar.");
    const n = entry.node;
    const siblings = (nodes) =>
      nodes.some((a) => a.id === id)
        ? nodes
        : nodes.reduce((found, a) => found || siblings(a.children), null);
    const list = siblings(draft.nodes),
      index = list.indexOf(n);
    if (operation === "delete") {
      list.splice(index, 1);
      selected = null;
    } else if (operation === "duplicate") {
      const copy = structuredClone(n);
      const renew = (a) => {
        a.id = uid();
        a.children.forEach(renew);
      };
      renew(copy);
      copy.name = (n.name + " (cópia)").slice(0, 120);
      copy.transform.x += 20;
      copy.transform.y += 20;
      list.splice(index + 1, 0, copy);
      selected = copy.id;
    } else if (operation === "front" || operation === "back") {
      list.splice(index, 1);
      list.splice(operation === "front" ? list.length : 0, 0, n);
    } else if (operation === "rename") {
      if (typeof value !== "string" || !value.trim() || value.trim().length > 120)
        throw new Error("Informe um nome de 1 a 120 caracteres.");
      n.name = value.trim();
    } else if (operation === "attrs") n.attrs = { ...n.attrs, ...validAttributes(value) };
    else if (operation === "transform") n.transform = { ...n.transform, ...value };
    else if (operation === "path") {
      if (!PATH_TAGS.has(n.tag)) throw new Error("Selecione uma forma ou caminho.");
      const d = serializePath(parsePath(value));
      const geometry = new Set([
        "d",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "width",
        "height",
        "rx",
        "ry",
        "cx",
        "cy",
        "r",
        "points",
      ]);
      n.attrs = {
        ...Object.fromEntries(Object.entries(n.attrs).filter(([key]) => !geometry.has(key))),
        d,
      };
      n.tag = "path";
    } else if (operation === "text") {
      if (n.tag !== "text") throw new Error("Selecione um texto.");
      n.text = value;
    } else throw new Error("Operação não suportada.");
  }
  const clean = validateScene(draft);
  Object.assign(scene, clean);
  return selected;
}
export const svgAttributes = new Set([
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "display",
  "visibility",
]);
export const xmlEscape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
export function validAttributes(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Atributos SVG inválidos.");
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      !svgAttributes.has(key) ||
      typeof value !== "string" ||
      value.length > 500000 ||
      /url\s*\(|[<>\\]|(?:javascript|data|https?):/i.test(value)
    )
      throw new Error(`Atributo SVG não suportado: ${key}`);
    if (
      key === "transform" &&
      !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([-+0-9.eE,\s]+\)\s*)*$/.test(value)
    )
      throw new Error("Transformação SVG inválida.");
    out[key] = value;
  }
  return out;
}
export function validateScene(scene) {
  if (scene == null) return null;
  if (
    !scene ||
    !Array.isArray(scene.viewBox) ||
    scene.viewBox.length !== 4 ||
    scene.viewBox.some(
      (n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100000,
    ) ||
    scene.viewBox[2] <= 0 ||
    scene.viewBox[3] <= 0
  )
    throw new Error("Artboard SVG inválido.");
  const ids = new Set();
  let count = 0;
  const visit = (nodes, depth) => {
    if (!Array.isArray(nodes) || depth > 32) throw new Error("Hierarquia SVG inválida.");
    return nodes.map((n) => {
      if (
        ++count > 2000 ||
        !n ||
        !tags.has(n.tag) ||
        typeof n.id !== "string" ||
        !/^node-[\w-]+$/.test(n.id) ||
        ids.has(n.id)
      )
        throw new Error("Objeto SVG inválido ou ID duplicado.");
      ids.add(n.id);
      if (
        typeof n.name !== "string" ||
        n.name.length > 120 ||
        typeof (n.text ?? "") !== "string" ||
        (n.text ?? "").length > 10000
      )
        throw new Error("Nome/texto SVG inválido.");
      const transform = { ...identity(), ...n.transform };
      for (const [key, value] of Object.entries(transform)) {
        if (
          !Object.hasOwn(identity(), key) ||
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          Math.abs(value) > 10000
        )
          throw new Error("Transformação de objeto inválida.");
      }
      if (
        transform.opacity < 0 ||
        transform.opacity > 100 ||
        transform.sx <= 0 ||
        transform.sy <= 0 ||
        transform.sx > 20 ||
        transform.sy > 20
      )
        throw new Error("Escala/opacidade inválida.");
      const children = visit(n.children ?? [], depth + 1);
      if (n.tag !== "g" && children.length) throw new Error("Somente grupos podem conter objetos.");
      return {
        id: n.id,
        name: n.name,
        tag: n.tag,
        attrs: validAttributes(n.attrs),
        text: n.text ?? "",
        transform,
        visible: n.visible !== false,
        locked: n.locked === true,
        children,
      };
    });
  };
  const result = { viewBox: [...scene.viewBox], nodes: visit(scene.nodes, 0) };
  if (scene.source !== undefined) {
    if (typeof scene.source !== "string" || scene.source.length > 1500000)
      throw new Error("Fonte SVG muito grande.");
    result.source = scene.source;
  }
  return result;
}
export function flattenScene(scene) {
  const result = [];
  function walk(nodes, depth = 0, locked = false, visible = true) {
    for (const node of nodes) {
      const inherited = locked || node.locked,
        shown = visible && node.visible !== false;
      result.push({ node, depth, locked: inherited, visible: shown });
      walk(node.children, depth + 1, inherited, shown);
    }
  }
  walk(scene?.nodes ?? []);
  return result;
}
export function renderScene(scene, { editor = false } = {}) {
  const clean = validateScene(scene);
  if (!clean) throw new Error("Cena ausente.");
  function draw(n) {
    const t = n.transform;
    const attrs = Object.entries(n.attrs)
      .map(([k, v]) => ` ${k}="${xmlEscape(v)}"`)
      .join("");
    return `<g${editor ? ` data-object="${n.id}"` : ""} transform="translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.sx} ${t.sy})" opacity="${t.opacity / 100}"${!n.visible ? ' display="none"' : ""}><${n.tag}${attrs}>${xmlEscape(n.text)}${n.children.map(draw).join("")}</${n.tag}></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${clean.viewBox.join(" ")}">${clean.nodes.map(draw).join("")}</svg>`;
}
