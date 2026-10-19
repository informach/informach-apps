import type { WidgetFont } from "@shared/widget-font";
import { acquireLocalFont } from "../lib/local-font-face";

export interface WidgetTypography {
  style: React.CSSProperties;
  warning?: string;
}
/** Prepare one font lease per program before publishing a page's interactive fields. */
export async function prepareWidgetTypography(
  fonts: (WidgetFont | undefined)[],
  signal: AbortSignal,
): Promise<{ values: Map<WidgetFont | undefined, WidgetTypography>; release(): void }> {
  const values = new Map<WidgetFont | undefined, WidgetTypography>(),
    programs = new Map<Uint8Array, WidgetTypography>(),
    releases: (() => void)[] = [];
  const release = () => {
    for (const end of releases.splice(0)) end();
  };
  try {
    for (const font of fonts) {
      signal.throwIfAborted();
      if (values.has(font)) continue;
      if (font?.kind === "builtin") {
        values.set(font, {
          style: {
            fontFamily:
              font.family === "monospace"
                ? '"Courier New", monospace'
                : font.family === "serif"
                  ? '"Times New Roman", serif'
                  : "Arial, sans-serif",
            fontWeight: font.bold ? 700 : 400,
            fontStyle: font.italic ? "italic" : "normal",
          },
        });
      } else if (font?.kind === "truetype") {
        let prepared = programs.get(font.bytes);
        if (!prepared) {
          try {
            const lease = await acquireLocalFont(font.bytes, signal);
            releases.push(lease.release);
            signal.throwIfAborted();
            prepared = { style: { fontFamily: lease.family, fontSynthesis: "none" } };
          } catch (failure) {
            signal.throwIfAborted();
            prepared = {
              style: { fontSynthesis: "none" },
              warning: failure instanceof Error ? failure.message : "Fonte de campo indisponível.",
            };
          }
          programs.set(font.bytes, prepared);
        }
        values.set(font, prepared);
      } else
        values.set(font, {
          style: {},
          warning: font?.kind === "fallback" ? font.reason : undefined,
        });
    }
    return { values, release };
  } catch (failure) {
    release();
    throw failure;
  }
}
