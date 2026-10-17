import { compositor } from "@/engine/compositor";
import { setFontLoadedListener } from "@/engine/text";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

/**
 * Keeps the canvas in sync: any document change (or hover preview, "Antes/Depois") recomposites
 * on the next frame; pan/zoom only redraws the last composite.
 */

let scheduled = false;
let needComposite = true;
let last: ReturnType<ReturnType<typeof compositor>["composite"]> | null = null;
let lastCount = -1;

export function requestRender(composite = true): void {
  needComposite ||= composite;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(frame);
}

function frame(): void {
  scheduled = false;
  const { doc } = useDoc.getState();
  if (!doc) return;
  const ui = useUi.getState();
  const c = compositor();
  if (needComposite || !last || c.compositeCount !== lastCount) {
    last = c.composite(doc, { modeOverride: ui.previewMode ?? undefined, before: ui.beforeAfter });
    lastCount = c.compositeCount;
    needComposite = false;
  }
  c.display(last, doc, ui.view);
}

export function startRenderLoop(): () => void {
  setFontLoadedListener(() => requestRender());
  compositor().onOffscreenRender = () => requestRender();
  const a = useDoc.subscribe((s, p) => {
    if (s.revision !== p.revision || s.doc !== p.doc) {
      last = null;
      requestRender();
    }
  });
  const b = useUi.subscribe((s, p) => {
    if (s.previewMode !== p.previewMode || s.beforeAfter !== p.beforeAfter) requestRender();
    else if (s.view !== p.view) requestRender(false);
  });
  return () => {
    a();
    b();
  };
}
