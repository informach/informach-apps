import { transformSchema } from "@informach/edi-motion";
import {
  assetIdSchema,
  fontFallbackIdsSchema,
  fontStackIds,
  imageSliceSchema,
} from "@informach/edi-motion/assets";
import {
  filterDefinitions,
  filterSchema,
  gradientDefinitions,
  gradientPaintsSchema,
  gradientTags,
  isXmlText,
  validAttributes,
  vectorEffectsSchema,
} from "@informach/edi-motion/graphics";
import {
  describeVisualScene,
  escapeXml,
  semanticSchema,
  serializeVisualElement,
} from "@informach/edi-motion/visual";
import { appearanceStyleSchema, paletteSchema } from "./appearanceContracts";
import { instanceSchema } from "./componentContracts";
import { validateImageAttributes } from "./imageContracts";
import { applySceneAttributes } from "./paintAttributes";
import { PATH_TAGS, parsePath, serializePath } from "./pathGeometry.js";
import { cloneSubtree } from "./sceneClone";
import { sceneEffectContext } from "./sceneEffects";

export { svgAttributes, validAttributes } from "@informach/edi-motion/graphics";

import { textDirectionSchema } from "@informach/edi-motion/visual";
import { textLayoutSchema } from "./textLayout";

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
  "image",
]);
export const identity = () => ({ x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 });
/** @returns {string | null} */
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
    const parentLocked = flattenScene(draft).find(
      (item) => item.node.id === entry.parentId,
    )?.locked;
    if (entry.locked && (operation !== "lock" || parentLocked))
      throw new Error("Desbloqueie o objeto e seus grupos para editar.");
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
      const { copy } = cloneSubtree(n);
      list.splice(index + 1, 0, copy);
      selected = copy.id;
    } else if (operation === "front" || operation === "back") {
      list.splice(index, 1);
      list.splice(operation === "front" ? list.length : 0, 0, n);
    } else if (operation === "rename") {
      if (typeof value !== "string" || !value.trim() || value.trim().length > 120)
        throw new Error("Informe um nome de 1 a 120 caracteres.");
      n.name = value.trim();
    } else if (operation === "attrs") {
      applySceneAttributes(n, validAttributes(value));
    } else if (operation === "effects") {
      if (value === null) delete n.effects;
      else n.effects = vectorEffectsSchema.parse(value);
    } else if (operation === "gradients") {
      if (!gradientTags.has(n.tag))
        throw new Error("Gradiente requer forma, grupo ou texto local.");
      if (value === null) delete n.gradients;
      else n.gradients = gradientPaintsSchema.parse(value);
    } else if (operation === "filter") {
      if (value === null) delete n.filter;
      else n.filter = filterSchema.parse(value);
    } else if (operation === "image-slice") {
      if (n.tag !== "image") throw new Error("Nine-slice requer imagem.");
      if (value === null) delete n.imageSlice;
      else n.imageSlice = imageSliceSchema.parse(value);
    } else if (operation === "semantics") {
      if (value === null) delete n.semantics;
      else n.semantics = semanticSchema.parse(value);
    } else if (operation === "text-layout") {
      if (n.tag !== "text") throw new Error("Selecione um texto.");
      n.textLayout = textLayoutSchema.parse(value);
    } else if (operation === "text-direction") {
      if (n.tag !== "text") throw new Error("Selecione um texto.");
      // Explicit directions stay SVG attributes; auto is resolved at render.
      const { direction: _direction, ...attrs } = n.attrs;
      n.attrs = value === "auto" ? attrs : { ...attrs, direction: value };
      if (value === "auto") n.textDirection = "auto";
      else delete n.textDirection;
    } else if (operation === "transform") n.transform = { ...n.transform, ...value };
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
    } else if (operation === "visibility" || operation === "lock") {
      if (typeof value !== "boolean") throw new Error("Visibilidade/bloqueio inválidos.");
      if (operation === "visibility") n.visible = value;
      else n.locked = value;
    } else if (operation === "text") {
      if (n.tag !== "text") throw new Error("Selecione um texto.");
      n.text = value;
    } else throw new Error("Operação não suportada.");
  }
  const clean = validateScene(draft);
  Object.assign(scene, clean);
  return selected;
}
export const xmlEscape = (value) => escapeXml(String(value));
/** @returns {import('./sceneTypes.ts').Scene | null} */
export function validateScene(
  scene,
  {
    strict = false,
    allowViewport = false,
    budget = { count: 0, attributes: 0, vertices: 0, textSize: 0, sources: 0 },
  } = {},
) {
  if (scene == null) return null;
  const only = (value, keys) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new Error("Cena contém campos incompatíveis. Use uma versão compatível do EdiSVG.");
  };
  if (strict)
    only(scene, ["viewBox", "nodes", "source", "preserveAspectRatio", "styles", "palette"]);
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
  const visit = (nodes, depth) => {
    if (!Array.isArray(nodes) || depth > 32) throw new Error("Hierarquia SVG inválida.");
    return nodes.map((n) => {
      if (strict) {
        only(n, [
          "id",
          "name",
          "tag",
          "attrs",
          "text",
          "transform",
          "visible",
          "locked",
          "children",
          "basis",
          "instance",
          "textLayout",
          "textDirection",
          "assetId",
          "imageSlice",
          "gradients",
          "filter",
          "effects",
          "fontAssetId",
          "fontFallbackIds",
          "semantics",
        ]);
        if (
          (n.visible !== undefined && typeof n.visible !== "boolean") ||
          (n.locked !== undefined && typeof n.locked !== "boolean")
        )
          throw new Error("Visibilidade/bloqueio inválidos.");
      }
      if (
        ++budget.count > 2000 ||
        !n ||
        (!tags.has(n.tag) && !(allowViewport && n.tag === "svg")) ||
        typeof n.id !== "string" ||
        !/^node-[\w-]{1,100}$/.test(n.id) ||
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
      if (!isXmlText(n.name) || !isXmlText(n.text ?? ""))
        throw new Error("Nome/texto deve conter caracteres XML válidos.");
      const transform = transformSchema.parse({ ...identity(), ...n.transform });
      const children = visit(n.children ?? [], depth + 1);
      if (
        n.basis !== undefined &&
        (!Array.isArray(n.basis) ||
          n.basis.length !== 6 ||
          n.basis.some(
            (value) =>
              typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e7,
          ))
      )
        throw new Error("Espaço de coordenadas inválido.");
      if (n.tag !== "g" && !(allowViewport && n.tag === "svg") && children.length)
        throw new Error("Somente grupos podem conter objetos.");
      const instance = n.instance === undefined ? undefined : instanceSchema.parse(n.instance);
      const textLayout =
        n.textLayout === undefined ? undefined : textLayoutSchema.parse(n.textLayout);
      const semantics = n.semantics === undefined ? undefined : semanticSchema.parse(n.semantics);
      if (semantics && semantics.kind !== "decorative") {
        budget.textSize += semantics.label.length + (semantics.description?.length ?? 0);
        if (semantics.description && ++budget.count > 2000)
          throw new Error("Descrições acessíveis excedem orçamento de células SVG.");
      }
      const assetId = n.assetId === undefined ? undefined : assetIdSchema.parse(n.assetId);
      const fontAssetId =
        n.fontAssetId === undefined ? undefined : assetIdSchema.parse(n.fontAssetId);
      const fontFallbackIds =
        n.fontFallbackIds === undefined
          ? undefined
          : fontFallbackIdsSchema.parse(n.fontFallbackIds);
      fontStackIds({ fontAssetId, fontFallbackIds });
      if (fontAssetId && n.tag !== "text")
        throw new Error("Referência de fonte só é válida em texto.");
      if ((n.tag === "image") !== (assetId !== undefined))
        throw new Error("Imagem requer referência tipada; outros objetos não aceitam assetId.");
      if (textLayout && n.tag !== "text") throw new Error("Layout de texto só se aplica a texto.");
      const textDirection =
        n.textDirection === undefined ? undefined : textDirectionSchema.parse(n.textDirection);
      if (textDirection && (n.tag !== "text" || n.attrs?.direction !== undefined))
        throw new Error("Direção automática requer texto sem direção explícita.");
      if (textLayout) {
        const lines = n.text.replace(/\r\n?/g, "\n").split("\n").length;
        budget.textLines = (budget.textLines ?? 0) + lines;
        if (lines > 200 || budget.textLines > 2000)
          throw new Error("Orçamento de linhas de texto excedido.");
      }
      if (instance) {
        if (n.tag !== "g" || children.length)
          throw new Error("Instância precisa ser um grupo sem filhos locais.");
        if (instance.animationId === null && (instance.speed !== 1 || instance.offsetSeconds !== 0))
          throw new Error("Instância estática não possui relógio próprio.");
        for (const override of instance.overrides) {
          if (override.attrs)
            budget.attributes += Object.values(validAttributes(override.attrs)).reduce(
              (sum, value) => sum + value.length,
              0,
            );
          budget.textSize += override.text?.length ?? 0;
        }
      }
      const attrs = validAttributes(n.attrs);
      const gradients =
        n.gradients === undefined ? undefined : gradientPaintsSchema.parse(n.gradients);
      if (gradients && !gradientTags.has(n.tag))
        throw new Error("Gradiente requer forma, grupo ou texto.");
      if (gradients) budget.attributes += JSON.stringify(gradients).length;
      const filter = n.filter === undefined ? undefined : filterSchema.parse(n.filter);
      if (filter) budget.attributes += JSON.stringify(filter).length;
      const effects = n.effects === undefined ? undefined : vectorEffectsSchema.parse(n.effects);
      if (effects) {
        budget.effects = (budget.effects ?? 0) + Number(!!effects.clip) + Number(!!effects.mask);
        if (budget.effects > 256) throw new Error("Projeto excede 256 recortes/máscaras.");
        budget.count += (effects.clip ? 2 : 0) + (effects.mask ? 2 : 0);
        if (budget.count > 2000) throw new Error("Efeitos excedem orçamento de células SVG.");
      }
      if (n.tag === "image") validateImageAttributes(attrs);
      const imageSlice =
        n.imageSlice === undefined ? undefined : imageSliceSchema.parse(n.imageSlice);
      if (imageSlice && n.tag !== "image") throw new Error("Nine-slice requer imagem.");
      if (imageSlice) {
        budget.count += 18;
        if (budget.count > 2000) throw new Error("Nine-slice excede orçamento de células SVG.");
      }
      if (n.tag === "image" && (attrs.viewBox !== undefined || n.text))
        throw new Error("Viewport da imagem é derivado do recurso; imagem não aceita texto local.");
      budget.attributes += Object.values(attrs).reduce((total, value) => total + value.length, 0);
      budget.textSize += (n.text ?? "").length;
      if (attrs.d)
        budget.vertices += parsePath(attrs.d).reduce(
          (total, contour) => total + contour.points.length,
          0,
        );
      if (attrs.points) budget.vertices += attrs.points.trim().split(/[\s,]+/).length / 2;
      if (budget.attributes > 4_000_000 || budget.vertices > 100_000 || budget.textSize > 1_000_000)
        throw new Error("Cena SVG excede o orçamento agregado de geometria/texto.");
      return {
        id: n.id,
        name: n.name,
        tag: n.tag,
        attrs,
        text: n.text ?? "",
        transform,
        visible: n.visible !== false,
        locked: n.locked === true,
        children,
        ...(n.basis === undefined ? {} : { basis: [...n.basis] }),
        ...(instance === undefined ? {} : { instance }),
        ...(textLayout === undefined ? {} : { textLayout }),
        ...(textDirection === undefined ? {} : { textDirection }),
        ...(semantics === undefined ? {} : { semantics }),
        ...(assetId === undefined ? {} : { assetId }),
        ...(imageSlice === undefined ? {} : { imageSlice }),
        ...(gradients === undefined ? {} : { gradients }),
        ...(filter === undefined ? {} : { filter }),
        ...(effects === undefined ? {} : { effects }),
        ...(fontAssetId === undefined ? {} : { fontAssetId }),
        ...(fontFallbackIds === undefined ? {} : { fontFallbackIds }),
      };
    });
  };
  const result = { viewBox: [...scene.viewBox], nodes: visit(scene.nodes, 0) };
  if (scene.styles !== undefined) {
    if (!Array.isArray(scene.styles) || scene.styles.length > 100)
      throw new Error("Biblioteca de estilos inválida.");
    result.styles = scene.styles.map((style) => appearanceStyleSchema.parse(style));
    if (new Set(result.styles.map((style) => style.id)).size !== result.styles.length)
      throw new Error("IDs de estilos duplicados.");
    budget.attributes += result.styles.reduce(
      (sum, style) =>
        sum +
        Object.values(style.attrs).reduce((total, value) => total + value.length, 0) +
        (style.gradients ? JSON.stringify(style.gradients).length : 0),
      0,
    );
    if (budget.attributes > 4_000_000) throw new Error("Orçamento agregado de estilos excedido.");
  }
  if (scene.palette !== undefined) result.palette = paletteSchema.parse(scene.palette);
  const effectContext = sceneEffectContext(flattenScene(result));
  for (const id of new Set(effectContext.references.map((reference) => reference.sourceId))) {
    const source = effectContext.objects.get(id);
    if (source?.nativeShape && !["polygon", "polyline"].includes(source.tag))
      budget.vertices += source.geometry.reduce(
        (count, contour) => count + contour.points.length,
        0,
      );
  }
  if (budget.vertices > 100000)
    throw new Error("Orçamento agregado de geometria com efeitos nativos excedido.");
  gradientDefinitions([
    ...flattenScene(result).map(({ node }) => node.gradients),
    ...(result.styles ?? []).map((style) => style.gradients),
  ]);
  filterDefinitions(flattenScene(result).map(({ node }) => node.filter));
  if (scene.preserveAspectRatio !== undefined) {
    if (
      typeof scene.preserveAspectRatio !== "string" ||
      !/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(
        scene.preserveAspectRatio,
      )
    )
      throw new Error("Proporção do artboard SVG inválida.");
    result.preserveAspectRatio = scene.preserveAspectRatio;
  }
  if (scene.source !== undefined) {
    if (typeof scene.source !== "string" || scene.source.length > 1500000)
      throw new Error("Fonte SVG muito grande.");
    budget.sources += new TextEncoder().encode(scene.source).byteLength;
    if (budget.sources > 8000000) throw new Error("Orçamento agregado de fontes SVG excedido.");
    result.source = scene.source;
  }
  return result;
}
/** @returns {{node: import('./sceneTypes.ts').SceneNode, depth: number, locked: boolean, visible: boolean, parentId: string | null}[]} */
export function flattenScene(scene) {
  const result = [];
  function walk(nodes, depth = 0, locked = false, visible = true, parentId = null) {
    for (const node of nodes) {
      const inherited = locked || node.locked,
        shown = visible && node.visible !== false;
      result.push({ node, depth, locked: inherited, visible: shown, parentId });
      walk(node.children, depth + 1, inherited, shown, node.id);
    }
  }
  walk(scene?.nodes ?? []);
  return result;
}
/** @param {unknown} scene
 * @param {{editor?: boolean, runtime?: boolean, compiled?: boolean, assets?: import('@informach/edi-motion/assets').Asset[], embeddedFonts?:boolean, verifyFonts?:boolean, semantics?:boolean}} options */
export function renderScene(
  scene,
  {
    editor = false,
    runtime = false,
    compiled = false,
    assets = [],
    embeddedFonts = true,
    verifyFonts = false,
    semantics = !editor,
  } = {},
) {
  const clean = validateScene(scene, { allowViewport: compiled });
  if (!clean) throw new Error("Cena ausente.");
  const context = sceneEffectContext(flattenScene(clean));
  function visual(node) {
    if (node.instance)
      throw new Error("Componentes precisam ser compilados antes da renderização.");
    return {
      ...node,
      geometry: context.objects.get(node.id)?.geometry,
      children: node.children.map(visual),
    };
  }
  return serializeVisualElement(
    describeVisualScene({ ...clean, nodes: clean.nodes.map(visual) }, assets, {
      mode: editor ? "editor" : runtime ? "runtime" : "static",
      embeddedFonts,
      verifyFonts,
      semantics,
    }),
  );
}
