/**
 * Colour of the export. The composite is BT.709 in limited range, like every HD video the
 * browser, YouTube and the players read: picture sources are converted from their own matrix
 * (untagged ones count as BT.709), every RGBA layer goes to YUV with BT.709 before it is
 * overlaid, and the output is tagged so no player has to guess.
 */

/** Luma weights of BT.709. */
const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;

/** '#RRGGBB' in limited-range BT.709 YUV (Y 16..235, Cb and Cr 16..240). */
export function yuv709(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const y = KR * r + KG * g + KB * b;
  const cb = (b - y) / (2 * (1 - KB));
  const cr = (r - y) / (2 * (1 - KR));
  return [16 + 219 * y, 128 + 224 * cb, 128 + 224 * cr].map((v) => Math.round(v)) as [
    number,
    number,
    number,
  ];
}

/** swscale matrices the export reads sources with. */
export type SourceMatrix = "bt709" | "bt601" | "bt2020" | "fcc" | "smpte240m";
export type SourceRange = "tv" | "pc";

/**
 * The matrix of a source from FFprobe's color_space. Untagged or unknown sources are read as
 * BT.709 (screen recordings and cameras in HD); SD material marked BT.601 (or a recording the
 * recorder tagged smpte170m after measuring its encoder) is converted with its own matrix.
 */
export function sourceMatrix(colorSpace: string | undefined): SourceMatrix {
  switch (colorSpace) {
    case "smpte170m":
    case "bt470bg":
      return "bt601";
    case "bt2020nc":
    case "bt2020c":
      return "bt2020";
    case "fcc":
      return "fcc";
    case "smpte240m":
      return "smpte240m";
    default:
      return "bt709";
  }
}

/** Full range only when the source says so (yuvj formats and cameras tagged pc). */
export const sourceRange = (colorRange: string | undefined, pixFmt?: string): SourceRange =>
  colorRange === "pc" || /^yuvj/.test(pixFmt ?? "") ? "pc" : "tv";

/** An RGBA (or differently encoded YUVA) layer as BT.709 limited YUVA, ready for the overlay. */
export const TO_YUVA = "scale=out_color_matrix=bt709:out_range=tv,format=yuva420p";

/** Tags of the composite, before the burned captions (libass draws in the link's colour space). */
export const OUTPUT_PARAMS =
  "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv";

/** Output options that write the same tags in the file. */
export const OUTPUT_COLOR_ARGS = [
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_range",
  "tv",
];
