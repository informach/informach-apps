import { normalizeHex } from "@informach/edi-desktop/color";
import { create } from "zustand";

/**
 * Colors outside the palette: the eyedropper (any pixel on the screen) and the colors used last,
 * kept on this computer for every project.
 */

declare global {
  interface Window {
    EyeDropper?: new () => {
      open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
    };
  }
}

/** Upper-case `#RRGGBB`, or null for anything else. */
export const toHex = (value: string): string | null => normalizeHex(value)?.toUpperCase() ?? null;

export const canSampleScreen = (): boolean => typeof window.EyeDropper === "function";

/** Lets the user click any pixel on the screen; null when cancelled (Escape) or unavailable. */
export async function sampleScreen(signal?: AbortSignal): Promise<string | null> {
  if (!window.EyeDropper) return null;
  try {
    const picked = await new window.EyeDropper().open({ signal });
    return signal?.aborted ? null : toHex(picked.sRGBHex);
  } catch {
    return null;
  }
}

const RECENT_KEY = "ediaula.recentColors";
const RECENT_MAX = 10;

function readRecent(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list)
      ? list.flatMap((c) => (typeof c === "string" && toHex(c) ? [toHex(c) as string] : []))
      : [];
  } catch {
    return [];
  }
}

export const useRecentColors = create<{ list: string[]; remember(hex: string): void }>((set) => ({
  list: readRecent(),
  remember: (hex) =>
    set((s) => {
      const color = toHex(hex);
      if (!color) return s;
      const list = [color, ...s.list.filter((c) => c !== color)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      } catch {
        // Without storage the list still lasts until the app closes.
      }
      return { list };
    }),
}));
