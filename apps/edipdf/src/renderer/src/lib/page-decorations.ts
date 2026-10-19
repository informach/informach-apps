import { activeDoc, toast, useApp } from "../state/store";
import { finishDraft } from "./editing";

/** Finalize the active draft before the dialog captures its immutable source revision. */
export function openPageDecorations(kind: "watermark" | "pageNumbers"): void {
  const doc = activeDoc();
  if (!doc || doc.readOnly) return;
  if (!finishDraft(doc.id)) {
    toast("Conclua o rascunho antes de preparar marcas e cabeçalhos.", { tone: "error" });
    return;
  }
  useApp.setState({ dialog: { kind } });
}
