import type { EdiToolId } from "./edi-tools";

/**
 * Visual identity of the Edi suite ("bancada e marca-texto"): a worktop palette
 * plus one highlighter colour per tool. The portal and the Hub render the same
 * glyphs from this module; `scripts/edi/make-icons.ps1` mirrors the values to
 * draw the Windows icons, so change both together.
 */
export const EDI_PALETTE = {
  paper: "#F4F1EA",
  paperDeep: "#ECE8DE",
  card: "#FFFDF8",
  ink: "#1B1F24",
  pencil: "#585C64",
  line: "#DAD5C9",
  mat: "#1F242A",
  amber: "#F0B43C",
} as const;

/** Glyph primitives drawn in a 24×24 box with a 2px ink stroke. */
export type EdiGlyphShape =
  | { readonly kind: "path"; readonly d: string }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
    };

export type EdiToolBrand = {
  readonly color: string;
  readonly glyph: readonly EdiGlyphShape[];
};

export const EDI_TOOL_BRAND = {
  ediaula: {
    color: "#C8E64A",
    glyph: [
      { kind: "path", d: "M2 9.5 12 5l10 4.5L12 14z" },
      { kind: "path", d: "M6 11.5v4.2c0 1.5 2.7 3.3 6 3.3s6-1.8 6-3.3v-4.2" },
      { kind: "path", d: "M22 9.5v5" },
    ],
  },
  edicaptura: {
    color: "#5ED3B3",
    glyph: [
      { kind: "path", d: "M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3" },
      { kind: "path", d: "M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3" },
      { kind: "path", d: "M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3" },
      { kind: "path", d: "M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" },
      { kind: "circle", cx: 12, cy: 12, r: 2.8 },
    ],
  },
  edifoto: {
    color: "#FF8F7E",
    glyph: [
      { kind: "circle", cx: 9, cy: 12, r: 5.5 },
      { kind: "circle", cx: 15, cy: 12, r: 5.5 },
    ],
  },
  edipdf: {
    color: "#8CB6FF",
    glyph: [
      {
        kind: "path",
        d: "M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z",
      },
      { kind: "path", d: "M14 3v4h4" },
    ],
  },
  edisvg: {
    color: "#C2A5FF",
    glyph: [
      { kind: "path", d: "M5 18C5 9 19 9 19 18" },
      { kind: "rect", x: 3, y: 17, width: 4, height: 4, rx: 1 },
      { kind: "rect", x: 17, y: 17, width: 4, height: 4, rx: 1 },
      { kind: "path", d: "M5 17 7.3 7.5M19 17l-2.3-9.5" },
      { kind: "rect", x: 6, y: 4, width: 3, height: 3, rx: 0.8 },
      { kind: "rect", x: 15, y: 4, width: 3, height: 3, rx: 0.8 },
    ],
  },
} as const satisfies Record<EdiToolId, EdiToolBrand>;
