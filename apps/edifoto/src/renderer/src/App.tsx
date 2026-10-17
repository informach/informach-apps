import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { type ReactNode, useEffect } from "react";
import { Editor } from "@/editor/Editor";
import { NewDocumentDialog } from "@/editor/NewDocumentDialog";
import { Home } from "@/home/Home";
import { actions, attempt } from "@/lib/actions";
import { runAiTool } from "@/lib/aiTools";
import { isDocPath, openPath, placePaths, saveDocument } from "@/lib/files";
import { AiSettings } from "@/settings/AiSettings";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { ConfirmDialog, Toasts } from "@/ui/feedback";

export function App(): ReactNode {
  const hasDoc = useDoc((s) => !!s.doc);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const newDocumentOpen = useUi((s) => s.newDocumentOpen);
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
    const stopTools = window.api.handleAiTools((call) => runAiTool(call));
    const stopFiles = window.api.onOpenFiles((paths) =>
      attempt(async () => {
        const docFirst = paths.find(isDocPath);
        if (!useDoc.getState().doc || docFirst) await openPath(docFirst ?? paths[0]);
        else await placePaths(paths);
      }),
    );
    const stopDirty = useDoc.subscribe((s, p) => {
      if (
        s.doc?.id !== p.doc?.id ||
        s.doc?.width !== p.doc?.width ||
        s.doc?.height !== p.doc?.height
      ) {
        useUi.setState({
          chromaOpen: false,
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
    return () => {
      stopTools();
      stopFiles();
      stopDirty();
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
