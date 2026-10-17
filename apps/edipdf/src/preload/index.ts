import { filePathForDrop, protectEditor } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";

protectEditor();

import type { EdiPdfApi } from "../shared/types.ts";

const listen = (channel: string, cb: (...args: never[]) => void): (() => void) => {
  const handler = (_e: unknown, ...args: unknown[]): void => {
    (cb as (...a: unknown[]) => void)(...args);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: EdiPdfApi = {
  openDialog: (opts) => ipcRenderer.invoke("dialog:open", opts),
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  saveDialog: (name, kind) => ipcRenderer.invoke("dialog:save", name, kind),
  pickFolder: (title) => ipcRenderer.invoke("dialog:folder", title),
  writeFile: (path, bytes) => ipcRenderer.invoke("file:write", path, bytes),
  writeFiles: (folder, files) => ipcRenderer.invoke("file:write-many", folder, files),
  writeUnique: (path, bytes) => ipcRenderer.invoke("file:write-unique", path, bytes),
  showInFolder: (path) => ipcRenderer.invoke("shell:show", path),
  recent: {
    list: () => ipcRenderer.invoke("recent:list"),
    add: (entry) => ipcRenderer.invoke("recent:add", entry),
    remove: (path) => ipcRenderer.invoke("recent:remove", path),
  },
  signatures: {
    list: () => ipcRenderer.invoke("signatures:list"),
    save: (sig) => ipcRenderer.invoke("signatures:save", sig),
    remove: (id) => ipcRenderer.invoke("signatures:remove", id),
  },
  print: (pages, jobName) => ipcRenderer.invoke("print", pages, jobName),
  confirmUnsaved: (names) => ipcRenderer.invoke("dialog:unsaved", names),
  message: (opts) => ipcRenderer.invoke("dialog:message", opts),
  pathForFile: filePathForDrop,
  takePendingFiles: () => ipcRenderer.invoke("app:pending"),
  onOpenFiles: (cb) => listen("app:open-files", cb),
  onCloseRequest: (cb) => listen("app:close-request", cb),
  closeNow: () => ipcRenderer.send("app:close-now"),
  setTitle: (title) => ipcRenderer.send("app:title", title),
};

contextBridge.exposeInMainWorld("api", api);
