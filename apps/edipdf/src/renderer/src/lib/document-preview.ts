import type { DocContent } from "@shared/model";
import { buildDoc, type RenderDocument } from "./document-output";
import {
  getSource,
  loadSource,
  releaseSource,
  renderReviewPage,
  renderToDataUrl,
  type Source,
} from "./pdf";

interface PreviewEntry {
  content: DocContent;
  promise: Promise<Source>;
  source?: Source;
  owned: boolean;
  disposed: boolean;
  abort: AbortController;
}
const cache = new Map<string, PreviewEntry>();
export function releaseDocumentPreview(id: string): void {
  const entry = cache.get(id);
  cache.delete(id);
  if (!entry) return;
  entry.disposed = true;
  entry.abort.abort();
  if (entry.source && entry.owned) releaseSource(entry.source.id);
}
function outputSource(doc: RenderDocument): Promise<Source> {
  const previous = cache.get(doc.id);
  if (previous?.content === doc.content) return previous.promise;
  releaseDocumentPreview(doc.id);
  const entry: PreviewEntry = {
    content: doc.content,
    owned: !doc.readOnly,
    disposed: false,
    abort: new AbortController(),
    promise: Promise.resolve().then(async () => {
      const source = doc.readOnly
        ? getSource(doc.content.pages[0]?.src)
        : await loadSource(
            await buildDoc(doc, doc.content, entry.abort.signal),
            doc.name,
            () => Promise.resolve(null),
            {
              output: true,
            },
          );
      if (!source) throw new Error("Fonte da prévia indisponível.");
      if (entry.disposed) {
        if (entry.owned) releaseSource(source.id);
        throw new DOMException("Prévia substituída por uma revisão mais recente.", "AbortError");
      }
      entry.source = source;
      return source;
    }),
  };
  cache.set(doc.id, entry);
  return entry.promise;
}
let queue: Promise<unknown> = Promise.resolve();
export async function documentReview(doc: RenderDocument, pageId: string, signal: AbortSignal) {
  const source = await outputSource(doc);
  signal.throwIfAborted();
  const index = doc.content.pages.findIndex((page) => page.id === pageId);
  if (index < 0) throw new Error("Página da prévia indisponível.");
  return renderReviewPage({ id: pageId, src: source.id, index, rotation: 0 }, 1200, signal);
}
export async function documentThumbnail(
  doc: RenderDocument,
  pageId: string,
  width: number,
): Promise<string> {
  const source = await outputSource(doc);
  const index = doc.content.pages.findIndex((page) => page.id === pageId);
  if (index < 0) throw new Error("Página da miniatura indisponível.");
  const result = queue.then(() =>
    renderToDataUrl(
      { id: pageId, src: source.id, index, rotation: 0 },
      width * Math.min(2, window.devicePixelRatio || 1),
    ),
  );
  // A failed thumbnail must not stop later pages; the caller retains the original rejection.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
