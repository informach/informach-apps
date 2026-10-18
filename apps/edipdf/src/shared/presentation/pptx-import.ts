import type { Element } from "@xmldom/xmldom";
import {
  attr,
  child,
  children,
  descendants,
  isOfficeElement,
  type OfficeRelationship,
  officeRelationships,
  officeXmlPart,
} from "../office-dom.ts";
import { type OfficeParagraph, officeParagraphSchema } from "../office-format.ts";
import { officePart, readOfficePackage } from "../office-package.ts";
import { validateRasterImage } from "../raster-image.ts";
import { type Presentation, type PresentationElement, presentationSchema } from "./format.ts";

type RunStyle = Omit<OfficeParagraph["runs"][number], "text">;
export type CropPicture = (
  bytes: Uint8Array,
  format: "png" | "jpg",
  crop: { left: number; top: number; right: number; bottom: number },
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; format: "png" | "jpg" }>;
const EMU = 12700;
function numeric(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (
    !value.trim() ||
    !/^[+-]?\d+(?:\.\d+)?$/.test(value) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error("Medida/valor PPTX inválido ou fora do perfil local.");
  return Number(value);
}
function relation(
  list: Map<string, OfficeRelationship>,
  id: string | undefined,
  suffix: string,
): string {
  const value = id && list.get(id);
  if (!value || value.external || !value.type.endsWith(`/${suffix}`))
    throw new Error(`Relacionamento PPTX local inválido: ${suffix}.`);
  return value.target;
}
function related(list: Map<string, OfficeRelationship>, suffix: string): string | undefined {
  const matches = [...list.values()].filter((item) => item.type.endsWith(`/${suffix}`));
  if (matches.length > 1 || matches.some((item) => item.external))
    throw new Error("Relacionamentos estruturais PPTX duplicados/externos.");
  return matches[0]?.target;
}
function placeholder(node: Element): Element | undefined {
  return (
    child(child(node, "presentation", "nvSpPr"), "presentation", "nvPr") &&
    child(
      child(child(node, "presentation", "nvSpPr"), "presentation", "nvPr"),
      "presentation",
      "ph",
    )
  );
}
function corresponding(tree: Element | undefined, node: Element): Element | undefined {
  const ph = placeholder(node);
  if (!ph || !tree) return undefined;
  const idx = ph.getAttribute("idx"),
    type = ph.getAttribute("type") ?? "obj";
  return children(tree).find((candidate) => {
    const other = placeholder(candidate);
    return (
      other &&
      (idx !== null
        ? other.getAttribute("idx") === idx
        : (other.getAttribute("type") ?? "obj") === type)
    );
  });
}
function hslTransform(
  channels: number[],
  lightness: (value: number) => number,
  saturation: (value: number) => number,
): number[] {
  const red = channels[0],
    green = channels[1],
    blue = channels[2];
  if (red === undefined || green === undefined || blue === undefined)
    throw new Error("Cor RGB PPTX incompleta.");
  const r = red / 255,
    g = green / 255,
    b = blue / 255,
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min,
    originalLightness = (max + min) / 2,
    originalSaturation = delta ? delta / (1 - Math.abs(2 * originalLightness - 1)) : 0,
    hue = delta
      ? max === r
        ? (g - b) / delta + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4
      : 0,
    l = Math.max(0, Math.min(1, lightness(originalLightness))),
    s = Math.max(0, Math.min(1, saturation(originalSaturation))),
    chroma = (1 - Math.abs(2 * l - 1)) * s,
    component = chroma * (1 - Math.abs((hue % 2) - 1)),
    offset = l - chroma / 2,
    result =
      hue < 1
        ? [chroma, component, 0]
        : hue < 2
          ? [component, chroma, 0]
          : hue < 3
            ? [0, chroma, component]
            : hue < 4
              ? [0, component, chroma]
              : hue < 5
                ? [component, 0, chroma]
                : [chroma, 0, component];
  return result.map((value) => (value + offset) * 255);
}
class Colors {
  private theme: Element | undefined;
  private values = new Map<string, string>();
  private mappings = new Map<string, string>([
    ["bg1", "lt1"],
    ["tx1", "dk1"],
    ["bg2", "lt2"],
    ["tx2", "dk2"],
  ]);
  constructor(theme: Element | undefined, mapping: Element | undefined) {
    this.theme = theme;
    const scheme = child(child(theme, "drawing", "themeElements"), "drawing", "clrScheme");
    if (scheme)
      for (const entry of children(scheme)) {
        const value = children(entry)[0];
        if (!value) throw new Error("Cor de tema PPTX sem valor.");
        const hex = isOfficeElement(value, "drawing", "srgbClr")
          ? value.getAttribute("val")
          : isOfficeElement(value, "drawing", "sysClr")
            ? value.getAttribute("lastClr")
            : undefined;
        if (!hex || !/^[a-f\d]{6}$/i.test(hex)) throw new Error("Cor de tema PPTX não suportada.");
        this.values.set(entry.localName ?? "", `#${hex}`);
      }
    if (mapping)
      for (const property of Array.from(mapping.attributes))
        this.mappings.set(property.localName ?? property.name, property.value);
  }
  paint(
    reference: Element | undefined,
    kind: "fill" | "line",
  ): { node?: Element; fallback: string } {
    if (!reference) return { fallback: "#202020" };
    const index = numeric(reference.getAttribute("idx"), 0, 0, 10000);
    if (!index) return { fallback: "#202020" };
    const format = child(child(this.theme, "drawing", "themeElements"), "drawing", "fmtScheme"),
      list = child(
        format,
        "drawing",
        kind === "line" ? "lnStyleLst" : index >= 1001 ? "bgFillStyleLst" : "fillStyleLst",
      ),
      value = list && children(list)[index >= 1001 && kind === "fill" ? index - 1001 : index - 1];
    if (!value) throw new Error("Estilo de tema PPTX não encontrado.");
    if (
      kind === "fill" &&
      !isOfficeElement(value, "drawing", "solidFill") &&
      !isOfficeElement(value, "drawing", "noFill")
    )
      throw new Error("Preenchimento de tema PPTX fora do perfil sólido.");
    return { node: value, fallback: this.value(reference) };
  }
  value(parent: Element | undefined, fallback = "#202020"): string {
    if (!parent) return fallback;
    const node = children(parent).find((item) =>
      ["srgbClr", "schemeClr", "sysClr"].some((name) => isOfficeElement(item, "drawing", name)),
    );
    if (!node) throw new Error("Cor PPTX fora do perfil RGB/tema.");
    let result: string | undefined;
    if (isOfficeElement(node, "drawing", "srgbClr")) result = `#${node.getAttribute("val") ?? ""}`;
    else if (isOfficeElement(node, "drawing", "sysClr"))
      result = `#${node.getAttribute("lastClr") ?? ""}`;
    else {
      const key = node.getAttribute("val") ?? "";
      result = key === "phClr" ? fallback : this.values.get(this.mappings.get(key) ?? key);
    }
    if (!result || !/^#[a-f\d]{6}$/i.test(result))
      throw new Error("Cor de tema PPTX não encontrada.");
    let rgb = [1, 3, 5].map((at) => Number.parseInt(result.slice(at, at + 2), 16));
    for (const effect of children(node)) {
      const ratio =
        numeric(
          effect.getAttribute("val"),
          100000,
          0,
          isOfficeElement(effect, "drawing", "satMod") ||
            isOfficeElement(effect, "drawing", "lumMod")
            ? 1000000
            : 100000,
        ) / 100000;
      if (isOfficeElement(effect, "drawing", "tint"))
        rgb = rgb.map((value) => value * ratio + 255 * (1 - ratio));
      else if (isOfficeElement(effect, "drawing", "shade")) rgb = rgb.map((value) => value * ratio);
      else if (isOfficeElement(effect, "drawing", "lumMod"))
        rgb = hslTransform(
          rgb,
          (value) => value * ratio,
          (value) => value,
        );
      else if (isOfficeElement(effect, "drawing", "lumOff"))
        rgb = hslTransform(
          rgb,
          (value) => value + ratio,
          (value) => value,
        );
      else if (isOfficeElement(effect, "drawing", "satMod"))
        rgb = hslTransform(
          rgb,
          (value) => value,
          (value) => value * ratio,
        );
      else if (isOfficeElement(effect, "drawing", "satOff"))
        rgb = hslTransform(
          rgb,
          (value) => value,
          (value) => value + ratio,
        );
      else if (isOfficeElement(effect, "drawing", "alpha")) {
        if (ratio !== 1)
          throw new Error("Transparência de cor PPTX ainda não suportada neste perfil de leitura.");
      } else throw new Error("Efeito de cor PPTX ainda não suportado.");
    }
    return `#${rgb
      .map((value) =>
        Math.round(Math.max(0, Math.min(255, value)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }
}
function frame(node: Element, layout?: Element, master?: Element) {
  const isLine =
    isOfficeElement(node, "presentation", "cxnSp") ||
    child(child(node, "presentation", "spPr"), "drawing", "prstGeom")?.getAttribute("prst") ===
      "line";
  const transform =
    child(child(node, "presentation", "spPr"), "drawing", "xfrm") ??
    child(child(layout, "presentation", "spPr"), "drawing", "xfrm") ??
    child(child(master, "presentation", "spPr"), "drawing", "xfrm");
  if (!transform) throw new Error("Objeto PPTX sem geometria própria/herdada.");
  const offset = child(transform, "drawing", "off"),
    extent = child(transform, "drawing", "ext");
  if (!offset || !extent) throw new Error("Geometria PPTX incompleta.");
  return {
    box: {
      x: numeric(offset.getAttribute("x"), 0, 0, 51206400) / EMU,
      y: numeric(offset.getAttribute("y"), 0, 0, 51206400) / EMU,
      w: numeric(extent.getAttribute("cx"), 0, isLine ? 0 : 1, 51206400) / EMU,
      h: numeric(extent.getAttribute("cy"), 0, isLine ? 0 : 1, 51206400) / EMU,
    },
    rotation: numeric(transform.getAttribute("rot"), 0, -21600000, 21600000) / 60000,
    flipX: ["1", "true"].includes(transform.getAttribute("flipH") ?? ""),
    flipY: ["1", "true"].includes(transform.getAttribute("flipV") ?? ""),
  };
}
function runStyle(
  node: Element | undefined,
  inherited: RunStyle,
  colors: Colors,
  warnings: Set<string>,
): RunStyle {
  if (!node) return { ...inherited };
  const result = { ...inherited };
  if (node.hasAttribute("sz"))
    result.size = numeric(node.getAttribute("sz"), 1800, 400, 20000) / 100;
  if (node.hasAttribute("b")) result.bold = ["1", "true"].includes(node.getAttribute("b") ?? "");
  if (node.hasAttribute("i")) result.italic = ["1", "true"].includes(node.getAttribute("i") ?? "");
  const fill = child(node, "drawing", "solidFill");
  if (fill) result.color = colors.value(fill);
  if (node.hasAttribute("u") || node.hasAttribute("strike"))
    warnings.add("Sublinhados/tachados PPTX não entram no perfil inicial de leitura.");
  if (child(node, "drawing", "hlinkClick"))
    warnings.add("Links são preservados como texto; endereços não são acessados.");
  return result;
}
function paragraphs(
  body: Element,
  inheritedBody: Element | undefined,
  inheritedStyle: Element | undefined,
  colors: Colors,
  warnings: Set<string>,
): OfficeParagraph[] {
  const result: OfficeParagraph[] = [];
  for (const paragraph of children(body)) {
    if (
      isOfficeElement(paragraph, "drawing", "bodyPr") ||
      isOfficeElement(paragraph, "drawing", "lstStyle")
    )
      continue;
    if (!isOfficeElement(paragraph, "drawing", "p"))
      throw new Error("Bloco de texto PPTX não suportado.");
    const props = child(paragraph, "drawing", "pPr"),
      level = numeric(props?.getAttribute("lvl"), 0, 0, 8) + 1,
      localDefault = child(child(body, "drawing", "lstStyle"), "drawing", `lvl${level}pPr`),
      inheritedDefault =
        child(child(inheritedBody, "drawing", "lstStyle"), "drawing", `lvl${level}pPr`) ??
        child(inheritedStyle, "drawing", `lvl${level}pPr`);
    let style: RunStyle = { size: 18, color: "#202020" };
    for (const properties of [inheritedDefault, localDefault, props])
      style = runStyle(child(properties, "drawing", "defRPr"), style, colors, warnings);
    const runs: OfficeParagraph["runs"] = [];
    for (const node of children(paragraph)) {
      if (isOfficeElement(node, "drawing", "pPr") || isOfficeElement(node, "drawing", "endParaRPr"))
        continue;
      if (isOfficeElement(node, "drawing", "br"))
        runs.push({
          text: "\n",
          ...runStyle(child(node, "drawing", "rPr"), style, colors, warnings),
        });
      else if (isOfficeElement(node, "drawing", "r") || isOfficeElement(node, "drawing", "fld")) {
        if (isOfficeElement(node, "drawing", "fld"))
          warnings.add("Campos PPTX usam somente o texto salvo; não são atualizados/executados.");
        const text = child(node, "drawing", "t");
        if (!text) throw new Error("Trecho PPTX sem texto armazenado.");
        runs.push({
          text: text.textContent ?? "",
          ...runStyle(child(node, "drawing", "rPr"), style, colors, warnings),
        });
      } else throw new Error("Trecho de texto PPTX ainda não suportado.");
    }
    const alignment =
      props?.getAttribute("algn") ??
      localDefault?.getAttribute("algn") ??
      inheritedDefault?.getAttribute("algn") ??
      "l";
    if (!["l", "ctr", "r", "just"].includes(alignment))
      throw new Error("Alinhamento PPTX ainda não suportado.");
    const bullet = [props, localDefault, inheritedDefault].flatMap((properties) =>
      properties
        ? children(properties).filter((node) =>
            ["buNone", "buChar", "buAutoNum", "buBlip"].some((name) =>
              isOfficeElement(node, "drawing", name),
            ),
          )
        : [],
    )[0];
    if (
      bullet &&
      (isOfficeElement(bullet, "drawing", "buAutoNum") ||
        isOfficeElement(bullet, "drawing", "buBlip"))
    )
      throw new Error("Listas numeradas PPTX ainda exigem rótulos literais no perfil inicial.");
    const hasBullet =
      bullet && isOfficeElement(bullet, "drawing", "buChar") && runs.some((run) => run.text.trim());
    if (hasBullet) runs.unshift({ ...style, text: `${bullet.getAttribute("char") ?? "•"} ` });
    result.push(
      officeParagraphSchema.parse({
        kind: "paragraph",
        runs,
        align:
          alignment === "ctr"
            ? "center"
            : alignment === "r"
              ? "right"
              : alignment === "just"
                ? "justify"
                : "left",
      }),
    );
  }
  return result.length ? result : [officeParagraphSchema.parse({ kind: "paragraph", runs: [] })];
}

export async function importPptx(
  bytes: Uint8Array,
  title: string,
  cropPicture: CropPicture,
): Promise<Presentation> {
  const parts = readOfficePackage(bytes),
    main = relation(
      officeRelationships(parts, ""),
      [...officeRelationships(parts, "")].find(([, item]) =>
        item.type.endsWith("/officeDocument"),
      )?.[0],
      "officeDocument",
    ),
    root = officeXmlPart(parts, main).documentElement;
  if (!root || !isOfficeElement(root, "presentation", "presentation"))
    throw new Error("PPTX sem apresentação válida.");
  const size = child(root, "presentation", "sldSz");
  if (!size) throw new Error("PPTX sem tamanho de slide.");
  const width = numeric(size.getAttribute("cx"), 0, 914400, 51206400) / EMU,
    height = numeric(size.getAttribute("cy"), 0, 914400, 51206400) / EMU,
    warnings = new Set<string>([
      "Fontes PPTX são recompostas com Noto Sans local; métricas/ajuste de texto podem mudar. Animações, transições, notas e elementos interativos não são executados.",
    ]),
    slides: Presentation["slides"] = [],
    mainRelations = officeRelationships(parts, main),
    identifiers = new Set<string>();
  let totalObjects = 0,
    totalCharacters = 0,
    totalRuns = 0,
    totalImages = 0;
  for (const sourceId of children(child(root, "presentation", "sldIdLst") ?? root)) {
    if (!isOfficeElement(sourceId, "presentation", "sldId"))
      throw new Error("Lista de slides PPTX inválida.");
    const path = relation(mainRelations, attr(sourceId, "relation", "id"), "slide");
    if (identifiers.has(path) || slides.length >= 200)
      throw new Error("Slides PPTX repetidos ou acima do limite local.");
    identifiers.add(path);
    const slide = officeXmlPart(parts, path).documentElement,
      slideRelations = officeRelationships(parts, path),
      layoutPath = related(slideRelations, "slideLayout"),
      layout = layoutPath ? officeXmlPart(parts, layoutPath).documentElement : undefined,
      masterPath = layoutPath
        ? related(officeRelationships(parts, layoutPath), "slideMaster")
        : undefined,
      master = masterPath ? officeXmlPart(parts, masterPath).documentElement : undefined,
      themePath = masterPath ? related(officeRelationships(parts, masterPath), "theme") : undefined,
      theme = themePath ? officeXmlPart(parts, themePath).documentElement : undefined;
    if (!slide || !isOfficeElement(slide, "presentation", "sld"))
      throw new Error("Slide PPTX inválido.");
    if (slide.getAttribute("show") === "0")
      warnings.add(
        "Slides ocultos na apresentação são incluídos nesta conversão; confira as páginas antes de salvar.",
      );
    const colors = new Colors(
        theme ?? undefined,
        child(child(slide, "presentation", "clrMapOvr"), "drawing", "overrideClrMapping") ??
          child(
            child(layout ?? undefined, "presentation", "clrMapOvr"),
            "drawing",
            "overrideClrMapping",
          ) ??
          child(master ?? undefined, "presentation", "clrMap"),
      ),
      elements: PresentationElement[] = [];
    const add = (element: PresentationElement) => {
      totalObjects++;
      if (element.kind === "image") totalImages += element.bytes.length;
      if (element.kind === "text")
        for (const paragraph of element.paragraphs)
          for (const run of paragraph.runs) {
            totalCharacters += run.text.length;
            totalRuns++;
          }
      if (
        totalObjects > 50000 ||
        totalCharacters > 2_000_000 ||
        totalRuns > 200000 ||
        totalImages > 64 * 1024 * 1024
      )
        throw new Error("PPTX excede os limites locais de objetos/texto/imagens.");
      elements.push(element);
    };
    const treeOf = (node: Element | undefined | null) =>
        child(child(node ?? undefined, "presentation", "cSld"), "presentation", "spTree"),
      layoutTree = treeOf(layout),
      masterTree = treeOf(master);
    let objectCount = 0;
    for (const [level, owner, ownerPath] of [
      ["master", master, masterPath],
      ["layout", layout, layoutPath],
      ["slide", slide, path],
    ] as const) {
      if (!owner || !ownerPath) continue;
      if (owner.getAttribute("showMasterSp") === "0")
        throw new Error("Visibilidade herdada de objetos PPTX ainda não suportada neste perfil.");
      const ownerRelations = officeRelationships(parts, ownerPath),
        tree = treeOf(owner);
      if (!tree) throw new Error("PPTX sem árvore de objetos.");
      for (const node of children(tree)) {
        if (
          isOfficeElement(node, "presentation", "nvGrpSpPr") ||
          isOfficeElement(node, "presentation", "grpSpPr") ||
          isOfficeElement(node, "presentation", "extLst")
        )
          continue;
        if (level !== "slide" && placeholder(node)) {
          warnings.add(
            "Marcadores herdados de rodapé/data/número não entram no perfil inicial; texto explícito do slide é conservado.",
          );
          continue;
        }
        const identity = descendants(node, "presentation", "cNvPr")[0];
        if (["1", "true"].includes(identity?.getAttribute("hidden") ?? "")) {
          warnings.add("Objetos ocultos da apresentação não são incluídos na conversão visível.");
          continue;
        }
        if (++objectCount > 10000) throw new Error("Slide PPTX excede dez mil objetos.");
        if (
          !isOfficeElement(node, "presentation", "sp") &&
          !isOfficeElement(node, "presentation", "pic") &&
          !isOfficeElement(node, "presentation", "cxnSp")
        )
          throw new Error(`Objeto PPTX fora do perfil inicial: ${node.tagName}.`);
        const layoutNode = level === "slide" ? corresponding(layoutTree, node) : undefined,
          masterNode = corresponding(masterTree, layoutNode ?? node),
          position = frame(node, layoutNode, masterNode),
          id = `slide${slides.length + 1}-${objectCount}`,
          properties = child(node, "presentation", "spPr");
        if (isOfficeElement(node, "presentation", "pic")) {
          const fill = child(node, "presentation", "blipFill"),
            blip = child(fill, "drawing", "blip"),
            target = relation(ownerRelations, attr(blip, "relation", "embed"), "image");
          if (child(fill, "drawing", "tile"))
            throw new Error("Imagem PPTX repetida por mosaico ainda não suportada.");
          const destinationCrop = child(child(fill, "drawing", "stretch"), "drawing", "fillRect");
          if (
            ["l", "t", "r", "b"].some(
              (edge) => numeric(destinationCrop?.getAttribute(edge), 0, -100000, 100000) !== 0,
            )
          )
            throw new Error("Ajuste do retângulo de destino da imagem PPTX ainda não suportado.");
          if (!blip || children(blip).some((item) => !isOfficeElement(item, "drawing", "extLst")))
            throw new Error("Efeitos de imagem PPTX ainda não suportados.");
          const image = officePart(parts, target),
            format = /\.png$/i.test(target) ? "png" : /\.jpe?g$/i.test(target) ? "jpg" : undefined;
          if (!format) throw new Error("Imagem PPTX fora do perfil PNG/JPEG.");
          validateRasterImage(image, format);
          const crop = child(fill, "drawing", "srcRect"),
            values = {
              left: numeric(crop?.getAttribute("l"), 0, 0, 99999) / 100000,
              top: numeric(crop?.getAttribute("t"), 0, 0, 99999) / 100000,
              right: numeric(crop?.getAttribute("r"), 0, 0, 99999) / 100000,
              bottom: numeric(crop?.getAttribute("b"), 0, 0, 99999) / 100000,
            };
          if (values.left + values.right >= 1 || values.top + values.bottom >= 1)
            throw new Error("Recorte PPTX elimina toda a imagem.");
          const output: Awaited<ReturnType<CropPicture>> = Object.values(values).some(Boolean)
            ? await cropPicture(image, format, values)
            : { bytes: new Uint8Array(image), format };
          validateRasterImage(output.bytes, output.format);
          add({
            kind: "image",
            id,
            ...position,
            ...output,
            alt:
              child(child(node, "presentation", "nvPicPr"), "presentation", "cNvPr")?.getAttribute(
                "descr",
              ) ?? "",
          });
        } else {
          const style = child(node, "presentation", "style"),
            directFill = child(properties, "drawing", "solidFill"),
            directLine = child(properties, "drawing", "ln"),
            directStroke = child(directLine, "drawing", "solidFill"),
            fillReference = child(style, "drawing", "fillRef"),
            lineReference = child(style, "drawing", "lnRef"),
            themeFill =
              directFill || child(properties, "drawing", "noFill")
                ? {
                    fallback:
                      child(directFill, "drawing", "schemeClr")?.getAttribute("val") === "phClr"
                        ? colors.value(fillReference)
                        : "#202020",
                  }
                : colors.paint(fillReference, "fill"),
            themeLine =
              directStroke || child(directLine, "drawing", "noFill")
                ? {
                    fallback:
                      child(directStroke, "drawing", "schemeClr")?.getAttribute("val") === "phClr"
                        ? colors.value(lineReference)
                        : "#202020",
                  }
                : colors.paint(lineReference, "line"),
            fill =
              directFill ??
              (themeFill.node && isOfficeElement(themeFill.node, "drawing", "solidFill")
                ? themeFill.node
                : undefined),
            line = directLine ?? themeLine.node,
            stroke = directStroke ?? child(themeLine.node, "drawing", "solidFill"),
            geometry = child(properties, "drawing", "prstGeom"),
            shape = geometry?.getAttribute("prst"),
            noFill = child(properties, "drawing", "noFill"),
            noLine = child(line, "drawing", "noFill"),
            body = child(node, "presentation", "txBody");
          if (
            child(properties, "drawing", "gradFill") ||
            child(properties, "drawing", "custGeom") ||
            child(properties, "drawing", "blipFill")
          )
            throw new Error("Geometria/preenchimento PPTX fora do perfil inicial.");
          if (shape && !["rect", "ellipse", "line"].includes(shape))
            throw new Error(`Forma PPTX ainda não suportada: ${shape}.`);
          if (shape && (fill || stroke) && !(noFill && noLine))
            add({
              kind: "shape",
              id: `${id}-shape`,
              ...position,
              shape: shape === "ellipse" ? "ellipse" : shape === "line" ? "line" : "rect",
              fill: noFill ? null : fill ? colors.value(fill, themeFill.fallback) : null,
              stroke: noLine ? null : stroke ? colors.value(stroke, themeLine.fallback) : null,
              width: numeric(line?.getAttribute("w"), EMU, 0, EMU * 100) / EMU,
              opacity: 1,
            });
          if (body) {
            const ph = placeholder(node),
              type = ph
                ? (ph.getAttribute("type") ??
                  (layoutNode ? placeholder(layoutNode)?.getAttribute("type") : undefined) ??
                  (masterNode ? placeholder(masterNode)?.getAttribute("type") : undefined) ??
                  "obj")
                : "other",
              inherited =
                child(layoutNode, "presentation", "txBody") ??
                child(masterNode, "presentation", "txBody"),
              defaults = child(
                child(master ?? undefined, "presentation", "txStyles"),
                "presentation",
                ["title", "ctrTitle"].includes(type)
                  ? "titleStyle"
                  : type === "body" || type === "obj"
                    ? "bodyStyle"
                    : "otherStyle",
              ),
              bodyProperties = child(body, "drawing", "bodyPr"),
              inheritedProperties = child(inherited, "drawing", "bodyPr");
            if (
              bodyProperties?.getAttribute("vert") &&
              bodyProperties.getAttribute("vert") !== "horz"
            )
              throw new Error("Texto vertical PPTX ainda não suportado.");
            const anchor = bodyProperties?.getAttribute("anchor") ?? "t";
            if (!["t", "ctr", "b"].includes(anchor))
              throw new Error("Alinhamento vertical PPTX não suportado.");
            add({
              kind: "text",
              id,
              ...position,
              paragraphs: paragraphs(body, inherited, defaults, colors, warnings),
              vertical: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top",
              margins: {
                left:
                  numeric(
                    bodyProperties?.getAttribute("lIns") ??
                      inheritedProperties?.getAttribute("lIns"),
                    91440,
                    0,
                    2540000,
                  ) / EMU,
                right:
                  numeric(
                    bodyProperties?.getAttribute("rIns") ??
                      inheritedProperties?.getAttribute("rIns"),
                    91440,
                    0,
                    2540000,
                  ) / EMU,
                top:
                  numeric(
                    bodyProperties?.getAttribute("tIns") ??
                      inheritedProperties?.getAttribute("tIns"),
                    45720,
                    0,
                    2540000,
                  ) / EMU,
                bottom:
                  numeric(
                    bodyProperties?.getAttribute("bIns") ??
                      inheritedProperties?.getAttribute("bIns"),
                    45720,
                    0,
                    2540000,
                  ) / EMU,
              },
            });
          }
        }
      }
    }
    let background = "#ffffff";
    const backgroundNode = [slide, layout, master]
      .map((node) => child(child(node ?? undefined, "presentation", "cSld"), "presentation", "bg"))
      .find(Boolean);
    if (backgroundNode) {
      const fill = child(child(backgroundNode, "presentation", "bgPr"), "drawing", "solidFill"),
        reference = child(backgroundNode, "presentation", "bgRef");
      if (fill) background = colors.value(fill, "#ffffff");
      else if (reference) {
        const paint = colors.paint(reference, "fill");
        background =
          paint.node && isOfficeElement(paint.node, "drawing", "solidFill")
            ? colors.value(paint.node, paint.fallback)
            : "#ffffff";
      } else throw new Error("Fundo PPTX fora do perfil de cor sólida.");
    }
    slides.push({
      name:
        child(slide, "presentation", "cSld")?.getAttribute("name") ?? `Slide ${slides.length + 1}`,
      elements,
      background,
    });
  }
  return presentationSchema.parse({ title, width, height, slides, warnings: [...warnings] });
}
