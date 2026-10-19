import type { DocContent } from "@shared/model";
import { commit, patchDoc, useApp } from "../state/store";
import { loadSource, releaseSource } from "./pdf";

/** Commit complete bytes as one undoable structural revision, preserving all previous sources. */
export async function replaceDocumentBytes(
  docId: string,
  before: DocContent,
  bytes: Uint8Array,
  options: { requireCopy?: boolean; signal?: AbortSignal; beforeCommit?: () => Promise<void> } = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  const document = useApp.getState().docs.find((item) => item.id === docId);
  if (!document || document.content !== before)
    throw new Error("O documento mudou durante a operação. Tente novamente.");
  const source = await loadSource(bytes, document.name, () => Promise.resolve(null));
  let fields: Awaited<ReturnType<typeof source.pdf.getFieldObjects>>;
  try {
    fields = await source.pdf.getFieldObjects();
    await options.beforeCommit?.();
    options.signal?.throwIfAborted();
  } catch (error) {
    releaseSource(source.id);
    throw error;
  }
  const current = useApp.getState().docs.find((item) => item.id === docId);
  if (!current || current.content !== before || source.info.length !== before.pages.length) {
    releaseSource(source.id);
    throw new Error("A operação não corresponde mais às páginas do documento.");
  }
  const pages = before.pages.map((page, index) => ({
    id: page.id,
    src: source.id,
    index,
    rotation: 0 as const,
  }));
  const content: DocContent = {
    baseSource: source.id,
    requiresCopy: options.requireCopy || before.requiresCopy,
    pages,
    annots: pages.flatMap((page) =>
      (source.annotations.get(page.index) ?? []).map((annot) => ({ ...annot, page: page.id })),
    ),
    forms: {},
    meta: {},
    watermark: null,
    pageNumbers: null,
  };
  patchDoc(docId, {
    sourceIds: [...current.sourceIds, source.id],
    draft: null,
    selectedAnnot: null,
    search: null,
  });
  const accepted = commit(docId, () => content, {
    hasForms:
      fields !== null && (fields instanceof Map ? fields.size > 0 : Object.keys(fields).length > 0),
  });
  if (!accepted) {
    patchDoc(docId, { sourceIds: current.sourceIds });
    releaseSource(source.id);
    throw new Error("A revisão estrutural não foi aceita. O documento anterior foi preservado.");
  }
}
