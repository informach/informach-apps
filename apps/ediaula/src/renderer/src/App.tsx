import { type ReactNode, useEffect } from "react";
import { Editor } from "./editor/Editor";
import { ExportQueuePanel } from "./editor/ExportQueuePanel";
import { runAiTool } from "./lib/aiTools";
import { listenRecordings } from "./lib/recording";
import { SettingsModal } from "./settings/SettingsModal";
import "./state/assistant";
import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { Home } from "./home/Home";
import { listenToJobs, useApp } from "./state/app";
import { useProject } from "./state/project";

export function App(): ReactNode {
  const screen = useApp((s) => s.screen);
  const toasts = useApp((s) => s.toasts);
  const settingsOpen = useApp((s) => s.settingsOpen);
  useEffect(
    () =>
      registerEdiRecovery(async () => {
        await useProject.getState().saveNow();
        if (useProject.getState().saveState === "error") throw new Error("Recovery save failed");
      }),
    [],
  );

  useEffect(() => {
    void window.api.appInfo().then((info) => useApp.getState().set({ info }));
    const stopJobs = listenToJobs();
    listenRecordings();
    // AI tools (from Claude Code/Codex over MCP, or the in-app assistant) run here, on the live project.
    const stopTools = window.api.handleAiTools((call) =>
      runAiTool(call.name, call.input, call.source),
    );
    return () => {
      stopJobs();
      stopTools();
    };
  }, []);

  return (
    <>
      {screen === "home" ? <Home /> : <Editor />}
      {settingsOpen && <SettingsModal />}
      <ExportQueuePanel />
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
