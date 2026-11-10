import { type DesignKit, KIT_PREFIX } from "../../shared/designKit";
import { type BundledFamily, nearestWeight } from "../../shared/pipelines";
import { type ImportedScene, paletteOf } from "./szProjectImport";

/**
 * Arquivo › Importar kit de design: a kit's pieces as artboards of the project, each usable as a
 * component (an instance of its artboard), in one edit. An SVG is imported as Importar SVG does;
 * a PNG becomes an image resource and an artboard of its size showing it. The texts of the SVGs
 * take the fonts they name when EdiSVG has them (EdiAula's bundle, as the pipelines' fonts), in
 * the nearest weight; the kit's colours (its palette sheet, or the colours its pieces use most)
 * go to the palette of every kit artboard and of the one open.
 */

export interface NamedColor {
  name: string;
  color: string;
}

export interface KitBoard {
  path: string;
  name: string;
  scene: ImportedScene;
}

export interface KitImage {
  path: string;
  /** The artboard's name; the resource is named after the file. */
  name: string;
  file: string;
  png: Uint8Array;
}

export interface KitPlan {
  name: string;
  /** The SVGs, the palette sheet first, then by folder and name. */
  boards: KitBoard[];
  images: KitImage[];
  /** From the palette sheet when the kit has one (with its names), else the most used. */
  palette: NamedColor[];
  /** Whether the palette came from a sheet of the kit (else from the pieces). */
  sheet: string | null;
  left: string[];
}

/** Colours the kit's pieces give when it has no palette sheet. */
const PIECES_PALETTE = 12;
/** A palette holds 64 colours (appearanceContracts.ts). */
export const PALETTE_MAX = 64;

const NAME_MAX = 120;
const stem = (path: string): string => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
/** "baloes/balao-dica.svg" → "Kit · baloes · balao-dica" (an artboard name has 120 at most). */
export function kitBoardName(path: string): string {
  const parts = path.split("/");
  parts[parts.length - 1] = stem(path);
  return `${KIT_PREFIX}${parts.join(" · ")}`.slice(0, NAME_MAX);
}

/** The palette sheet of a kit: an SVG named paleta…, palette…, cores… or colors…. */
export const isPaletteSheet = (path: string): boolean =>
  /^(paleta|palette|cores|colou?rs)\b[^/]*\.svg$/i.test(path.split("/").pop() ?? "");

const HEX = /^#[0-9a-f]{6}$/i;
function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (HEX.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join("")}`;
  return null;
}

interface SceneNode {
  tag?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  children?: SceneNode[];
  fontAssetId?: string;
}

function* walk(nodes: readonly unknown[]): Generator<SceneNode> {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    yield node as SceneNode;
    yield* walk((node as SceneNode).children ?? []);
  }
}

/**
 * The named colours of a palette sheet: each colour written as a text ("#1b5cf3") with the text
 * before it as its name, as a kit's sheet labels its swatches. A sheet without those texts gives
 * the fills of its shapes, in order.
 */
export function sheetColors(scene: ImportedScene): NamedColor[] {
  const out: NamedColor[] = [];
  const seen = new Set<string>();
  let label = "";
  for (const node of walk(scene.nodes)) {
    if (node.tag !== "text") continue;
    const text = (node.text ?? "").trim();
    const color = hexColor(text);
    if (!color) {
      label = text;
      continue;
    }
    if (!seen.has(color)) {
      seen.add(color);
      out.push({ name: label.slice(0, 60) || color, color });
    }
    label = "";
  }
  if (out.length) return out;
  for (const node of walk(scene.nodes)) {
    if (node.tag === "text") continue;
    const color = hexColor(node.attrs?.fill);
    if (color && !seen.has(color)) {
      seen.add(color);
      out.push({ name: color, color });
    }
  }
  return out;
}

/**
 * Plans the import: every SVG an artboard (one that cannot be imported is left out, with the
 * import's reason), every PNG an image to become a resource and an artboard. `toScene` is the SVG
 * import (svgImport.js importSvg), passed in so the plan is tested without a DOM.
 */
export function planDesignKit(kit: DesignKit, toScene: (svg: string) => ImportedScene): KitPlan {
  const byPath = (a: { path: string }, b: { path: string }) =>
    a.path.localeCompare(b.path, "pt-BR", { numeric: true });
  const files = [...kit.files].sort(byPath);
  const boards: KitBoard[] = [];
  const images: KitImage[] = [];
  const left = [...kit.left];
  let palette: NamedColor[] = [];
  let sheet: string | null = null;
  for (const file of files) {
    if ("png" in file) {
      images.push({
        path: file.path,
        name: kitBoardName(file.path),
        file: stem(file.path).slice(0, NAME_MAX) || "Imagem",
        png: file.png,
      });
      continue;
    }
    let scene: ImportedScene;
    try {
      scene = toScene(file.svg);
    } catch (error) {
      left.push(
        `${file.path} (${error instanceof Error && error.name === "SvgImportError" ? error.message : "SVG incompatível"})`,
      );
      continue;
    }
    const board = { path: file.path, name: kitBoardName(file.path), scene };
    if (!sheet && isPaletteSheet(file.path)) {
      const colors = sheetColors(scene);
      if (colors.length) {
        sheet = file.path;
        palette = colors.slice(0, PALETTE_MAX);
        boards.unshift(board);
        continue;
      }
    }
    boards.push(board);
  }
  if (!sheet)
    palette = paletteOf(
      boards.map((b) => b.scene),
      PIECES_PALETTE,
    ).map((color) => ({ name: color, color }));
  if (!boards.length && !images.length)
    throw new Error(
      `Nenhum arquivo do kit pôde ser importado. ${left.length ? `Ficaram de fora: ${left.join("; ")}.` : ""}`.trim(),
    );
  return { name: kit.name, boards, images, palette, sheet, left };
}

/** The kit's top folder of a path ("" for a file at the kit's root). */
export const folderOf = (path: string): string =>
  path.includes("/") ? (path.split("/")[0] ?? "") : "";

export interface KitGroup {
  folder: string;
  /** Artboards the folder makes (its SVGs and PNGs). */
  count: number;
  /** The first names, to recognise it. */
  sample: string[];
}

/** The kit by top folder: its root first, then the folders by name. */
export function kitGroups(plan: KitPlan): KitGroup[] {
  const groups = new Map<string, KitGroup>();
  for (const item of [...plan.boards, ...plan.images].sort((a, b) =>
    a.path.localeCompare(b.path, "pt-BR", { numeric: true }),
  )) {
    const folder = folderOf(item.path);
    const group = groups.get(folder) ?? { folder, count: 0, sample: [] };
    group.count++;
    if (group.sample.length < 3) group.sample.push(stem(item.path));
    groups.set(folder, group);
  }
  // The kit's root (the palette sheet, a logo) first, then the folders by name.
  return [...groups.values()].sort((a, b) =>
    a.folder === b.folder
      ? 0
      : !a.folder
        ? -1
        : !b.folder
          ? 1
          : a.folder.localeCompare(b.folder, "pt-BR", { numeric: true }),
  );
}

/**
 * The folders checked when the dialog opens: all of them when they fit in the project's `room`
 * (a project holds 100 artboards), else the largest left out first until the rest fits.
 */
export function defaultFolders(groups: readonly KitGroup[], room: number): Set<string> {
  const chosen = new Set(groups.map((g) => g.folder));
  let total = groups.reduce((sum, g) => sum + g.count, 0);
  for (const group of [...groups].sort((a, b) => b.count - a.count)) {
    if (total <= room) break;
    chosen.delete(group.folder);
    total -= group.count;
  }
  return chosen;
}

/** The plan with only the chosen folders' pieces (the palette stays the kit's). */
export function choosePlan(plan: KitPlan, folders: ReadonlySet<string>): KitPlan {
  const kept = (item: { path: string }) => folders.has(folderOf(item.path));
  return { ...plan, boards: plan.boards.filter(kept), images: plan.images.filter(kept) };
}

/** An artboard of the image's size showing it whole, as Recursos › Inserir places an image. */
export function imageScene(asset: {
  id: string;
  name: string;
  width: number;
  height: number;
}): ImportedScene {
  return {
    viewBox: [0, 0, asset.width, asset.height],
    nodes: [
      {
        id: `node-${crypto.randomUUID()}`,
        name: asset.name,
        tag: "image",
        assetId: asset.id,
        attrs: { x: "0", y: "0", width: String(asset.width), height: String(asset.height) },
        text: "",
        children: [],
        transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
        visible: true,
        locked: false,
      },
    ],
  };
}

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "inherit",
]);

/** The families of a font-family value, without quotes and generic names, in order. */
export function fontFamilies(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^(['"])(.*)\1$/, "$2")
        .trim(),
    )
    .filter((family) => family && !GENERIC.has(family.toLowerCase()));
}

function weightOf(value: unknown, inherited: number): number {
  if (typeof value !== "string" && typeof value !== "number") return inherited;
  const text = String(value).trim().toLowerCase();
  if (text === "normal") return 400;
  if (text === "bold") return 700;
  const n = Number(text);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : inherited;
}

interface KitText {
  node: SceneNode;
  families: string[];
  weight: number;
}

/** The texts of a scene with the font they ask for (family and weight inherited from groups). */
function textsOf(scene: ImportedScene): KitText[] {
  const out: KitText[] = [];
  const visit = (nodes: readonly unknown[], families: string[], weight: number) => {
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object") continue;
      const node = raw as SceneNode;
      const own = fontFamilies(node.attrs?.["font-family"]);
      const stack = own.length ? own : families;
      const w = weightOf(node.attrs?.["font-weight"], weight);
      if (node.tag === "text") out.push({ node, families: stack, weight: w });
      visit(node.children ?? [], stack, w);
    }
  };
  visit(scene.nodes, [], 400);
  return out;
}

/** The family of the bundle a text uses: the first of its stack that EdiSVG has. */
function bundledOf(text: KitText, families: readonly BundledFamily[]): BundledFamily | null {
  for (const name of text.families) {
    const found = families.find((f) => f.family.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return null;
}

export interface KitFontNeeds {
  /** Each font file to embed, once. */
  wanted: { family: string; weight: number }[];
  /** Families texts ask for that EdiSVG does not have (they keep the system's font). */
  missing: string[];
}

export function kitFonts(
  scenes: readonly ImportedScene[],
  families: readonly BundledFamily[],
): KitFontNeeds {
  const wanted = new Map<string, { family: string; weight: number }>();
  const missing = new Set<string>();
  for (const scene of scenes)
    for (const text of textsOf(scene)) {
      const family = bundledOf(text, families);
      if (!family) {
        if (text.families[0]) missing.add(text.families[0]);
        continue;
      }
      const weight = nearestWeight(family.weights, text.weight);
      wanted.set(`${family.family}|${weight}`, { family: family.family, weight });
    }
  return { wanted: [...wanted.values()], missing: [...missing] };
}

/**
 * Points each text at the embedded font of its family and weight, as set-font does; returns how
 * many texts took one. `embedded` holds the fonts kitFonts asked for.
 */
export function setKitFonts(
  scenes: readonly ImportedScene[],
  families: readonly BundledFamily[],
  embedded: readonly { family: string; weight: number; assetId: string; italic: boolean }[],
): number {
  let count = 0;
  for (const scene of scenes)
    for (const text of textsOf(scene)) {
      const family = bundledOf(text, families);
      if (!family) continue;
      const weight = nearestWeight(family.weights, text.weight);
      const font = embedded.find((f) => f.family === family.family && f.weight === weight);
      if (!font) continue;
      text.node.fontAssetId = font.assetId;
      const attrs = text.node.attrs ?? {};
      attrs["font-weight"] = String(font.weight);
      attrs["font-style"] = font.italic ? "italic" : "normal";
      text.node.attrs = attrs;
      count++;
    }
  return count;
}

/** The palette of the open artboard with the kit's colours after its own (no repeats, 64 at most). */
export function mergedPalette(own: readonly string[], kit: readonly NamedColor[]): string[] {
  return [...new Set([...own, ...kit.map((c) => c.color)].map((c) => c.toLowerCase()))].slice(
    0,
    PALETTE_MAX,
  );
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function kitSummary(facts: {
  name: string;
  svgs: number;
  images: number;
  palette: NamedColor[];
  sheet: string | null;
  fonts: string[];
  texts: number;
  missingFonts: string[];
  normalized: number;
  left: string[];
}): string {
  const lines = [
    `Kit "${facts.name}" importado: ${facts.svgs + facts.images} pranchetas "${KIT_PREFIX}…" (${facts.svgs} SVG, ${facts.images} PNG), prontas para usar como componentes.`,
  ];
  if (facts.palette.length)
    lines.push(
      facts.sheet
        ? `${plural(facts.palette.length, "cor", "cores")} de ${facts.sheet} na paleta.`
        : `${plural(facts.palette.length, "cor mais usada", "cores mais usadas")} do kit na paleta.`,
    );
  if (facts.fonts.length)
    lines.push(`Fontes incorporadas: ${facts.fonts.join(", ")} (${facts.texts} textos).`);
  if (facts.missingFonts.length)
    lines.push(
      `Sem estas fontes no EdiSVG, os textos usam a do sistema: ${facts.missingFonts.join(", ")}.`,
    );
  if (facts.normalized)
    lines.push(
      `${plural(facts.normalized, "PNG convertido", "PNG convertidos")} para sRGB de 8 bits (perfis de cor e metadados removidos).`,
    );
  if (facts.left.length) lines.push(`Ficaram de fora: ${facts.left.join("; ")}.`);
  lines.push("Ctrl+Z desfaz tudo.");
  return lines.join(" ");
}
