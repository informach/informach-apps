import { type AnnotationCommand, applyAnnotationCommand } from "@shared/annotation-commands";
import { clipboardAnnotationsSchema, clipboardText } from "@shared/clipboard-format";
import { type Annot, annotBounds, type Box } from "@shared/model";
import { commit, type DocState, toast, useApp } from "../state/store";
import { bytesToDataUrl, measureText, placeImage } from "./actions";
import { finishDraft } from "./editing";

export const selectedAnnotations = (doc: DocState): string[] =>
  doc.selectedAnnots?.length ? doc.selectedAnnots : doc.selectedAnnot ? [doc.selectedAnnot] : [];
export function annotationAction(docId: string, command: AnnotationCommand): boolean {
  const doc = useApp.getState().docs.find((doc) => doc.id === docId);
  if (!doc) return false;
  try {
    const result = applyAnnotationCommand(doc.content, command);
    return commit(docId, () => result.content, {
      selectedAnnot: result.selection[0] ?? null,
      selectedAnnots: result.selection,
      openNote: null,
    });
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : "Alteração de anotações não aplicada.", {
      tone: "error",
    });
    return false;
  }
}
export async function copyAnnotations(doc: DocState): Promise<void> {
  if (doc.canCopy === false) {
    toast("Este PDF restringe a cópia com a senha utilizada.", { tone: "error" });
    return;
  }
  const ids = new Set(selectedAnnotations(doc)),
    annotations = doc.content.annots.filter((annot) => ids.has(annot.id));
  if (!annotations.length) return;
  try {
    await window.api.clipboard.copy(annotations);
    toast(`${annotations.length} anotação(ões) copiadas para a área de transferência.`);
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : "Não foi possível copiar a seleção.", {
      tone: "error",
    });
  }
}
export async function pasteAnnotations(doc: DocState): Promise<void> {
  if (doc.readOnly || !finishDraft(doc.id)) return;
  const snapshot = useApp.getState().docs.find((item) => item.id === doc.id);
  if (!snapshot) return;
  try {
    const value = await window.api.clipboard.paste(),
      state = useApp.getState(),
      current = state.docs.find((item) => item.id === doc.id);
    if (
      !current ||
      state.activeId !== doc.id ||
      current.content !== snapshot.content ||
      current.currentPage !== snapshot.currentPage
    )
      throw new Error("O documento mudou durante a leitura. Cole novamente.");
    if (value.kind === "annotations") {
      const { annotations } = clipboardAnnotationsSchema.parse({
        version: 1,
        annotations: value.annotations,
      });
      annotationAction(doc.id, {
        kind: "paste",
        page: current.content.pages[current.currentPage].id,
        annotations,
      });
    } else if (value.kind === "text") {
      useApp.setState({ dialog: { kind: "paragraph", initialText: clipboardText(value.text) } });
    } else if (value.kind === "image") {
      await placeImage(bytesToDataUrl(value.bytes), { document: current });
    } else {
      toast("Copie texto, uma imagem PNG ou anotações do EdiPDF para colar aqui.");
    }
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : "Não foi possível colar o conteúdo.", {
      tone: "error",
    });
  }
}
export function annotationBounds(annots: Annot[]): Record<string, Box> {
  return Object.fromEntries(
    annots.map((annot) => [
      annot.id,
      annotBounds(annot, annot.kind === "text" ? measureText(annot) : undefined),
    ]),
  );
}
