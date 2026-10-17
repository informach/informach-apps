import { DEFAULT_FONT, type FontFamily } from "@shared/fonts";
import { useEffect, useState } from "react";
import { mediaUrl } from "./media";

/**
 * Bundled fonts are registered once from resources/fonts (the same TTF files libass burns
 * captions with); fonts installed in Windows come from the Local Font Access API.
 */

let bundled: Promise<FontFamily[]> | null = null;

export function loadBundledFonts(): Promise<FontFamily[]> {
  bundled ??= window.api.appInfo().then(({ fonts, fontsDir }) => {
    for (const f of fonts)
      for (const file of f.files) {
        const face = new FontFace(f.family, `url("${mediaUrl(`${fontsDir}\\${file.file}`)}")`, {
          weight: String(file.weight),
        });
        document.fonts.add(face);
      }
    return fonts;
  });
  return bundled;
}

let system: Promise<string[]> | null = null;

interface LocalFont {
  family: string;
}

/** Families installed in Windows (empty if the API is not available). */
export function systemFonts(): Promise<string[]> {
  system ??= (async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> })
      .queryLocalFonts;
    if (!query) return [];
    try {
      const fonts = await query();
      return [...new Set(fonts.map((f) => f.family))]
        .filter((f) => f && !f.startsWith("@"))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    } catch {
      return [];
    }
  })();
  return system;
}

/** Waits until the family can draw at the given weights (canvas text does not wait by itself). */
export async function ensureFont(
  family: string | undefined,
  weights = [400, 600, 700, 800],
): Promise<void> {
  if (!family || family === DEFAULT_FONT) return;
  await loadBundledFonts();
  await Promise.all(
    weights.map((w) => document.fonts.load(`${w} 40px "${family}"`).catch(() => undefined)),
  );
}

export function useFonts(): { bundled: FontFamily[]; system: string[] } {
  const [state, setState] = useState<{ bundled: FontFamily[]; system: string[] }>({
    bundled: [],
    system: [],
  });
  useEffect(() => {
    let alive = true;
    void Promise.all([loadBundledFonts(), systemFonts()]).then(([b, s]) => {
      const names = new Set(b.map((f) => f.family));
      if (alive) setState({ bundled: b, system: s.filter((f) => !names.has(f)) });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
