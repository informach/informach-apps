import { svgPrimitiveAttributes } from "@informach/edi-motion/geometry";
import { identity, svgAttributes, validAttributes, validateScene } from "../../shared/scene.js";
import { createSvgEffectCatalog } from "./svg-effect-definitions";
import { createSvgFilterCatalog } from "./svg-filters";
import { createSvgGradientCatalog } from "./svg-gradients";
import { parseSvgInlineStyle } from "./svg-inline-style";
import { createSvgPatternCatalog } from "./svg-patterns";
import { createSvgSemanticCatalog, svgSemanticAttributes } from "./svg-semantics";
import { expandSvgUses } from "./svg-use-expansion";
export const SVG_SOURCE_BYTES = 1500000;
const LOCAL_PAINT = /^url\(\s*(['"]?)#([A-Za-z_][\w.-]{0,119})\1\s*\)$/;
const importAttributes = new Set([...svgAttributes, "clip-path", "mask", "filter"]);
/** Inherited by filter resolution only (resolved into each typed filter), never stored. */
const FILTER_SPACE = "color-interpolation-filters";
const styleAttributes = new Set([...importAttributes, FILTER_SPACE]);
/** Definitions validate their own properties; this reader only extracts the paint. */
const definitionStyles = new Set([...styleAttributes, "mask-type"]);
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
export class SvgImportError extends Error {
  constructor(report) {
    super(
      report.issues.find((issue) => issue.severity === "error")?.message ?? "SVG incompatível.",
    );
    this.name = "SvgImportError";
    this.report = report;
  }
}
/** Reject, never publish a partial interpretation. Reports carry element paths,
 * not document attribute values, and disclose when the visible list is bounded. */
export function inspectSvgImport(source, Parser = globalThis.DOMParser) {
  const issues = [],
    attributes = new Map(),
    paints = new Map(),
    effects = new Map(),
    filters = new Map(),
    locations = new Map(),
    semantics = new Map(),
    descriptive = [];
  let errors = 0,
    warnings = 0,
    visited = 0;
  const report = () => ({
    errors,
    warnings,
    totalObjects: visited,
    issues,
    omitted: Math.max(0, errors + warnings - issues.length),
  });
  const issue = (path, message, severity = "error") => {
    if (severity === "error") errors++;
    else warnings++;
    const entry = {
      id: `issue-${errors + warnings}`,
      path,
      message:
        message.length > 2000 ? `${message.slice(0, 1975)} [diagnóstico abreviado]` : message,
      severity,
    };
    if (severity === "error") {
      const warning = issues.findIndex((item) => item.severity === "warning");
      if (issues.length === 100 && warning >= 0) issues.splice(warning, 1);
      if (issues.length < 100) issues.splice(warning >= 0 ? warning : issues.length, 0, entry);
    } else if (issues.length < 100) issues.push(entry);
  };
  if (
    typeof source !== "string" ||
    source.length > SVG_SOURCE_BYTES ||
    new TextEncoder().encode(source).byteLength > SVG_SOURCE_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(source)
  ) {
    issue("svg", "SVG muito grande ou contendo entidades não suportadas.");
    return { scene: null, report: report() };
  }
  const doc = new Parser().parseFromString(source, "image/svg+xml"),
    root = doc.documentElement;
  if (
    doc.querySelector("parsererror") ||
    root.localName !== "svg" ||
    !["", "http://www.w3.org/2000/svg"].includes(root.namespaceURI || "")
  ) {
    issue("svg", "O arquivo não contém um SVG válido no namespace suportado.");
    return { scene: null, report: report() };
  }
  const metadata = new Set(["title", "desc", "metadata"]);
  let expansion;
  try {
    expansion = expandSvgUses(root);
  } catch (error) {
    issue("svg/use", error instanceof Error ? error.message : "Referência use inválida.");
    return { scene: null, report: report() };
  }
  if (expansion.uses)
    issue(
      "svg/use",
      `${expansion.uses} uso(s) de use/symbol viraram cópias editáveis independentes; editar uma cópia não altera as demais. Para reutilização viva, transforme a arte em componente.`,
      "warning",
    );
  if (expansion.viewports)
    issue(
      "svg/symbol",
      `${expansion.viewports} viewport(s) de symbol viraram recorte retangular editável.`,
      "warning",
    );
  if (expansion.unusedSymbols)
    issue(
      "svg/symbol",
      `${expansion.unusedSymbols} symbol(s) sem uso não aparecem no desenho e não foram importados.`,
      "warning",
    );
  let gradients, patterns, filterCatalog, semanticCatalog, effectCatalog;
  try {
    gradients = createSvgGradientCatalog(root);
    patterns = createSvgPatternCatalog(root);
    patterns.validateAll();
    filterCatalog = createSvgFilterCatalog(root);
    filterCatalog.validateAll();
    semanticCatalog = createSvgSemanticCatalog(root);
    effectCatalog = createSvgEffectCatalog(root);
  } catch (error) {
    issue("svg/defs", error instanceof Error ? error.message : "Definições SVG inválidas.");
    return { scene: null, report: report() };
  }
  function walk(el, path, depth, isRoot = false) {
    locations.set(el, path);
    if (depth > 32 || ++visited > 2000) {
      issue(path, "SVG excede os limites de complexidade.");
      return;
    }
    if (metadata.has(el.localName)) {
      descriptive.push({ element: el, path });
      return;
    }
    if (el.localName === "defs") {
      try {
        gradients.validateDefs(el);
      } catch (error) {
        issue(path, error instanceof Error ? error.message : "Defs inválido.");
        return;
      }
      let index = 0;
      for (const child of el.children)
        walk(child, `${path}/${child.localName.slice(0, 80)}[${++index}]`, depth + 1);
      return;
    }
    if (
      gradients.isDefinition(el) ||
      patterns.isDefinition(el) ||
      filterCatalog.isDefinition(el) ||
      effectCatalog.isDefinition(el)
    )
      return;
    if (
      !isRoot &&
      (!allowed.has(el.localName) ||
        !["", "http://www.w3.org/2000/svg"].includes(el.namespaceURI || ""))
    ) {
      issue(
        path,
        `Elemento não suportado: ${el.localName.slice(0, 80)}. Nenhuma arte foi importada.`,
      );
      return;
    }
    const result = {},
      styles = {},
      localPaints = {},
      stylePaints = {},
      styleChannels = new Set();
    try {
      const value = semanticCatalog.read(el);
      if (value) semantics.set(el, value);
    } catch (error) {
      issue(path, error instanceof Error ? error.message : "Semântica SVG inválida.");
    }
    const attributeValue = (dest, typed, key, value) => {
      if (key === FILTER_SPACE) {
        if (!["auto", "sRGB", "linearRGB", "inherit"].includes(value.trim()))
          throw new Error("color-interpolation-filters fora do perfil.");
      } else if (key === "clip-path" || key === "mask") {
        typed[key === "clip-path" ? "clip" : "mask"] = effectCatalog.reference(value);
        delete dest[key];
      } else if (key === "filter") {
        typed.filter = filterCatalog.reference(value);
        delete dest[key];
      } else if (["fill", "stroke"].includes(key) && /^url\s*\(/i.test(value)) {
        const local = LOCAL_PAINT.exec(value.trim())?.[2];
        typed[key] =
          local && patterns.has(local) ? patterns.resolve(local) : gradients.paint(value);
        delete dest[key];
      } else {
        Object.assign(dest, validAttributes({ [key]: value }));
        delete typed[key];
      }
    };
    for (const attribute of el.attributes) {
      const name = attribute.name;
      if (svgSemanticAttributes.has(name)) continue;
      if (isRoot && ["width", "height", "x", "y", "viewBox", "preserveAspectRatio"].includes(name))
        continue;
      if (/^on/i.test(name) || /href$/i.test(name)) {
        issue(path, "Eventos e referências externas/internas não são aceitos neste perfil.");
        continue;
      }
      if (name === "style") {
        try {
          for (const { name: key, value, apply } of parseSvgInlineStyle(
            attribute.value,
            styleAttributes,
          )) {
            if (!apply) {
              attributeValue({}, {}, key, value);
              continue;
            }
            styleChannels.add(key === "clip-path" ? "clip" : key);
            attributeValue(styles, stylePaints, key, value);
          }
        } catch (error) {
          issue(path, error instanceof Error ? error.message : "Estilo inválido.");
        }
      } else if (importAttributes.has(name) || name === FILTER_SPACE) {
        try {
          attributeValue(result, localPaints, name, attribute.value);
        } catch (error) {
          issue(path, error instanceof Error ? error.message : "Atributo inválido.");
        }
      } else if (name === "class" && attribute.value.trim())
        issue(
          path,
          "Classes externas não são carregadas; use atributos ou estilos inline suportados.",
          "warning",
        );
      else if (!["id", "class", "version", "xmlns"].includes(name) && !name.startsWith("xmlns:"))
        issue(path, `Atributo não suportado: ${name.slice(0, 80)}.`);
    }
    attributes.set(el, { ...result, ...styles });
    for (const channel of styleChannels) delete localPaints[channel];
    const combined = { ...localPaints, ...stylePaints };
    if (combined.fill || combined.stroke)
      paints.set(el, {
        ...(combined.fill ? { fill: combined.fill } : {}),
        ...(combined.stroke ? { stroke: combined.stroke } : {}),
      });
    if (combined.clip || combined.mask)
      effects.set(el, { clip: combined.clip, mask: combined.mask });
    if (combined.filter) filters.set(el, combined.filter);
    let index = 0;
    for (const child of el.children)
      walk(child, `${path}/${child.localName.slice(0, 80)}[${++index}]`, depth + 1);
  }
  walk(root, "svg", 0, true);
  const definitionPaint = (element) => {
    const result = {};
    for (const channel of ["fill", "stroke"]) {
      const value =
        parseSvgInlineStyle(element.getAttribute("style") ?? "", definitionStyles)
          .filter((declaration) => declaration.apply && declaration.name === channel)
          .at(-1)?.value ?? element.getAttribute(channel);
      const local = value ? LOCAL_PAINT.exec(value.trim())?.[2] : undefined;
      if (local)
        result[channel] = patterns.has(local) ? patterns.resolve(local) : gradients.resolve(local);
    }
    return result.fill || result.stroke ? result : undefined;
  };
  const readPresentation = (element) => ({
    attrs: attributes.get(element) ?? {},
    gradients: attributes.has(element) ? paints.get(element) : definitionPaint(element),
  });
  try {
    for (const definition of effectCatalog.validateAll(readPresentation))
      for (const element of definition.metadata)
        descriptive.push({ element, path: "svg/defs/metadata" });
  } catch (error) {
    issue("svg/defs", error instanceof Error ? error.message : "Definição de efeito inválida.");
  }
  let referenceCount = 0;
  for (const [element, references] of effects)
    for (const kind of ["clip", "mask"])
      if (references[kind]) {
        try {
          if (++referenceCount > 256) throw new Error("SVG excede 256 referências de efeitos.");
          effectCatalog.resolve(references[kind], kind, readPresentation);
        } catch (error) {
          issue(
            locations.get(element) ?? "svg",
            error instanceof Error ? error.message : "Referência de efeito inválida.",
          );
        }
      }
  for (const { element, path } of descriptive)
    if (!semanticCatalog.used(element))
      issue(
        path,
        "Metadados fora da conversão semântica suportada conservados somente na fonte original; revise nomes/descrições após importar.",
        "warning",
      );
    else if (element.localName === "title")
      issue(
        path,
        "Título convertido em nome acessível editável; o tooltip SVG original não é recriado.",
        "warning",
      );
  if (errors) return { scene: null, report: report() };
  try {
    let box = root
      .getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (!box) {
      const dimension = (name) => {
        const value = root.getAttribute(name) || "";
        if (!/^\d+(?:\.\d+)?(?:px)?$/.test(value))
          throw new Error("SVG precisa de viewBox ou dimensões em pixels.");
        return parseFloat(value);
      };
      box = [0, 0, dimension("width"), dimension("height")];
    }
    let number = 0,
      generated = 0;
    const reserveNode = () => {
      if (++generated > 2000)
        throw new Error(
          "Objetos gerados por efeitos excedem o limite de 2000; nenhuma arte foi importada.",
        );
    };
    function attachEffects(node, element) {
      const references = effects.get(element);
      if (!references) return node;
      if (node.tag !== "g") {
        reserveNode();
        const artwork = {
            ...node,
            id: `node-${crypto.randomUUID()}`,
            name: `${node.name} · desenho`.slice(0, 120),
            attrs: { ...node.attrs },
            transform: identity(),
          },
          attrs = {};
        delete artwork.semantics;
        for (const name of ["transform", "opacity", "display", "visibility"])
          if (artwork.attrs[name] !== undefined) {
            attrs[name] = artwork.attrs[name];
            delete artwork.attrs[name];
          }
        node = {
          id: node.id,
          name: node.name,
          tag: "g",
          attrs,
          ...(node.semantics ? { semantics: node.semantics } : {}),
          children: [artwork],
          transform: identity(),
          visible: true,
          locked: false,
          text: "",
        };
      }
      const typed = {};
      for (const kind of ["clip", "mask"]) {
        const id = references[kind];
        if (!id) continue;
        reserveNode();
        const definition = effectCatalog.resolve(id, kind, readPresentation),
          sourceId = `node-${crypto.randomUUID()}`;
        node.children.push({
          id: sourceId,
          name: `${kind === "clip" ? "Recorte" : "Máscara"} · ${node.name}`.slice(0, 120),
          tag: definition.nativeShape?.kind ?? "path",
          attrs: {
            ...(definition.nativeShape
              ? svgPrimitiveAttributes(definition.nativeShape)
              : { d: definition.d }),
            transform: `matrix(${definition.matrix.join(" ")})`,
            ...(definition.painted
              ? {
                  // SVG initial values, explicit: mask content inherits from the <mask>, never
                  // from the group this hidden source is placed in.
                  fill: "#000000",
                  "fill-opacity": "1",
                  stroke: "none",
                  "stroke-width": "1",
                  "stroke-opacity": "1",
                  "stroke-linecap": "butt",
                  "stroke-linejoin": "miter",
                  "stroke-dasharray": "none",
                  ...definition.painted.attrs,
                }
              : { fill: "#ffffff", stroke: "none" }),
          },
          ...(definition.painted?.gradients ? { gradients: definition.painted.gradients } : {}),
          text: "",
          transform: { ...identity(), opacity: definition.sourceOpacity },
          visible: false,
          locked: false,
          children: [],
        });
        typed[kind] = {
          sourceId,
          rule: definition.rule,
          ...(kind === "mask" ? { opacity: definition.opacity } : {}),
          ...(kind === "mask" && definition.painted ? { mode: definition.painted.mode } : {}),
        };
      }
      node.effects = typed;
      issue(
        locations.get(element) ?? "svg",
        "Efeito convertido em grupo portador e fontes locais ocultas editáveis; instâncias de definição ficam independentes por uso.",
        "warning",
      );
      return node;
    }
    function convert(el) {
      if (
        metadata.has(el.localName) ||
        gradients.isDefinition(el) ||
        patterns.isDefinition(el) ||
        filterCatalog.isDefinition(el) ||
        effectCatalog.isDefinition(el)
      )
        return null;
      reserveNode();
      const node = {
        id: `node-${crypto.randomUUID()}`,
        name: (
          el.getAttribute("id") ||
          expansion.names.get(el) ||
          `${el.localName} ${++number}`
        ).slice(0, 120),
        tag: el.localName,
        attrs: attributes.get(el) ?? {},
        ...(paints.has(el) ? { gradients: paints.get(el) } : {}),
        ...(filters.has(el) ? { filter: filters.get(el) } : {}),
        ...(semantics.has(el) ? { semantics: semantics.get(el) } : {}),
        text:
          el.localName === "text"
            ? [...el.childNodes]
                .filter((child) => child.nodeType === 3 || child.nodeType === 4)
                .map((child) => child.textContent ?? "")
                .join("")
            : "",
        transform: identity(),
        visible: true,
        locked: false,
        children: [],
      };
      for (const child of el.children) {
        const parsed = convert(child);
        if (parsed) node.children.push(parsed);
      }
      return attachEffects(node, el);
    }
    const rootAttrs = attributes.get(root) ?? {},
      rootCarrier =
        Object.keys(rootAttrs).length ||
        paints.has(root) ||
        filters.has(root) ||
        semantics.has(root) ||
        effects.has(root);
    if (rootCarrier) reserveNode();
    const nodes = [...root.children].map(convert).filter(Boolean);
    const scene = validateScene({
      viewBox: box,
      preserveAspectRatio:
        root.getAttribute("preserveAspectRatio")?.trim().replace(/\s+/g, " ") || "xMidYMid meet",
      nodes: rootCarrier
        ? [
            attachEffects(
              {
                id: `node-${crypto.randomUUID()}`,
                name: "SVG",
                tag: "g",
                attrs: rootAttrs,
                ...(paints.has(root) ? { gradients: paints.get(root) } : {}),
                ...(filters.has(root) ? { filter: filters.get(root) } : {}),
                ...(semantics.has(root) ? { semantics: semantics.get(root) } : {}),
                children: nodes,
                transform: identity(),
              },
              root,
            ),
          ]
        : nodes,
      source,
    });
    return { scene, report: report() };
  } catch (error) {
    issue("svg", error instanceof Error ? error.message : "Geometria SVG inválida.");
    return { scene: null, report: report() };
  }
}
export function importSvg(source, Parser = globalThis.DOMParser) {
  const result = inspectSvgImport(source, Parser);
  if (!result.scene) throw new SvgImportError(result.report);
  return result.scene;
}
