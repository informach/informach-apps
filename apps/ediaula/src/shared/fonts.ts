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

/** The default for annotations and templates (the app's own typeface). */
export const DEFAULT_FONT = "Plus Jakarta Sans";

/** CSS / canvas font list: the chosen family, then the default and a generic fallback. */
export function fontStack(family?: string): string {
  const main = family && family !== DEFAULT_FONT ? `"${family}", ` : "";
  return `${main}"Plus Jakarta Sans Variable", "Plus Jakarta Sans", sans-serif`;
}
