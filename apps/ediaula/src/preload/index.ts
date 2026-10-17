import { filePathForDrop, protectEditor } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";

protectEditor();

import type { AiToolCall, AssistantEvent, EdiAulaApi, JobProgress } from "../shared/types.ts";

const api: EdiAulaApi = {
  saveEditingTemplate: (name, content) =>
    ipcRenderer.invoke("editing-template:save", name, content),
  readEditingTemplate: () => ipcRenderer.invoke("editing-template:read"),
  appInfo: () => ipcRenderer.invoke("app:info"),
  listPalettes: () => ipcRenderer.invoke("palettes:list"),
  savePalettes: (list) => ipcRenderer.invoke("palettes:save", list),
  pickMedia: () => ipcRenderer.invoke("dialog:media"),
  pickProject: () => ipcRenderer.invoke("dialog:project"),
  pickExportPath: (defaultName) => ipcRenderer.invoke("dialog:export", defaultName),
  probe: (path) => ipcRenderer.invoke("media:probe", path),
  thumbnail: (path, kind, duration) => ipcRenderer.invoke("media:thumb", path, kind, duration),
  waveform: (path) => ipcRenderer.invoke("media:waveform", path),
  proxy: (jobId, path, duration, cfrFps) =>
    ipcRenderer.invoke("media:proxy", jobId, path, duration, cfrFps),
  cursorSprite: {
    cached: (path, id) => ipcRenderer.invoke("cursor:cached", path, id),
    begin: (jobId, path, id, size, fps) =>
      ipcRenderer.invoke("cursor:begin", jobId, path, id, size, fps),
    frames: (jobId, frames, counts) => ipcRenderer.invoke("cursor:frames", jobId, frames, counts),
    end: (jobId) => ipcRenderer.invoke("cursor:end", jobId),
    cancel: (jobId) => ipcRenderer.invoke("cursor:cancel", jobId),
  },
  recorder: {
    guidedPick: () => ipcRenderer.invoke("recorder:guidedPick"),
    guidedStart: (plan) => ipcRenderer.invoke("recorder:guidedStart", plan),
    guidedCancel: () => ipcRenderer.invoke("recorder:guidedCancel"),
    reset: () => ipcRenderer.invoke("recorder:reset"),
    guidedBrowser: (url) => ipcRenderer.invoke("recorder:guidedBrowser", url),
    pickNarration: () => ipcRenderer.invoke("recorder:pickNarration"),
    open: (ctx) => ipcRenderer.invoke("recorder:open", ctx),
    context: () => ipcRenderer.invoke("recorder:context"),
    sources: () => ipcRenderer.invoke("recorder:sources"),
    moveTo: (index) => ipcRenderer.invoke("recorder:moveTo", index),
    prepare: (opts) => ipcRenderer.invoke("recorder:prepare", opts),
    start: () => ipcRenderer.invoke("recorder:start"),
    systemAudio: (bytes, startedAt) => ipcRenderer.invoke("recorder:systemAudio", bytes, startedAt),
    pause: () => ipcRenderer.invoke("recorder:pause"),
    resume: () => ipcRenderer.invoke("recorder:resume"),
    mark: (kind) => ipcRenderer.invoke("recorder:mark", kind),
    elapsed: () => ipcRenderer.invoke("recorder:elapsed"),
    interactive: (on) => ipcRenderer.invoke("recorder:interactive", on),
    cancel: () => ipcRenderer.invoke("recorder:cancel"),
    stop: () => ipcRenderer.invoke("recorder:stop"),
    debugCapture: (path) => ipcRenderer.invoke("recorder:debugCapture", path),
    onHotkey: (cb) => {
      const fn = (_e: unknown, name: string): void => {
        cb(name);
      };
      ipcRenderer.on("recorder:hotkey", fn);
      return () => ipcRenderer.removeListener("recorder:hotkey", fn);
    },
    onDone: (cb) => {
      const fn = (_e: unknown, r: Parameters<typeof cb>[0]): void => {
        cb(r);
      };
      ipcRenderer.on("recorder:done", fn);
      return () => ipcRenderer.removeListener("recorder:done", fn);
    },
  },
  saveGenerated: (bytes, ext) => ipcRenderer.invoke("media:saveGenerated", bytes, ext),
  saveNarration: (bytes) => ipcRenderer.invoke("media:saveNarration", bytes),
  stillFrame: (path, t, alpha) => ipcRenderer.invoke("media:still", path, t, alpha),
  detectScreen: (path, duration, width, height) =>
    ipcRenderer.invoke("key:detect", path, duration, width, height),
  grabFrame: (path, t, width, height, maxSide) =>
    ipcRenderer.invoke("key:frame", path, t, width, height, maxSide),
  renderKeyed: (jobId, path, width, height, fps, duration, key) =>
    ipcRenderer.invoke("key:render", jobId, path, width, height, fps, duration, key),
  exists: (paths) => ipcRenderer.invoke("fs:exists", paths),
  createProject: (name, course, settings) =>
    ipcRenderer.invoke("project:create", name, course, settings),
  saveProject: (path, project) => ipcRenderer.invoke("project:save", path, project),
  openProject: (path) => ipcRenderer.invoke("project:open", path),
  recentProjects: () => ipcRenderer.invoke("project:recent"),
  removeRecent: (path) => ipcRenderer.invoke("project:removeRecent", path),
  startExport: (jobId, project, spec) => ipcRenderer.invoke("export:start", jobId, project, spec),
  cancelJob: (jobId) => ipcRenderer.invoke("job:cancel", jobId),
  showInFolder: (path) => ipcRenderer.invoke("shell:showItem", path),
  onProgress: (cb) => {
    const listener = (_e: unknown, p: JobProgress): void => {
      cb(p);
    };
    ipcRenderer.on("job:progress", listener);
    return () => ipcRenderer.removeListener("job:progress", listener);
  },
  pathForFile: filePathForDrop,
  engineStatus: () => ipcRenderer.invoke("whisper:status"),
  installEngine: (jobId, variant) => ipcRenderer.invoke("whisper:installEngine", jobId, variant),
  installModel: (jobId, name) => ipcRenderer.invoke("whisper:installModel", jobId, name),
  selectModel: (path) => ipcRenderer.invoke("whisper:selectModel", path),
  transcribe: (jobId, path, duration, language, glossary) =>
    ipcRenderer.invoke("whisper:transcribe", jobId, path, duration, language, glossary),
  getGlossary: (course) => ipcRenderer.invoke("glossary:get", course),
  setGlossary: (course, terms) => ipcRenderer.invoke("glossary:set", course, terms),
  openRestrictedClaude: () => ipcRenderer.invoke("ai:openRestrictedClaude"),
  aiSettings: () => ipcRenderer.invoke("ai:settings"),
  saveAiSettings: (changes) => ipcRenderer.invoke("ai:saveSettings", changes),
  testApiKey: () => ipcRenderer.invoke("ai:testKey"),
  aiClients: () => ipcRenderer.invoke("ai:clients"),
  connectAiClient: (id) => ipcRenderer.invoke("ai:connect", id),
  assistantSend: (conversationId, text) =>
    ipcRenderer.invoke("assistant:send", conversationId, text),
  assistantStop: (conversationId) => ipcRenderer.invoke("assistant:stop", conversationId),
  assistantReset: (conversationId) => ipcRenderer.invoke("assistant:reset", conversationId),
  onAssistantEvent: (cb) => {
    const listener = (_e: unknown, id: string, ev: AssistantEvent): void => {
      cb(id, ev);
    };
    ipcRenderer.on("assistant:event", listener);
    return () => ipcRenderer.removeListener("assistant:event", listener);
  },
  handleAiTools: (runTool) => {
    const listener = async (_e: unknown, call: AiToolCall): Promise<void> => {
      let result: { ok: boolean; text: string };
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
