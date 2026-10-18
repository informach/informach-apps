import { filePathForDrop, protectEditor } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";

protectEditor();

import type {
  AiApprovalRequest,
  AiToolCall,
  AssistantEvent,
  EdiAulaApi,
  JobProgress,
  ToolImage,
} from "../shared/types.ts";

/** Subscribes `cb` to a channel the main process pushes; returns the unsubscribe. */
function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const fn = (_e: unknown, value: T): void => {
    cb(value);
  };
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: EdiAulaApi = {
  frameImage: (jobId, path, seconds, geometry) =>
    ipcRenderer.invoke("media:frameImage", jobId, path, seconds, geometry),
  composeFrame: (jobId, projectJson, spec, time, geometry) =>
    ipcRenderer.invoke("export:frame", jobId, projectJson, spec, time, geometry),
  aiOneShot: (jobId, prompt) => ipcRenderer.invoke("ai:oneShot", jobId, prompt),
  assistantLoadChat: (conversationId) => ipcRenderer.invoke("assistant:loadChat", conversationId),
  assistantSaveChat: (conversationId, chat) =>
    ipcRenderer.invoke("assistant:saveChat", conversationId, chat),
  getLearning: (course) => ipcRenderer.invoke("learning:get", course),
  recordLearning: (course, events) => ipcRenderer.invoke("learning:record", course, events),
  pickFolder: (title) => ipcRenderer.invoke("dialog:folder", title),
  saveEditingTemplate: (name, content) =>
    ipcRenderer.invoke("editing-template:save", name, content),
  readEditingTemplate: () => ipcRenderer.invoke("editing-template:read"),
  getCourseTemplate: (course) => ipcRenderer.invoke("course-template:get", course),
  saveCourseTemplate: (course, template) =>
    ipcRenderer.invoke("course-template:save", course, template),
  measureLoudness: (jobId, projectJson, speech) =>
    ipcRenderer.invoke("media:loudness", jobId, projectJson, speech),
  appInfo: () => ipcRenderer.invoke("app:info"),
  listPalettes: () => ipcRenderer.invoke("palettes:list"),
  savePalettes: (list) => ipcRenderer.invoke("palettes:save", list),
  pickMedia: () => ipcRenderer.invoke("dialog:media"),
  pickProject: () => ipcRenderer.invoke("dialog:project"),
  pickExportPath: (defaultName) => ipcRenderer.invoke("dialog:export", defaultName),
  pickProjectCopyPath: (defaultName) => ipcRenderer.invoke("dialog:save", defaultName),
  relinkPick: (request) => ipcRenderer.invoke("media:relinkPick", request),
  relinkCursor: (oldPath) => ipcRenderer.invoke("media:relinkCursor", oldPath),
  relinkFolder: (wanted, token) => ipcRenderer.invoke("media:relinkFolder", wanted, token),
  probe: (path) => ipcRenderer.invoke("media:probe", path),
  thumbnail: (path, kind, duration) => ipcRenderer.invoke("media:thumb", path, kind, duration),
  waveform: (path) => ipcRenderer.invoke("media:waveform", path),
  motion: (jobId, path, input, duration) =>
    ipcRenderer.invoke("media:motion", jobId, path, input, duration),
  scenes: (jobId, path, input, duration) =>
    ipcRenderer.invoke("media:scenes", jobId, path, input, duration),
  proxy: (jobId, path, duration, cfrFps, alpha) =>
    ipcRenderer.invoke("media:proxy", jobId, path, duration, cfrFps, alpha),
  drawingVideo: {
    cached: (id) => ipcRenderer.invoke("drawing:cached", id),
    begin: (jobId, id, width, height, fps) =>
      ipcRenderer.invoke("drawing:begin", jobId, id, width, height, fps),
    missing: (jobId, keys) => ipcRenderer.invoke("drawing:missing", jobId, keys),
    frame: (jobId, key, png) => ipcRenderer.invoke("drawing:frame", jobId, key, png),
    end: (jobId, frames, total) => ipcRenderer.invoke("drawing:end", jobId, frames, total),
    cancel: (jobId) => ipcRenderer.invoke("drawing:cancel", jobId),
  },
  cursorSprite: {
    cached: (path, id) => ipcRenderer.invoke("cursor:cached", path, id),
    begin: (jobId, path, id, size, fps, height) =>
      ipcRenderer.invoke("cursor:begin", jobId, path, id, size, fps, height),
    frames: (jobId, frames, counts) => ipcRenderer.invoke("cursor:frames", jobId, frames, counts),
    end: (jobId) => ipcRenderer.invoke("cursor:end", jobId),
    cancel: (jobId) => ipcRenderer.invoke("cursor:cancel", jobId),
    clicks: (path, id, times, volume, duration) =>
      ipcRenderer.invoke("cursor:clicks", path, id, times, volume, duration),
  },
  personKey: {
    model: () => ipcRenderer.invoke("personKey:model"),
    begin: (jobId, media) => ipcRenderer.invoke("personKey:begin", jobId, media),
    frames: (jobId) => ipcRenderer.invoke("personKey:frames", jobId),
    masks: (jobId, masks) => ipcRenderer.invoke("personKey:masks", jobId, masks),
    end: (jobId) => ipcRenderer.invoke("personKey:end", jobId),
    cancel: (jobId) => ipcRenderer.invoke("personKey:cancel", jobId),
  },
  recorder: {
    guidedPick: () => ipcRenderer.invoke("recorder:guidedPick"),
    guidedStart: (plan) => ipcRenderer.invoke("recorder:guidedStart", plan),
    guidedCancel: () => ipcRenderer.invoke("recorder:guidedCancel"),
    reset: () => ipcRenderer.invoke("recorder:reset"),
    guidedBrowser: (url) => ipcRenderer.invoke("recorder:guidedBrowser", url),
    pickNarration: () => ipcRenderer.invoke("recorder:pickNarration"),
    guidedSave: (store, projectId) => ipcRenderer.invoke("recorder:guidedSave", store, projectId),
    guidedAdopt: (projectId) => ipcRenderer.invoke("recorder:guidedAdopt", projectId),
    guidedMark: (purpose, viewport) => ipcRenderer.invoke("recorder:guidedMark", purpose, viewport),
    guidedWebStart: (plan, from) => ipcRenderer.invoke("recorder:guidedWebStart", plan, from),
    guidedWebPause: () => ipcRenderer.invoke("recorder:guidedWebPause"),
    guidedWebResume: () => ipcRenderer.invoke("recorder:guidedWebResume"),
    guidedWebStop: () => ipcRenderer.invoke("recorder:guidedWebStop"),
    guidedWebDiscard: () => ipcRenderer.invoke("recorder:guidedWebDiscard"),
    guidedVerify: (plan) => ipcRenderer.invoke("recorder:guidedVerify", plan),
    guidedVerifyCancel: () => ipcRenderer.invoke("recorder:guidedVerifyCancel"),
    onGuidedStatus: (cb) => listen("recorder:guidedStatus", cb),
    onGuided: (cb) => listen("recorder:guided", cb),
    onContextChanged: (cb) => listen("recorder:contextChanged", () => cb()),
    open: (ctx) => ipcRenderer.invoke("recorder:open", ctx),
    context: () => ipcRenderer.invoke("recorder:context"),
    clock: () => ipcRenderer.invoke("recorder:clock"),
    overAnchor: (at, when) => ipcRenderer.invoke("recorder:overAnchor", at, when),
    narration: () => ipcRenderer.invoke("recorder:narration"),
    onFollow: (cb) => listen("recorder:follow", cb),
    onFollowState: (cb) => listen("recorder:followState", cb),
    sources: () => ipcRenderer.invoke("recorder:sources"),
    moveTo: (index) => ipcRenderer.invoke("recorder:moveTo", index),
    encoder: (monitor, fps) => ipcRenderer.invoke("recorder:encoder", monitor, fps),
    prepare: (opts) => ipcRenderer.invoke("recorder:prepare", opts),
    start: () => ipcRenderer.invoke("recorder:start"),
    systemAudioRoute: () => ipcRenderer.invoke("recorder:systemAudioRoute"),
    systemChunk: (bytes, startedAt, endedAt) =>
      ipcRenderer.invoke("recorder:systemChunk", bytes, startedAt, endedAt),
    pause: () => ipcRenderer.invoke("recorder:pause"),
    halt: () => ipcRenderer.invoke("recorder:halt"),
    resume: () => ipcRenderer.invoke("recorder:resume"),
    mark: (kind) => ipcRenderer.invoke("recorder:mark", kind),
    elapsed: () => ipcRenderer.invoke("recorder:elapsed"),
    interactive: (on) => ipcRenderer.invoke("recorder:interactive", on),
    uiRects: (rects) => ipcRenderer.invoke("recorder:uiRects", rects),
    teleprompterLine: (index, at) => ipcRenderer.invoke("recorder:teleprompterLine", index, at),
    monitorMic: (device) => ipcRenderer.invoke("recorder:monitorMic", device),
    cameraModes: (device, fps) => ipcRenderer.invoke("recorder:cameraModes", device, fps),
    windows: () => ipcRenderer.invoke("recorder:windows"),
    followWindow: (hwnd, front) => ipcRenderer.invoke("recorder:followWindow", hwnd, front),
    drawStroke: (stroke) => ipcRenderer.invoke("recorder:drawStroke", stroke),
    drawClear: (at) => ipcRenderer.invoke("recorder:drawClear", at),
    drawBoard: (on, kind, at) => ipcRenderer.invoke("recorder:drawBoard", on, kind, at),
    drawPage: (at) => ipcRenderer.invoke("recorder:drawPage", at),
    drawUndo: (at) => ipcRenderer.invoke("recorder:drawUndo", at),
    drawMode: (on) => ipcRenderer.invoke("recorder:drawMode", on),
    settings: () => ipcRenderer.invoke("recorder:settings"),
    saveSettings: (settings) => ipcRenderer.invoke("recorder:saveSettings", settings),
    hotkeys: () => ipcRenderer.invoke("recorder:hotkeys"),
    status: () => ipcRenderer.invoke("recorder:status"),
    cancel: () => ipcRenderer.invoke("recorder:cancel"),
    discard: () => ipcRenderer.invoke("recorder:discard"),
    stop: () => ipcRenderer.invoke("recorder:stop"),
    orphans: () => ipcRenderer.invoke("recorder:orphans"),
    recoverOrphan: (dir) => ipcRenderer.invoke("recorder:recoverOrphan", dir),
    discardOrphan: (dir) => ipcRenderer.invoke("recorder:discardOrphan", dir),
    imported: (dir) => ipcRenderer.invoke("recorder:imported", dir),
    debugCapture: (path) => ipcRenderer.invoke("recorder:debugCapture", path),
    onHotkey: (cb) => {
      const fn = (_e: unknown, name: string): void => {
        cb(name);
      };
      ipcRenderer.on("recorder:hotkey", fn);
      return () => ipcRenderer.removeListener("recorder:hotkey", fn);
    },
    onDone: (cb) => listen("recorder:done", cb),
    onStatus: (cb) => listen("recorder:status", cb),
    onEvent: (cb) => listen("recorder:event", cb),
    onHealth: (cb) => listen("recorder:health", cb),
    onLevel: (cb) => listen("recorder:level", cb),
    onHotkeys: (cb) => listen("recorder:hotkeys", cb),
    onState: (cb) => listen("recorder:state", cb),
    onAlert: (cb) => listen("recorder:alert", cb),
  },
  treatVoice: (jobId, path, preset) => ipcRenderer.invoke("audio:treat", jobId, path, preset),
  renderVoice: (jobId, segments, start, end) =>
    ipcRenderer.invoke("voice:render", jobId, segments, start, end),
  exportVoicePieces: (jobId, projectPath, projectJson, scope, pieces) =>
    ipcRenderer.invoke("voice:exportPieces", jobId, projectPath, projectJson, scope, pieces),
  pickPresenterVideos: () => ipcRenderer.invoke("presenter:pick"),
  locatePresenter: (jobId, video, masters) =>
    ipcRenderer.invoke("presenter:locate", jobId, video, masters),
  saveGenerated: (bytes, ext) => ipcRenderer.invoke("media:saveGenerated", bytes, ext),
  saveNarration: (bytes) => ipcRenderer.invoke("media:saveNarration", bytes),
  stillFrame: (path, t, alpha) => ipcRenderer.invoke("media:still", path, t, alpha),
  audioSnippet: (path, t, seconds, ticket) =>
    ipcRenderer.invoke("media:audioSnippet", path, t, seconds, ticket),
  filmstrip: (jobId, path, input, duration) =>
    ipcRenderer.invoke("media:filmstrip", jobId, path, input, duration),
  detectScreen: (path, duration, width, height) =>
    ipcRenderer.invoke("key:detect", path, duration, width, height),
  grabFrame: (path, t, width, height, maxSide) =>
    ipcRenderer.invoke("key:frame", path, t, width, height, maxSide),
  renderKeyed: (jobId, path, width, height, fps, duration, key) =>
    ipcRenderer.invoke("key:render", jobId, path, width, height, fps, duration, key),
  exists: (paths) => ipcRenderer.invoke("fs:exists", paths),
  createProject: (name, course, settings, fileName) =>
    ipcRenderer.invoke("project:create", name, course, settings, fileName),
  saveProject: (path, projectJson) => ipcRenderer.invoke("project:save", path, projectJson),
  openProject: (path) => ipcRenderer.invoke("project:open", path),
  recentProjects: () => ipcRenderer.invoke("project:recent"),
  removeRecent: (path) => ipcRenderer.invoke("project:removeRecent", path),
  duplicateProject: (path) => ipcRenderer.invoke("project:duplicate", path),
  renameProject: (path, name) => ipcRenderer.invoke("project:rename", path, name),
  projectBackups: (path) => ipcRenderer.invoke("project:backups", path),
  restoreBackup: (path, id) => ipcRenderer.invoke("project:restoreBackup", path, id),
  startExport: (jobId, projectJson, spec) =>
    ipcRenderer.invoke("export:start", jobId, projectJson, spec),
  pickFramePath: (defaultName) => ipcRenderer.invoke("dialog:framePng", defaultName),
  exportFramePng: (jobId, projectJson, t, spec) =>
    ipcRenderer.invoke("export:framePng", jobId, projectJson, t, spec),
  pickStems: (videoName) => ipcRenderer.invoke("dialog:stems", videoName),
  packProject: (jobId, projectJson, defaultName) =>
    ipcRenderer.invoke("project:pack", jobId, projectJson, defaultName),
  openPackage: () => ipcRenderer.invoke("project:openPackage"),
  listLibrary: () => ipcRenderer.invoke("library:list"),
  saveLibrary: (library) => ipcRenderer.invoke("library:save", library),
  cancelJob: (jobId) => ipcRenderer.invoke("job:cancel", jobId),
  clearExportCache: () => ipcRenderer.invoke("exportCache:clear"),
  exportQueue: {
    load: () => ipcRenderer.invoke("exportQueue:load"),
    save: (itemsJson) => ipcRenderer.invoke("exportQueue:save", itemsJson),
  },
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
  setExternalModels: (on) => ipcRenderer.invoke("whisper:externalModels", on),
  transcribe: (jobId, path, duration, language, glossary) =>
    ipcRenderer.invoke("whisper:transcribe", jobId, path, duration, language, glossary),
  getGlossary: (course) => ipcRenderer.invoke("glossary:get", course),
  setGlossary: (course, terms) => ipcRenderer.invoke("glossary:set", course, terms),
  openRestrictedClaude: () => ipcRenderer.invoke("ai:openRestrictedClaude"),
  aiSettings: () => ipcRenderer.invoke("ai:settings"),
  saveAiSettings: (changes) => ipcRenderer.invoke("ai:saveSettings", changes),
  testApiKey: () => ipcRenderer.invoke("ai:testKey"),
  codexSelfTest: () => ipcRenderer.invoke("ai:codexSelfTest"),
  aiGrants: () => ipcRenderer.invoke("ai:grants"),
  revokeAiGrant: (id) => ipcRenderer.invoke("ai:revokeGrant", id),
  createManualAiToken: () => ipcRenderer.invoke("ai:manualToken"),
  onAiApproval: (cb) => {
    const listener = (
      _e: unknown,
      request: AiApprovalRequest | { id: string; closed: true },
    ): void => {
      cb(request);
    };
    ipcRenderer.on("ai:approval", listener);
    return () => ipcRenderer.removeListener("ai:approval", listener);
  },
  answerAiApproval: (id, choice, projectId) =>
    ipcRenderer.invoke("ai:approval-answer", id, choice, projectId),
  setAiContext: (context) => ipcRenderer.invoke("ai:context", context),
  aiClients: () => ipcRenderer.invoke("ai:clients"),
  connectAiClient: (id, rotate) => ipcRenderer.invoke("ai:connect", id, rotate ?? false),
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
      let result: { ok: boolean; text: string; images?: ToolImage[] };
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
