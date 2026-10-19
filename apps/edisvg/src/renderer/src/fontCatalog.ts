import type { Asset } from "@informach/edi-motion/assets";
import { type BrowserAssets, loadBrowserAssets } from "@informach/edi-motion/assets/browser";

/** The editor owns fonts outside replaceable SVG markup. Navigation/repaint
 * never recreates @font-face rules or restarts decoding. */
export function createFontCatalogOwner(changed: () => void) {
  let key: string | undefined,
    controller: AbortController | undefined,
    resources: BrowserAssets | undefined,
    ready = true,
    error = "",
    destroyed = false;
  const release = () => {
    controller?.abort();
    controller = undefined;
    resources?.destroy();
    resources = undefined;
  };
  return {
    synchronize(assets: Asset[], sessionId: string) {
      if (destroyed) throw new Error("Catálogo de fontes descartado.");
      const fonts = assets.filter((asset) => asset.kind === "font"),
        next = JSON.stringify([sessionId, fonts.map((font) => font.id).sort()]);
      if (key !== next) {
        release();
        key = next;
        error = "";
        ready = fonts.length === 0;
        if (fonts.length) {
          const task = new AbortController();
          controller = task;
          void loadBrowserAssets(fonts, task.signal).then(
            (loaded) => {
              if (task.signal.aborted || controller !== task || destroyed) {
                loaded.destroy();
                return;
              }
              resources = loaded;
              ready = true;
              changed();
            },
            (cause: unknown) => {
              if (task.signal.aborted || controller !== task || destroyed) return;
              error = cause instanceof Error ? cause.message : "Fonte incorporada incompatível.";
              ready = false;
              changed();
            },
          );
        }
      }
      return { ready, error };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      key = undefined;
      release();
    },
  };
}
