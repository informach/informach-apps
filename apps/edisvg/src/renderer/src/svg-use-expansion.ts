const SVG = "http://www.w3.org/2000/svg",
  XLINK = "http://www.w3.org/1999/xlink",
  LOCAL = /^#([A-Za-z_][\w.-]{0,119})$/,
  NUMBER = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i,
  ASPECT = /^(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(meet|slice))?$/,
  METADATA = new Set(["title", "desc", "metadata"]),
  /** `symbol` attributes that only define its viewport; the rest is presentation for content. */
  VIEWPORT = new Set([
    "id",
    "viewBox",
    "preserveAspectRatio",
    "width",
    "height",
    "x",
    "y",
    "overflow",
  ]),
  MAX_ELEMENTS = 2000,
  MAX_DEPTH = 8;

export interface SvgUseExpansion {
  /** Display names for copies whose `id` was removed to keep identifiers unique. */
  names: WeakMap<Element, string>;
  uses: number;
  viewports: number;
  unusedSymbols: number;
}

function length(raw: string | null, label: string): number | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (value.length > 80 || !NUMBER.test(value))
    throw new Error(`${label} precisa de um número absoluto (sem porcentagem ou unidade).`);
  const number = Number(value.replace(/px$/i, ""));
  if (!Number.isFinite(number) || Math.abs(number) > 1e7)
    throw new Error(`${label} fora do limite numérico.`);
  return number;
}
const format = (value: number) => String(Number(value.toFixed(9)));

/** SVG 2 viewBox-to-viewport transform for a symbol drawn at (0,0,width,height). */
export function symbolViewportTransform(
  viewBox: readonly [number, number, number, number],
  width: number,
  height: number,
  aspect: string,
) {
  const match = ASPECT.exec(aspect.trim().replace(/\s+/g, " "));
  if (!match?.[1]) throw new Error("preserveAspectRatio de symbol fora do perfil suportado.");
  const [x, y, boxWidth, boxHeight] = viewBox;
  let sx = width / boxWidth,
    sy = height / boxHeight;
  const align = match[1];
  if (align !== "none") sx = sy = match[2] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
  let tx = -x * sx,
    ty = -y * sy;
  if (align.startsWith("xMid")) tx += (width - boxWidth * sx) / 2;
  if (align.startsWith("xMax")) tx += width - boxWidth * sx;
  if (align.endsWith("YMid")) ty += (height - boxHeight * sy) / 2;
  if (align.endsWith("YMax")) ty += height - boxHeight * sy;
  return `translate(${format(tx)} ${format(ty)}) scale(${format(sx)} ${format(sy)})`;
}

/** Rewrites local `<use>` references into ordinary groups before any catalog reads the SVG,
 * so the copies go through exactly the same validation as hand-written markup. Copies are
 * independent (editing one never changes another); a symbol viewport becomes a generated
 * rectangular clipPath, imported by the existing clip profile. Nothing is fetched. */
export function expandSvgUses(root: Element): SvgUseExpansion {
  const result: SvgUseExpansion = { names: new WeakMap(), uses: 0, viewports: 0, unusedSymbols: 0 };
  let found = false;
  (function scan(element: Element, depth: number) {
    if (depth > 64) throw new Error("SVG profundo demais para resolver referências use.");
    for (const child of element.children) {
      if (child.localName === "use" || child.localName === "symbol") found = true;
      scan(child, depth + 1);
    }
  })(root, 0);
  if (!found) return result;
  const document = root.ownerDocument,
    ids = new Map<string, Element>();
  for (const element of root.querySelectorAll("[id]")) {
    const id = element.getAttribute("id") ?? "";
    if (ids.has(id)) throw new Error("IDs SVG duplicados tornam as referências use ambíguas.");
    ids.set(id, element);
  }
  const used = new Set<Element>(),
    viewportClips = new Map<string, string>(),
    // Reference depth of every expanded group, carried into copies: uses are expanded in
    // place in document order, so the limit must not depend on which one ran first.
    depths = new WeakMap<Element, number>();
  const depthWithin = (element: Element) =>
    Math.max(
      depths.get(element) ?? 0,
      ...[...element.querySelectorAll("g")].map((group) => depths.get(group) ?? 0),
    );
  let created = 0,
    generated = 0,
    defs: Element | null = null;
  const reserve = (element: Element) => {
    created += 1 + element.querySelectorAll("*").length;
    if (created > MAX_ELEMENTS)
      throw new Error(
        `A expansão de use/symbol excede ${MAX_ELEMENTS} elementos; nenhuma arte foi importada.`,
      );
  };
  const copy = (source: Element) => {
    const clone = source.cloneNode(true);
    if (!(clone instanceof Element)) throw new Error("Cópia de referência use inválida.");
    const originals = [source, ...source.querySelectorAll("*")],
      copies = [clone, ...clone.querySelectorAll("*")];
    for (const [index, original] of originals.entries()) {
      const depth = depths.get(original),
        twin = copies[index];
      if (depth !== undefined && twin) depths.set(twin, depth);
    }
    for (const element of [clone, ...clone.querySelectorAll("[id]")]) {
      const id = element.getAttribute("id");
      if (!id) continue;
      result.names.set(element, id);
      element.removeAttribute("id");
    }
    reserve(clone);
    return clone;
  };
  const clipFor = (width: number, height: number) => {
    const key = `${format(width)} ${format(height)}`,
      existing = viewportClips.get(key);
    if (existing) return existing;
    let id = "";
    do id = `edi-symbol-viewport-${++generated}`;
    while (ids.has(id));
    if (!defs) {
      defs = document.createElementNS(SVG, "defs");
      root.append(defs);
    }
    const clip = document.createElementNS(SVG, "clipPath"),
      rect = document.createElementNS(SVG, "rect");
    clip.setAttribute("id", id);
    rect.setAttribute("width", format(width));
    rect.setAttribute("height", format(height));
    clip.append(rect);
    defs.append(clip);
    ids.set(id, clip);
    viewportClips.set(key, id);
    return id;
  };
  function symbolContent(symbol: Element, use: Element) {
    if (symbol.hasAttribute("style"))
      throw new Error("Estilo inline em symbol fora do perfil; use atributos de apresentação.");
    for (const name of ["x", "y"])
      if ((length(symbol.getAttribute(name), `${name} do symbol`) ?? 0) !== 0)
        throw new Error("Posição x/y em symbol fora do perfil; posicione pelo use.");
    const rawBox = symbol.getAttribute("viewBox"),
      box = rawBox
        ?.trim()
        .split(/[\s,]+/)
        .map((value) => length(value, "viewBox do symbol"));
    if (box && (box.length !== 4 || !((box[2] ?? 0) > 0 && (box[3] ?? 0) > 0)))
      throw new Error(
        "viewBox de symbol precisa de quatro números com largura e altura positivas.",
      );
    const width = length(use.getAttribute("width") ?? symbol.getAttribute("width"), "width"),
      height = length(use.getAttribute("height") ?? symbol.getAttribute("height"), "height"),
      overflow = symbol.getAttribute("overflow")?.trim() ?? "hidden";
    if (!["hidden", "visible", "auto", "scroll"].includes(overflow))
      throw new Error("overflow de symbol fora do perfil suportado.");
    const visible = overflow === "visible" || overflow === "auto";
    if ((box || !visible) && (width === null || height === null))
      throw new Error(
        "Symbol com viewBox ou com overflow oculto requer width e height numéricos no use ou no symbol.",
      );
    if ((width !== null && width <= 0) || (height !== null && height <= 0)) return null; // A zero-sized viewport renders nothing in SVG.
    const content = document.createElementNS(SVG, "g"),
      symbolId = symbol.getAttribute("id") ?? "symbol";
    result.names.set(content, `Símbolo ${symbolId}`);
    for (const attribute of [...symbol.attributes])
      if (!VIEWPORT.has(attribute.name) && !attribute.name.startsWith("xmlns"))
        content.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    if (box && width !== null && height !== null)
      content.setAttribute(
        "transform",
        symbolViewportTransform(
          box as [number, number, number, number],
          width,
          height,
          symbol.getAttribute("preserveAspectRatio") ?? "xMidYMid meet",
        ),
      );
    for (const child of symbol.children)
      if (!METADATA.has(child.localName)) content.append(copy(child));
    if (visible || width === null || height === null) return content;
    const viewport = document.createElementNS(SVG, "g");
    result.names.set(viewport, `Viewport de ${symbolId}`);
    viewport.setAttribute("clip-path", `url(#${clipFor(width, height)})`);
    viewport.append(content);
    result.viewports++;
    return viewport;
  }
  function expand(use: Element, chain: readonly Element[]) {
    if (use.hasAttribute("href") && use.hasAttributeNS(XLINK, "href"))
      throw new Error("use com href e xlink:href ao mesmo tempo é ambíguo.");
    const href = (use.getAttribute("href") ?? use.getAttributeNS(XLINK, "href") ?? "").trim(),
      id = LOCAL.exec(href)?.[1];
    if (!id)
      throw new Error(
        "use aceita somente referência local #id; arquivos e URLs externos são recusados.",
      );
    const target = ids.get(id);
    if (!target) throw new Error(`Referência use ausente: #${id}.`);
    if (chain.includes(target) || target === use || target.contains(use))
      throw new Error(`Referência use circular em #${id}.`);
    if (target.localName === "svg") throw new Error("use de outro svg aninhado fora do perfil.");
    used.add(target);
    const depth = Math.max(chain.length, depthWithin(target)) + 1;
    if (depth > MAX_DEPTH)
      throw new Error(`Referências use aninhadas excedem ${MAX_DEPTH} níveis.`);
    const x = length(use.getAttribute("x"), "x do use") ?? 0,
      y = length(use.getAttribute("y"), "y do use") ?? 0,
      wrapper = document.createElementNS(SVG, "g");
    // Geometry and the reference itself are consumed here; every other attribute (presentation,
    // transform, semantics, clip/mask) moves to the group and is validated by the importer.
    for (const attribute of [...use.attributes])
      if (!["x", "y", "width", "height", "href"].includes(attribute.localName))
        wrapper.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    // SVG 2: x/y add a translation after the use element's own transform.
    const transform = [
      use.getAttribute("transform")?.trim(),
      x || y ? `translate(${format(x)} ${format(y)})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (transform) wrapper.setAttribute("transform", transform);
    if (!wrapper.hasAttribute("id")) result.names.set(wrapper, `Uso de ${id}`);
    for (const child of [...use.children]) {
      if (!METADATA.has(child.localName))
        throw new Error("use aceita apenas title, desc e metadata como filhos.");
      wrapper.append(child);
    }
    const content = target.localName === "symbol" ? symbolContent(target, use) : copy(target);
    if (content) wrapper.append(content);
    depths.set(wrapper, depth);
    use.replaceWith(wrapper);
    result.uses++;
    for (const inner of [...wrapper.querySelectorAll("use")]) expand(inner, [...chain, target]);
  }
  for (const use of [...root.querySelectorAll("use")]) if (use.isConnected) expand(use, []);
  for (const symbol of [...root.querySelectorAll("symbol")]) {
    if (!used.has(symbol)) result.unusedSymbols++;
    symbol.remove();
  }
  return result;
}
