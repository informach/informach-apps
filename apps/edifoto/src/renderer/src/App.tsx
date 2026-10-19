import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { type ReactNode, useEffect } from "react";
import { Editor } from "@/editor/Editor";
import { NewDocumentDialog } from "@/editor/NewDocumentDialog";
import { Home } from "@/home/Home";
import { actions, attempt } from "@/lib/actions";
import { cancelAiTool, runAiTool } from "@/lib/aiTools";
import { saveDocument } from "@/lib/files";
import { discardRecovery, flushRecovery, startRecovery } from "@/lib/recovery";
import { AiSettings } from "@/settings/AiSettings";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { ConfirmDialog, Toasts } from "@/ui/feedback";

export function App(): ReactNode {
  const hasDoc = useDoc((s) => !!s.doc);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const newDocumentOpen = useUi((s) => s.newDocumentOpen);
  useEffect(startRecovery, []);
  useEffect(
    () =>
      registerEdiRecovery(async () => {
        if (!(await saveDocument(false))) throw new Error("Recovery save canceled");
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "n")
        return;
      e.preventDefault();
      const ui = useUi.getState();
      if (
        ui.confirm ||
        ui.settingsOpen ||
        ui.exportOpen ||
        ui.resizeOpen ||
        ui.compareOpen ||
        ui.newDocumentOpen ||
        ui.chromaOpen ||
        e.repeat
      )
        return;
      actions.newDocument();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void useUi.getState().refreshAi();
    const stopCancel = window.api.onAiCancel(cancelAiTool);
    const stopTools = window.api.handleAiTools((call) => runAiTool(call));
    const stopFiles = window.api.onOpenFiles((paths) => attempt(() => actions.receiveFiles(paths)));
    const stopDirty = useDoc.subscribe((s, p) => {
      if (
        s.doc?.id !== p.doc?.id ||
        s.doc?.width !== p.doc?.width ||
        s.doc?.height !== p.doc?.height
      ) {
        useUi.setState({
          chromaOpen: false,
          exportOpen: false,
          resizeOpen: false,
          beforeAfter: false,
          previewMode: null,
          selection: null,
          selectionPreview: null,
          penPoints: [],
          penSelected: null,
          cloneSource: null,
          crop: null,
        });
      } else if (s.activeId !== p.activeId) useUi.setState({ penSelected: null });
      if (s.dirty !== p.dirty) window.api.setDirty(s.dirty);
      if (s.doc?.name !== p.doc?.name || s.dirty !== p.dirty)
        document.title = s.doc ? `${s.dirty ? "• " : ""}${s.doc.name} — EdiFoto 0.2.0` : "EdiFoto";
    });
    window.api.setDirty(useDoc.getState().dirty);
    const stopDiscard = window.api.onDiscardBeforeClose(() =>
      attempt(async () => {
        await discardRecovery();
        window.api.setDirty(false);
        await window.api.closeSaved();
      }),
    );
    const stopClose = window.api.onSaveBeforeClose(() =>
      attempt(async () => {
        if (await saveDocument(false)) {
          if (useDoc.getState().dirty)
            throw new Error("Há alterações novas. Salve novamente antes de sair.");
          await flushRecovery();
          await window.api.closeSaved();
        }
      }),
    );
    return () => {
      stopTools();
      stopCancel();
      stopFiles();
      stopDirty();
      stopClose();
      stopDiscard();
    };
  }, []);

  return (
    <>
      {hasDoc ? <Editor /> : <Home />}
      {settingsOpen && <AiSettings />}
      {newDocumentOpen && <NewDocumentDialog />}
      <ConfirmDialog />
      <Toasts />
    </>
  );
}
