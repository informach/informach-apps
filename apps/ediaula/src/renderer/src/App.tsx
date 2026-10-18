import { type ReactNode, useEffect } from "react";
import { ApprovalDialog, listenAiApprovals } from "./editor/ApprovalDialog";
import { Editor } from "./editor/Editor";
import { ExportQueuePanel } from "./editor/ExportQueuePanel";
import { DraftLeaveDialog, SaveFailedDialog } from "./editor/SaveFailedDialog";
import { OrphanRecordings } from "./home/OrphanRecordings";
import { reportAiContext, runAiTool } from "./lib/aiTools";
import { watchCourseOffer } from "./lib/courseTemplate";
import { listenPrepare } from "./lib/prepare";
import { loadRecorderKeys } from "./lib/recorderKeys";
import { listenRecordings } from "./lib/recording";
import { listenSeamReview } from "./lib/review";
import { SettingsModal } from "./settings/SettingsModal";
import "./state/assistant";
import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { Home } from "./home/Home";
import { listenToJobs, useApp } from "./state/app";
import { listenRecorderState, loadUnfinishedExports } from "./state/exportQueue";
import { settleEdits, useProject } from "./state/project";

export function App(): ReactNode {
  const screen = useApp((s) => s.screen);
  const toasts = useApp((s) => s.toasts);
  const settingsOpen = useApp((s) => s.settingsOpen);
  useEffect(
    () =>
      registerEdiRecovery(async () => {
        await settleEdits();
        if (!(await useProject.getState().flush())) throw new Error("Recovery save failed");
      }),
    [],
  );

  useEffect(() => {
    void window.api.appInfo().then((info) => useApp.getState().set({ info }));
    const stopJobs = listenToJobs();
    const stopRecorder = listenRecorderState();
    void loadUnfinishedExports().catch((error: unknown) =>
      useApp
        .getState()
        .toast(
          `As exportações da última vez não puderam ser lidas: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        ),
    );
    // Shortcut labels follow the recorder's settings, which change in the recorder window.
    const refreshKeys = (): void =>
      void loadRecorderKeys().catch((error: unknown) =>
        console.warn("[recorder] atalhos do gravador:", error),
      );
    refreshKeys();
    const stopKeys = window.api.recorder.onState(refreshKeys);
    listenRecordings();
    // AI tools (from Claude Code/Codex over MCP, or the in-app assistant) run here, on the live project.
    const stopTools = window.api.handleAiTools((call) => runAiTool(call));
    const stopApprovals = listenAiApprovals();
    const stopContext = reportAiContext();
    const stopPrepare = listenPrepare();
    const stopOffer = watchCourseOffer();
    const stopSeams = listenSeamReview();
    return () => {
      stopSeams();
      stopPrepare();
      stopOffer();
      stopJobs();
      stopRecorder();
      stopKeys();
      stopTools();
      stopApprovals();
      stopContext();
    };
  }, []);

  return (
    <>
      {screen === "home" ? <Home /> : <Editor />}
      {settingsOpen && <SettingsModal />}
      <ExportQueuePanel />
      <SaveFailedDialog />
      <DraftLeaveDialog />
      <ApprovalDialog />
      <OrphanRecordings />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
