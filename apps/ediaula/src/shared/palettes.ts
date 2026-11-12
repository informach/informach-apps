import type { Annotation } from "./annotation.ts";
import type { Transform } from "./compose.ts";

/**
 * Color palettes: a brand's colors with names, plus the role each one plays (dark background,
 * main accent, alert…). New annotations and templates take their colors from the roles of the
 * project's palette, and switching palettes recolors what is already there role by role.
 */

export const ROLES = [
  "dark",
  "light",
  "ink",
  "accent",
  "highlight",
  "primary",
  "success",
  "alert",
  "creative",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, { label: string; hint: string }> = {
  dark: { label: "Fundo escuro", hint: "Cartelas, fundos de template, faixa de nome" },
  light: { label: "Claro", hint: "Texto sobre o escuro, contornos claros" },
  ink: { label: "Tinta", hint: "Texto sobre cores claras" },
  accent: { label: "Destaque", hint: "Notas, passos, curso, palavra da legenda" },
  highlight: { label: "Atenção", hint: "Destaques, selo de pergunta" },
  primary: { label: "Principal", hint: "Ação, alternativas" },
  success: { label: "Sucesso", hint: "Certo, concluído" },
  alert: { label: "Alerta", hint: "Setas, desafio, erro" },
  creative: { label: "Criativo", hint: "Cor extra" },
};

export interface PaletteColor {
  /** Stable identity; older palettes are assigned IDs when loaded into the editor. */
  id?: string;
  hex: string;
  name: string;
  note?: string;
}

export interface Palette {
  id: string;
  name: string;
  colors: PaletteColor[];
  roles: Record<Role, string>;
  /** The theme's typefaces: titles (title, card, step) and running text (balloons, notes, labels, captions). */
  fonts?: { heading?: string; body?: string };
  /** Light page behind the template slides and the softer text on it (absent: made from the roles). */
  page?: string;
  muted?: string;
  /** Comes with EdiAula (read-only: duplicate it to change). */
  builtIn?: boolean;
}

export function identifyPaletteColors(palette: Palette): Palette {
  const used = new Set<string>();
  return {
    ...palette,
    colors: palette.colors.map((color) => {
      const id = color.id && !used.has(color.id) ? color.id : crypto.randomUUID();
      used.add(id);
      return { ...color, id };
    }),
  };
}

export const EDIAULA_PALETTE: Palette = {
  id: "ediaula",
  name: "EdiAula",
  builtIn: true,
  colors: [
    { hex: "#C8F031", name: "Limão" },
    { hex: "#FFD60A", name: "Amarelo" },
    { hex: "#FF4D4D", name: "Vermelho" },
    { hex: "#3D6BFF", name: "Azul" },
    { hex: "#9B7BFF", name: "Violeta" },
    { hex: "#2FBF71", name: "Verde" },
    { hex: "#FFFFFF", name: "Branco" },
    { hex: "#12140A", name: "Grafite" },
  ],
  roles: {
    dark: "#12140A",
    light: "#FFFFFF",
    ink: "#12140A",
    accent: "#C8F031",
    highlight: "#FFD60A",
    primary: "#3D6BFF",
    success: "#2FBF71",
    alert: "#FF4D4D",
    creative: "#9B7BFF",
  },
};

export const SISTEMA_ZERO_PALETTE: Palette = {
  id: "sistema-zero",
  name: "Sistema Zero",
  builtIn: true,
  colors: [
    { hex: "#E9EEF6", name: "Fundo", note: "Chão único da página" },
    { hex: "#DDE5F0", name: "Fundo alt.", note: "Só a última faixa" },
    { hex: "#FFFFFF", name: "Superfície", note: "Cards" },
    { hex: "#121A30", name: "Âncora escura", note: "Sidebar, hero, viewport" },
    { hex: "#0F1A33", name: "Tinta", note: "Títulos e corpo" },
    { hex: "#46536E", name: "Tinta suave", note: "7,7:1 no branco" },
    { hex: "#1B5CF3", name: "Azul", note: "Ação primária e “você está aqui” · Estúdio (jogos)" },
    { hex: "#6E9BFF", name: "Azul claro", note: "Só sobre fundo escuro" },
    { hex: "#FFC02E", name: "XP e recompensa", note: "Nunca com texto branco" },
    { hex: "#0B7A54", name: "Sucesso", note: "Concluído, aprovado, salvo" },
    { hex: "#D92D34", name: "Alerta", note: "Apagar, erro, perder vida" },
    { hex: "#6D3BF5", name: "Criativo", note: "Publicar, remixar, criar · Molda (3D)" },
    { hex: "#CF3F36", name: "Pinta", note: "Oficina de desenho 2D" },
    { hex: "#E8A317", name: "Pensa", note: "Oficina de planos · glifo em tinta" },
  ],
  roles: {
    dark: "#121A30",
    light: "#FFFFFF",
    ink: "#0F1A33",
    accent: "#FFC02E",
    highlight: "#E8A317",
    primary: "#1B5CF3",
    success: "#0B7A54",
    alert: "#D92D34",
    creative: "#6D3BF5",
  },
  fonts: { heading: "Baloo 2", body: "Nunito" },
  page: "#E9EEF6",
  muted: "#46536E",
};

export const BUILT_IN_PALETTES = [EDIAULA_PALETTE, SISTEMA_ZERO_PALETTE];

/** `a` moved `t` of the way to `b` (both #RRGGBB). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", "").slice(0, 6), 16);
  const pb = parseInt(b.replace("#", "").slice(0, 6), 16);
  const ch = (v: number, shift: number): number => (v >> shift) & 255;
  const part = (shift: number): string =>
    Math.round(ch(pa, shift) + (ch(pb, shift) - ch(pa, shift)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${part(16)}${part(8)}${part(0)}`.toUpperCase();
}

/**
 * The colors of the template slides besides the roles: the light page, the softer text on it and
 * a pale tint of the accent (the "pause and think" slide).
 */
export interface SlideColors {
  page: string;
  muted: string;
  soft: string;
}

export function slideColors(p: Palette): SlideColors {
  return {
    page: (p.page ?? mixHex(p.roles.light, p.roles.primary, 0.08)).toUpperCase(),
    muted: (p.muted ?? mixHex(p.roles.ink, p.roles.light, 0.3)).toUpperCase(),
    soft: mixHex(p.roles.light, p.roles.accent, 0.28),
  };
}

const luminance = (hex: string): number => {
  const v = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const lin = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
};

/** Contrast between two colors (WCAG, 1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `text` on `bg` when big bold letters can be read on it (contrast 3), else the palette's ink or light. */
export function readableOn(text: string, bg: string, p: Palette): string {
  return contrast(text, bg) >= 3 ? text : textOn(bg, p);
}

const norm = (hex: string): string => hex.toUpperCase();

/** Distinct colors of a palette, in order (roles first when they are not listed). */
export function paletteSwatches(p: Palette): PaletteColor[] {
  const seen = new Set<string>();
  const out: PaletteColor[] = [];
  for (const c of [
    ...p.colors,
    ...ROLES.map((r) => ({ hex: p.roles[r], name: ROLE_LABEL[r].label })),
  ]) {
    const h = norm(c.hex);
    if (seen.has(h)) continue;
    seen.add(h);
    out.push({ ...c, hex: h });
  }
  return out;
}

/**
 * Maps colors from the palettes a project used before to the same roles in `to`. A color that
 * plays no role in those palettes stays as it is (a color picked by hand).
 */
export function colorMapper(
  from: Palette[],
  to: Palette,
): (hex: string | undefined) => string | undefined {
  const map = new Map<string, string>();
  // Later palettes win: the project's current palette over EdiAula's defaults. `ink` and `dark`
  // are often the same color; dark wins because backgrounds are what it is most used for.
  const order: Role[] = [
    "creative",
    "success",
    "primary",
    "highlight",
    "alert",
    "accent",
    "light",
    "ink",
    "dark",
  ];
  const toSlides = slideColors(to);
  for (const p of from) {
    const fromSlides = slideColors(p);
    for (const k of ["soft", "muted", "page"] as const) map.set(fromSlides[k], toSlides[k]);
    for (const r of order) map.set(norm(p.roles[r]), to.roles[r]);
  }
  return (hex) => (hex ? (map.get(norm(hex)) ?? hex) : hex);
}

/** The same annotation in another palette (main color, outline, fill, shadow, text and accent). */
export function recolorAnnotation(
  a: Annotation,
  map: (hex: string | undefined) => string | undefined,
  to: Palette,
): Annotation {
  return {
    ...a,
    color: map(a.color)!,
    ...(a.outline ? { outline: { ...a.outline, color: map(a.outline.color)! } } : {}),
    ...(a.fill ? { fill: map(a.fill) } : {}),
    ...(a.shadow ? { shadow: { ...a.shadow, color: map(a.shadow.color)! } } : {}),
    ...(a.textColor ? { textColor: map(a.textColor) } : {}),
    ink: to.roles.ink,
    ...(a.kind === "card" ? { accent: to.roles.accent } : {}),
    ...(a.kind === "item" && a.accent ? { accent: map(a.accent) } : {}),
  };
}

export function recolorTransform(
  t: Transform,
  map: (hex: string | undefined) => string | undefined,
): Transform {
  return {
    ...t,
    ...(t.border ? { border: map(t.border) } : {}),
    ...(t.shadow ? { shadow: { ...t.shadow, color: map(t.shadow.color)! } } : {}),
  };
}

/** A new annotation's colors in the project's palette (presets are written in EdiAula's). */
export function inPalette(a: Annotation, to: Palette): Annotation {
  if (to.id === EDIAULA_PALETTE.id) return a;
  return recolorAnnotation(a, colorMapper([EDIAULA_PALETTE], to), to);
}

/** Readable text on a background: the palette's ink on light colors, its light color on dark ones. */
export function textOn(bg: string, p: Palette): string {
  const v = parseInt(bg.replace("#", "").slice(0, 6), 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 150
    ? p.roles.ink
    : p.roles.light;
}

/** Kinds that carry text, and which of the theme's fonts each one takes. */
const TEXT_KINDS = new Set<Annotation["kind"]>([
  "balloon",
  "note",
  "label",
  "title",
  "step",
  "card",
  "lowerthird",
  "box",
  "item",
]);
const HEADING_KINDS = new Set<Annotation["kind"]>(["title", "card", "step", "box", "item"]);

type FontSubject = Annotation["kind"] | Pick<Annotation, "kind" | "textRole">;

/** Which of the theme's fonts an annotation (or a kind) takes: its own choice, else its kind's. */
export const fontRole = (a: FontSubject): "heading" | "body" => {
  const { kind, textRole } = typeof a === "string" ? { kind: a, textRole: undefined } : a;
  return textRole ?? (HEADING_KINDS.has(kind) ? "heading" : "body");
};

/** The theme's font for an annotation kind (undefined: the kind has no text or the theme sets none). */
export function themeFont(a: FontSubject, p: Palette): string | undefined {
  const kind = typeof a === "string" ? a : a.kind;
  return TEXT_KINDS.has(kind) ? p.fonts?.[fontRole(a)] : undefined;
}

/** Every font some theme assigns: those are replaced when themes change; others were picked by hand. */
export function themeFontSet(palettes: Palette[]): Set<string> {
  return new Set(
    palettes.flatMap((p) => [p.fonts?.heading, p.fonts?.body]).filter((f): f is string => !!f),
  );
}

/**
 * An annotation in the theme's fonts (`to`), or back to the default font (`to` = null). Fonts picked
 * by hand, outside every theme, stay.
 */
export function refont(a: Annotation, to: Palette | null, themed: Set<string>): Annotation {
  if (!TEXT_KINDS.has(a.kind) || (a.fontFamily && !themed.has(a.fontFamily))) return a;
  const font = to ? themeFont(a, to) : undefined;
  const { fontFamily: _old, bodyFont: _body, ...rest } = a;
  // An item's line below takes the text font, unless it was picked by hand.
  const body =
    a.kind === "item" && (!a.bodyFont || themed.has(a.bodyFont)) ? to?.fonts?.body : a.bodyFont;
  return {
    ...rest,
    ...(font ? { fontFamily: font } : {}),
    ...(body ? { bodyFont: body } : {}),
  };
}
