/**
 * Fonts for annotations, templates and burned captions: the ones bundled with EdiAula
 * (resources/fonts, static TTF so libass can burn them too) and the ones installed in Windows.
 */

export interface FontFamily {
  family: string;
  /** Shelf in the picker: "Infantil", "Títulos"… */
  group: string;
  files: { weight: number; file: string }[];
}

/**
 * The default for annotations and templates: Baloo 2, bundled in resources/fonts (since
 * 11/11/2026; before, the app's own Plus Jakarta Sans). An annotation without a font of its own
 * is drawn with it.
 */
export const DEFAULT_FONT = "Baloo 2";

/**
 * CSS / canvas font list: the chosen family, then the default and, while a bundled font is still
 * loading, the app's own typeface and a generic fallback.
 */
export function fontStack(family?: string): string {
  const main = family && family !== DEFAULT_FONT ? `"${family}", ` : "";
  return `${main}"${DEFAULT_FONT}", "Plus Jakarta Sans Variable", "Plus Jakarta Sans", sans-serif`;
}
