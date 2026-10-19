import type { TextDocument } from "@shared/engine-contracts";
import type { DocContent } from "@shared/model";
import { type DocState, useApp } from "../state/store";
import { buildDoc } from "./document-output";
import { runEngine } from "./local-engine";
import { getSource } from "./pdf";

const cache = new Map<string, { content: DocContent; text: TextDocument }>();
export function releaseDocumentText(id: string): void {
  cache.delete(id);
}
export async function documentText(
  doc: DocState,
  signal: AbortSignal,
  progress?: (page: number, total: number) => void,
): Promise<TextDocument> {
  const stored = cache.get(doc.id);
  if (stored?.content === doc.content) return stored.text;
  let bytes: Uint8Array, password: string | undefined;
  if (doc.readOnly) {
    const source = getSource(doc.content.pages[0]?.src);
    if (!source) throw new Error("Fonte indisponível para leitura.");
    if (source.readOnlyReason?.includes("XFA"))
      throw new Error(
        "A busca em formulários XFA ainda não foi homologada. Gere um PDF estático para pesquisar.",
      );
    bytes = source.bytes;
    password = source.password;
  } else bytes = await buildDoc(doc, doc.content, signal);
  signal.throwIfAborted();
  const text = await runEngine(
    { kind: "text", bytes, password, includeAnnotations: true },
    signal,
    progress,
  );
  signal.throwIfAborted();
  if (text.pages.length !== doc.content.pages.length)
    throw new Error("O índice não corresponde às páginas do documento.");
  if (useApp.getState().docs.find((d) => d.id === doc.id)?.content === doc.content)
    cache.set(doc.id, { content: doc.content, text });
  return text;
}
