import { filePathForDrop, protectEditor } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";

protectEditor();

import type { AiToolCall, AssistantEvent, EdiFotoApi, ToolOutcome } from "../shared/types.ts";

const api: EdiFotoApi = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  pickImages: (multi) => ipcRenderer.invoke("dialog:images", multi),
  pickDocument: () => ipcRenderer.invoke("dialog:document"),
  pickSavePath: (defaultName, kind) => ipcRenderer.invoke("dialog:save", defaultName, kind),
  readFile: (path) => ipcRenderer.invoke("fs:read", path),
  writeFile: (path, bytes) => ipcRenderer.invoke("fs:write", path, bytes),
  recentDocs: () => ipcRenderer.invoke("recent:list"),
  addRecent: (doc) => ipcRenderer.invoke("recent:add", doc),
  removeRecent: (path) => ipcRenderer.invoke("recent:remove", path),
  showInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  pathForFile: filePathForDrop,
  setDirty: (dirty) => ipcRenderer.send("app:dirty", dirty),
  closeSaved: () => ipcRenderer.invoke("app:closeSaved"),
  onDiscardBeforeClose: (cb) => {
    const listener = (): void => cb();
    ipcRenderer.on("app:discardBeforeClose", listener);
    return () => ipcRenderer.removeListener("app:discardBeforeClose", listener);
  },
  onSaveBeforeClose: (cb) => {
    const listener = (): void => cb();
    ipcRenderer.on("app:saveBeforeClose", listener);
    return () => ipcRenderer.removeListener("app:saveBeforeClose", listener);
  },
  onOpenFiles: (cb) => {
    const fn = (_e: unknown, paths: string[]): void => {
      cb(paths);
    };
    ipcRenderer.on("app:openFiles", fn);
    return () => ipcRenderer.removeListener("app:openFiles", fn);
  },

  aiSettings: () => ipcRenderer.invoke("ai:settings"),
  saveAiSettings: (changes) => ipcRenderer.invoke("ai:saveSettings", changes),
  aiClients: () => ipcRenderer.invoke("ai:clients"),
  connectAiClient: (id) => ipcRenderer.invoke("ai:connect", id),
  assistantSend: (conversationId, text, documentId, runId, workspaceId) =>
    ipcRenderer.invoke("assistant:send", conversationId, text, documentId, runId, workspaceId),
  assistantStop: (conversationId) => ipcRenderer.invoke("assistant:stop", conversationId),
  assistantReset: (conversationId) => ipcRenderer.invoke("assistant:reset", conversationId),
  onAssistantEvent: (cb) => {
    const listener = (_e: unknown, id: string, ev: AssistantEvent): void => {
      cb(id, ev);
    };
    ipcRenderer.on("assistant:event", listener);
    return () => ipcRenderer.removeListener("assistant:event", listener);
  },
  onAiCancel: (cb) => {
    const listener = (_e: unknown, id: string): void => cb(id);
    ipcRenderer.on("ai:cancel", listener);
    return () => ipcRenderer.removeListener("ai:cancel", listener);
  },
  handleAiTools: (runTool) => {
    const listener = async (_e: unknown, call: AiToolCall): Promise<void> => {
      let result: ToolOutcome;
      try {
        result = await runTool(call);
      } catch (err) {
        result = { ok: false, text: String((err as Error)?.message ?? err) };
      }
      await ipcRenderer.invoke("ai:result", call.id, result);
    };
    ipcRenderer.on("ai:call", listener);
    return () => ipcRenderer.removeListener("ai:call", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
