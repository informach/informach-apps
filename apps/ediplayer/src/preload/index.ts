import { filePathForDrop, protectEditor } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";

protectEditor();

import type { EdiPlayerApi, ProgressEvent, QueueItem } from "../shared/types.ts";

/** One fixed channel per method; no generic invoke crosses the bridge. */
const api: EdiPlayerApi = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  reportCaps: (caps) => ipcRenderer.invoke("player:caps", caps),
  pickFiles: () => ipcRenderer.invoke("dialog:media", "video"),
  pickFolder: () => ipcRenderer.invoke("dialog:media", "folder"),
  pickSubtitle: async () =>
    ((await ipcRenderer.invoke("dialog:media", "subtitle")) as string[]).at(0) ?? null,
  pickAudio: async () =>
    ((await ipcRenderer.invoke("dialog:media", "audio")) as string[]).at(0) ?? null,
  pickJoinFiles: () => ipcRenderer.invoke("dialog:media", "join"),
  pathForFile: filePathForDrop,
  probe: (path) => ipcRenderer.invoke("media:probe", path),
  open: (path, audioIndex, fallback) =>
    ipcRenderer.invoke("player:open", path, audioIndex, fallback),
  cancelPrepare: (path) => ipcRenderer.invoke("player:cancelPrepare", path),
  frameSheet: (path) => ipcRenderer.invoke("media:sheet", path),
  waveform: (path) => ipcRenderer.invoke("media:waveform", path),
  keyframes: (path) => ipcRenderer.invoke("media:keyframes", path),
  readSubtitle: (path) => ipcRenderer.invoke("subtitle:read", path),
  extractSubtitle: (path, index) => ipcRenderer.invoke("subtitle:extract", path, index),
  captureFrame: (path, at, target) => ipcRenderer.invoke("player:frame", path, at, target),
  recents: () => ipcRenderer.invoke("player:recents"),
  remember: (item) => ipcRenderer.invoke("player:remember", item),
  forgetRecents: () => ipcRenderer.invoke("player:forget"),
  prefs: () => ipcRenderer.invoke("player:prefs"),
  savePrefs: (prefs) => ipcRenderer.invoke("player:savePrefs", prefs),
  pickOutput: (name, extension, near) =>
    ipcRenderer.invoke("dialog:save", name, extension, near ?? null),
  pickOutputFolder: () => ipcRenderer.invoke("dialog:folder"),
  enqueue: (job, label, openFolder) => ipcRenderer.invoke("queue:add", job, label, openFolder),
  cancelJob: (id) => ipcRenderer.invoke("queue:cancel", id),
  queue: () => ipcRenderer.invoke("queue:list"),
  clearFinished: () => ipcRenderer.invoke("queue:clear"),
  showInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  setAlwaysOnTop: (on) => ipcRenderer.invoke("window:onTop", on),
  setMiniPlayer: (on) => ipcRenderer.invoke("window:mini", on),
  openInEdiAula: (path) => ipcRenderer.invoke("tool:ediaula", path),
  onQueue: (cb) => {
    const fn = (_e: unknown, items: QueueItem[]) => cb(items);
    ipcRenderer.on("queue:changed", fn);
    return () => ipcRenderer.removeListener("queue:changed", fn);
  },
  onProgress: (cb) => {
    const fn = (_e: unknown, event: ProgressEvent) => cb(event);
    ipcRenderer.on("progress", fn);
    return () => ipcRenderer.removeListener("progress", fn);
  },
  onOpenFiles: (cb) => {
    const fn = (_e: unknown, paths: string[]) => cb(paths);
    ipcRenderer.on("app:openFiles", fn);
    return () => ipcRenderer.removeListener("app:openFiles", fn);
  },
};

contextBridge.exposeInMainWorld("api", api);
