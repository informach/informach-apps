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
  clipboard: {
    copy: (annotations) => ipcRenderer.invoke("clipboard:copy", annotations),
    paste: () => ipcRenderer.invoke("clipboard:paste"),
  },
  scanners: {
    list: () => ipcRenderer.invoke("scanner:list"),
    sources: (deviceId) => ipcRenderer.invoke("scanner:sources", deviceId),
  },
  printers: () => ipcRenderer.invoke("printers:list"),
  tasks: {
    run: (request) => ipcRenderer.invoke("task:run", request),
    list: () => ipcRenderer.invoke("task:list"),
    load: (id) => ipcRenderer.invoke("task:load", id),
    input: (id) => ipcRenderer.invoke("task:input", id),
    remove: (id) => ipcRenderer.invoke("task:remove", id),
  },
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    set: (preferences) => ipcRenderer.invoke("preferences:set", preferences),
    repair: (kind) => ipcRenderer.invoke("preferences:repair", kind),
  },
  session: {
    load: () => ipcRenderer.invoke("session:load"),
    save: (session) => ipcRenderer.invoke("session:save", session),
    clear: () => ipcRenderer.invoke("session:clear"),
  },
  versions: {
    list: () => ipcRenderer.invoke("versions:list"),
    load: (id) => ipcRenderer.invoke("versions:load", id),
    save: (document) => ipcRenderer.invoke("versions:save", document),
    remove: (id) => ipcRenderer.invoke("versions:remove", id),
    clear: () => ipcRenderer.invoke("versions:clear"),
  },
  recovery: {
    list: () => ipcRenderer.invoke("recovery:list"),
    load: (id) => ipcRenderer.invoke("recovery:load", id),
    save: (document) => ipcRenderer.invoke("recovery:save", document),
    remove: (id) => ipcRenderer.invoke("recovery:remove", id),
  },
  openDialog: (opts) => ipcRenderer.invoke("dialog:open", opts),
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  pickData: (kind) => ipcRenderer.invoke("data:pick", kind),
  saveDataDialog: (name) => ipcRenderer.invoke("dialog:save", name, "data"),
  openWebLink: (url) => ipcRenderer.invoke("shell:open-web", url),
  saveDialog: (name, kind) => ipcRenderer.invoke("dialog:save", name, kind),
  pickFolder: (title) => ipcRenderer.invoke("dialog:folder", title),
  writeFile: (path, bytes) => ipcRenderer.invoke("file:write", path, bytes),
  writeCopy: (path, bytes) => ipcRenderer.invoke("file:write-copy", path, bytes),
  writeFiles: (folder, files) => ipcRenderer.invoke("file:write-many", folder, files),
  writeUnique: (path, bytes) => ipcRenderer.invoke("file:write-unique", path, bytes),
  showInFolder: (path) => ipcRenderer.invoke("shell:show", path),
  recent: {
    pin: (path, pinned) => ipcRenderer.invoke("recent:pin", path, pinned),
    list: () => ipcRenderer.invoke("recent:list"),
    add: (entry) => ipcRenderer.invoke("recent:add", entry),
    remove: (path) => ipcRenderer.invoke("recent:remove", path),
    clear: () => ipcRenderer.invoke("recent:clear"),
    removeThumbnails: () => ipcRenderer.invoke("recent:remove-thumbnails"),
  },
  signatures: {
    list: () => ipcRenderer.invoke("signatures:list"),
    save: (sig) => ipcRenderer.invoke("signatures:save", sig),
    remove: (id) => ipcRenderer.invoke("signatures:remove", id),
    clear: () => ipcRenderer.invoke("signatures:clear"),
  },
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

ipcRenderer.on("task:port", (event, id: unknown) => {
  if (typeof id === "string" && /^[a-f\d-]{36}$/i.test(id) && event.ports.length === 1)
    window.postMessage({ type: "edipdf-task-port", id }, "*", event.ports);
});
