import type { BuildInput } from "@shared/document-build-format";
import type { DocContent } from "@shared/model";
import type { DocState } from "../state/store";
import { buildDocumentInWorker } from "./document-build";
import { localFonts } from "./fonts";
import { getSource } from "./pdf";
export type RenderDocument = Pick<
  DocState,
  "id" | "name" | "content" | "readOnly" | "sourceIds" | "primary"
>;

/** Build a complete revision; all callers receive the same validated document semantics. */
export async function buildDoc(
  doc: RenderDocument,
  content: DocContent = doc.content,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return buildDocumentInWorker(await captureDocumentBuild(doc, content, signal), signal);
}

/** Capture immutable revision/source references before placing the composition itself in a task. */
export async function captureDocumentBuild(
  doc: RenderDocument,
  content: DocContent = doc.content,
  signal?: AbortSignal,
): Promise<BuildInput> {
  if (doc.readOnly)
    throw new Error(
      "Documento em leitura. Reabra com a senha de administração para gerar uma versão editada.",
    );
  const sources: Record<string, Uint8Array> = {};
  for (const id of doc.sourceIds) {
    const source = getSource(id);
    if (!source) throw new Error("Uma fonte do documento está indisponível.");
    sources[id] = source.bytes;
  }
  signal?.throwIfAborted();
  const fonts = await localFonts();
  signal?.throwIfAborted();
  return {
    content,
    sources,
    primary: content.baseSource ?? doc.primary,
    fonts,
  };
}
