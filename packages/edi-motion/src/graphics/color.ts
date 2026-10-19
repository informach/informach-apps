const basic: Readonly<Record<string, string>> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  lime: "#00ff00",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  purple: "#800080",
  olive: "#808000",
  navy: "#000080",
  teal: "#008080",
};
/** Closed solid-color conversion, independent of CSS/DOM, shared by SVG
 * gradient import and format converters. No currentColor, variables or URLs. */
export function parseSolidSvgColor(raw: string): { color: string; alpha: number } {
  if (typeof raw !== "string" || raw.length > 500)
    throw new Error("Cor sólida SVG inválida/excessiva.");
  const value = raw.trim().toLowerCase(),
    named = Object.hasOwn(basic, value) ? basic[value] : undefined;
  if (value === "transparent") return { color: "#000000", alpha: 0 };
  if (named) return { color: named, alpha: 1 };
  if (/^#[\da-f]{3,4}$/.test(value)) {
    const expanded = [...value.slice(1)].map((char) => char + char).join("");
    return {
      color: `#${expanded.slice(0, 6)}`,
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1,
    };
  }
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/.test(value))
    return {
      color: value.slice(0, 7),
      alpha: value.length === 9 ? Number.parseInt(value.slice(7), 16) / 255 : 1,
    };
  const rgb =
    /^rgb(a)?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if (rgb && !!rgb[1] === (rgb[5] !== undefined)) {
    const channels = [Number(rgb[2]), Number(rgb[3]), Number(rgb[4])],
      alpha = rgb[5] === undefined ? 1 : Number(rgb[5]);
    if (
      channels.every((channel) => channel >= 0 && channel <= 255) &&
      Number.isFinite(alpha) &&
      alpha >= 0 &&
      alpha <= 1
    )
      return {
        color: `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
        // Match legacy sRGB CSS parsing before multiplying fill/stroke alpha.
        // Chromium's ColorFunctionParser quantizes this channel to 8 bits;
        // keeping an arbitrary float changes composited SVG/Lottie colors.
        alpha: Math.round(alpha * 255) / 255,
      };
  }
  throw new Error(
    "Cor não suportada: use hexadecimal, rgb/rgba numérico ou nome básico, sem currentColor/variáveis/CSS externo.",
  );
}
