import { Element } from "@xmldom/xmldom";
import { children } from "../office-dom.ts";
import { type OfficeParagraph, officeParagraphSchema } from "../office-format.ts";
import { attr, child, descendants, integer, is, length, NS } from "../open-document/dom.ts";
import { readOpenPackage, required, resourceName } from "../open-document/package.ts";
import { OpenStyles } from "../open-document/styles.ts";
import { validateRasterImage } from "../raster-image.ts";
import { type Presentation, type PresentationElement, presentationSchema } from "./format.ts";

type RunStyle = Omit<OfficeParagraph["runs"][number], "text">;
function percentage(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+(?:\.\d+)?%$/.test(value) || Number(value.slice(0, -1)) > 100)
    throw new Error("Opacidade ODP fora do perfil local.");
  return Number(value.slice(0, -1)) / 100;
}
function translatedLength(value: string): number {
  if (/^[+-]?0(?:\.0+)?$/.test(value)) return 0;
  const negative = value.startsWith("-");
  return (negative ? -1 : 1) * length(value.replace(/^[+-]/, ""), 0);
}
function position(node: Element) {
  const line = is(node, "draw", "line"),
    x = length(attr(node, "svg", line ? "x1" : "x"), 0),
    y = length(attr(node, "svg", line ? "y1" : "y"), 0),
    endX = line ? length(attr(node, "svg", "x2"), x) : x + length(attr(node, "svg", "width"), 0),
    endY = line ? length(attr(node, "svg", "y2"), y) : y + length(attr(node, "svg", "height"), 0),
    w = Math.abs(endX - x),
    h = Math.abs(endY - y),
    raw = attr(node, "draw", "transform");
  if (!line && (!w || !h)) throw new Error("Objeto ODP sem largura/altura explícitas.");
  let a = 1,
    b = 0,
    c = 0,
    d = 1,
    e = 0,
    f = 0;
  if (raw) {
    const match = /^matrix\(([^)]+)\)$/.exec(raw.trim()),
      values = match?.[1]?.trim().split(/[\s,]+/);
    if (values?.length !== 6)
      throw new Error("Transformação ODP fora do perfil matricial inicial.");
    const linear = values.slice(0, 4).map((value) => Number(value));
    if (
      linear.some((value) => !Number.isFinite(value) || Math.abs(value) > 1000) ||
      values[4] === undefined ||
      values[5] === undefined
    )
      throw new Error("Matriz ODP inválida.");
    const first = linear[0],
      second = linear[1],
      third = linear[2],
      fourth = linear[3];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined)
      throw new Error("Matriz ODP incompleta.");
    [a, b, c, d] = [first, second, third, fourth];
    e = translatedLength(values[4]);
    f = translatedLength(values[5]);
  }
  const sx = Math.hypot(a, b),
    determinant = a * d - b * c,
    sy = sx ? Math.abs(determinant / sx) : 0;
  if (sx <= 0 || sy <= 0 || Math.abs(a * c + b * d) > sx * Math.hypot(c, d) * 1e-6)
    throw new Error("Transformação ODP degenerada ou com skew ainda não suportada.");
  const centreX = a * (Math.min(x, endX) + w / 2) + c * (Math.min(y, endY) + h / 2) + e,
    centreY = b * (Math.min(x, endX) + w / 2) + d * (Math.min(y, endY) + h / 2) + f;
  return {
    box: { x: centreX - (w * sx) / 2, y: centreY - (h * sy) / 2, w: w * sx, h: h * sy },
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    flipX: line && endX < x,
    flipY: determinant < 0 !== (line && endY < y),
  };
}
export function importOdp(bytes: Uint8Array, title: string): Presentation {
  const input = readOpenPackage(bytes, "presentation"),
    warnings = new Set<string>([
      "ODP usa fontes Noto Sans locais; métricas/ajuste de texto podem mudar. Animações, transições e notas não são executadas.",
    ]),
    styles = new OpenStyles(input, warnings, { presentation: true }),
    body = child(
      child(input.content.documentElement ?? undefined, "office", "body"),
      "office",
      "presentation",
    );
  if (!body) throw new Error("ODP sem apresentação.");
  const masters = new Map<string, Element>();
  for (const document of [input.styles, input.content])
    if (document?.documentElement)
      for (const master of descendants(document.documentElement, "style", "master-page"))
        masters.set(attr(master, "style", "name") ?? "", master);
  const slides: Presentation["slides"] = [],
    names = new Set<string>();
  let width = 0,
    height = 0,
    objects = 0,
    characters = 0,
    runsCount = 0,
    imageBytes = 0;
  const properties = (
    family: string,
    name: string | undefined,
    kind: string,
    inherited?: (ns: keyof typeof NS, name: string) => string | undefined,
  ) => {
    const result = new Map<string, string>();
    for (const node of styles.chain(family, name)) {
      if (inherited && is(node, "style", "default-style")) continue;
      const props = child(node, "style", kind);
      if (props)
        for (const attribute of Array.from(props.attributes))
          result.set(`${attribute.namespaceURI}:${attribute.localName}`, attribute.value);
    }
    return (ns: keyof typeof NS, name: string) =>
      result.get(`${NS[ns]}:${name}`) ?? inherited?.(ns, name);
  };
  const inline = (node: Element, inherited: RunStyle): OfficeParagraph["runs"] => {
    const result: OfficeParagraph["runs"] = [];
    const append = (text: string, style: RunStyle) => {
      if (!text) return;
      characters += text.length;
      runsCount++;
      if (characters > 2_000_000 || runsCount > 200000)
        throw new Error("ODP excede os limites locais de texto/trechos.");
      result.push({ text, ...style });
    };
    for (const current of node.childNodes) {
      if (!(current instanceof Element)) {
        if (current.nodeType === 3 || current.nodeType === 4)
          append((current.nodeValue ?? "").replace(/[\t\r\n ]+/g, " "), inherited);
        continue;
      }
      if (is(current, "text", "s"))
        append(" ".repeat(integer(attr(current, "text", "c"), 1, 32767)), inherited);
      else if (is(current, "text", "tab")) append("\t", inherited);
      else if (is(current, "text", "line-break")) append("\n", inherited);
      else if (is(current, "text", "span") || is(current, "text", "a")) {
        const name = attr(current, "text", "style-name");
        result.push(...inline(current, name ? styles.run("text", name, inherited) : inherited));
        if (is(current, "text", "a"))
          warnings.add("Links ODP são conservados como texto; endereços não são acessados.");
      } else throw new Error(`Campo/trecho ODP ainda não suportado: ${current.tagName}.`);
    }
    return result;
  };
  for (const page of children(body)) {
    if (!is(page, "draw", "page")) throw new Error("Bloco de apresentação ODP não suportado.");
    if (slides.length >= 200) throw new Error("ODP excede duzentos slides.");
    const name = attr(page, "draw", "name") ?? `Slide ${slides.length + 1}`,
      masterName = attr(page, "draw", "master-page-name"),
      geometry = styles.page(masterName);
    if (names.has(name)) throw new Error("Nomes de slides ODP repetidos.");
    names.add(name);
    if (!slides.length) {
      width = geometry.width;
      height = geometry.height;
    } else if (Math.abs(geometry.width - width) > 0.01 || Math.abs(geometry.height - height) > 0.01)
      throw new Error("ODP com tamanhos diferentes de slide ainda não suportado.");
    if (attr(page, "presentation", "visibility") === "hidden")
      warnings.add(
        "Slides ocultos ODP são incluídos nesta conversão; confira as páginas antes de salvar.",
      );
    const master = masterName ? masters.get(masterName) : undefined;
    const backgroundProps = properties(
        "drawing-page",
        attr(page, "draw", "style-name"),
        "drawing-page-properties",
        master
          ? properties(
              "drawing-page",
              attr(master, "draw", "style-name"),
              "drawing-page-properties",
            )
          : undefined,
      ),
      fillMode = backgroundProps("draw", "fill"),
      background = backgroundProps("draw", "fill-color") ?? "#ffffff";
    if (fillMode && !["none", "solid"].includes(fillMode))
      throw new Error("Fundo ODP fora do perfil de cor sólida.");
    const elements: PresentationElement[] = [];
    const add = (element: PresentationElement) => {
      if (++objects > 50000) throw new Error("ODP excede cinquenta mil objetos.");
      elements.push(element);
    };
    for (const container of [master, page]) {
      if (!container) continue;
      for (const node of children(container)) {
        if (
          is(node, "presentation", "notes") ||
          is(node, "svg", "title") ||
          is(node, "svg", "desc")
        ) {
          warnings.add("Notas/descrições ODP não entram no conteúdo PDF do slide.");
          continue;
        }
        if (
          attr(node, "presentation", "placeholder") === "true" ||
          attr(node, "draw", "display") === "none"
        ) {
          warnings.add("Marcadores vazios/objetos ocultos ODP não são incluídos.");
          continue;
        }
        const frame = is(node, "draw", "frame"),
          rect = is(node, "draw", "rect"),
          ellipse = is(node, "draw", "ellipse"),
          line = is(node, "draw", "line");
        if (!frame && !rect && !ellipse && !line)
          throw new Error(`Objeto ODP fora do perfil inicial: ${node.tagName}.`);
        const props = properties("graphic", attr(node, "draw", "style-name"), "graphic-properties"),
          placement = position(node),
          id = `slide${slides.length + 1}-object${objects + 1}`,
          fill = props("draw", "fill"),
          stroke = props("draw", "stroke"),
          opacity = percentage(props("draw", "opacity"), 1),
          strokeOpacity = percentage(props("svg", "stroke-opacity"), opacity);
        if (
          (fill && !["none", "solid"].includes(fill)) ||
          (stroke && !["none", "solid"].includes(stroke))
        )
          throw new Error("Preenchimento/linha ODP fora do perfil sólido.");
        if (strokeOpacity !== opacity && stroke && stroke !== "none")
          throw new Error("Opacidades diferentes de preenchimento/linha ODP ainda não suportadas.");
        if (rect || ellipse || line || (fill && fill !== "none") || (stroke && stroke !== "none"))
          add({
            kind: "shape",
            id: `${id}-shape`,
            ...placement,
            shape: line ? "line" : ellipse ? "ellipse" : "rect",
            fill: fill === "solid" ? (props("draw", "fill-color") ?? "#ffffff") : null,
            stroke: stroke === "solid" ? (props("svg", "stroke-color") ?? "#000000") : null,
            width: length(props("svg", "stroke-width"), 1),
            opacity,
          });
        if (frame) {
          const picture = child(node, "draw", "image"),
            textBox = child(node, "draw", "text-box");
          if (
            (picture && textBox) ||
            children(node).some(
              (item) =>
                !is(item, "draw", "image") &&
                !is(item, "draw", "text-box") &&
                !is(item, "svg", "title") &&
                !is(item, "svg", "desc"),
            )
          )
            throw new Error("Quadro ODP contém objeto não suportado.");
          if (picture) {
            styles.graphic(attr(node, "draw", "style-name"));
            if (
              children(picture).length ||
              children(node).filter((item) => is(item, "draw", "image")).length !== 1
            )
              throw new Error("Imagem ODP em XML/alternativas ainda não suportada.");
            const path = resourceName(attr(picture, "xlink", "href") ?? ""),
              data = required(input.parts, path),
              format = /\.png$/i.test(path) ? "png" : /\.jpe?g$/i.test(path) ? "jpg" : undefined;
            if (!format) throw new Error("ODP suporta PNG/JPEG neste perfil.");
            validateRasterImage(data, format);
            imageBytes += data.length;
            if (imageBytes > 64 * 1024 * 1024)
              throw new Error("ODP excede o limite local de imagens.");
            add({
              kind: "image",
              id,
              ...placement,
              bytes: new Uint8Array(data),
              format,
              alt: child(node, "svg", "desc")?.textContent ?? "",
            });
          } else if (textBox) {
            const paragraphs: OfficeParagraph[] = [];
            for (const paragraph of children(textBox)) {
              if (!is(paragraph, "text", "p") && !is(paragraph, "text", "h"))
                throw new Error("Listas/objetos em caixa ODP ainda não suportados.");
              const styleName = attr(paragraph, "text", "style-name"),
                alignment = styles.paragraph(styleName);
              paragraphs.push(
                officeParagraphSchema.parse({
                  kind: "paragraph",
                  runs: inline(
                    paragraph,
                    styles.run(
                      "paragraph",
                      styleName,
                      styles.run("graphic", attr(node, "draw", "style-name")),
                    ),
                  ),
                  align: alignment.align,
                }),
              );
            }
            const padding = length(props("fo", "padding"), 0),
              vertical = props("draw", "textarea-vertical-align") ?? "top";
            if (!["top", "middle", "bottom"].includes(vertical))
              throw new Error("Alinhamento vertical ODP fora do perfil inicial.");
            add({
              kind: "text",
              id,
              ...placement,
              paragraphs: paragraphs.length
                ? paragraphs
                : [officeParagraphSchema.parse({ kind: "paragraph", runs: [] })],
              vertical: vertical === "middle" ? "middle" : vertical === "bottom" ? "bottom" : "top",
              margins: {
                left: length(props("fo", "padding-left"), padding),
                right: length(props("fo", "padding-right"), padding),
                top: length(props("fo", "padding-top"), padding),
                bottom: length(props("fo", "padding-bottom"), padding),
              },
            });
          }
        }
      }
    }
    slides.push({ name, elements, background: fillMode === "none" ? "#ffffff" : background });
  }
  return presentationSchema.parse({ title, width, height, slides, warnings: [...warnings] });
}
