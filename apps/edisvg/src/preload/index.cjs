const { contextBridge, ipcRenderer } = require("electron");
require("@informach/edi-desktop/preload").protectEditor();
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("desktop", {
  projectInitialize: (legacy) => ipcRenderer.invoke("project:initialize", legacy),
  projectNew: () => ipcRenderer.invoke("project:new"),
  importSvg: () => ipcRenderer.invoke("svg:import"),
  importGameProject: () => ipcRenderer.invoke("game:import"),
  pipelinesRead: () => ipcRenderer.invoke("pipelines:read"),
  pipelinesWrite: (store) => ipcRenderer.invoke("pipelines:write", store),
  pipelinePick: (kind) => ipcRenderer.invoke("pipeline:pick", kind),
  pipelineReadProject: (token) => ipcRenderer.invoke("pipeline:read-project", token),
  pipelineWords: (token, kind, jobId) => ipcRenderer.invoke("pipeline:words", token, kind, jobId),
  pipelineNarration: (token, kind, start, end) =>
    ipcRenderer.invoke("pipeline:narration", token, kind, start, end),
  pipelineCancel: (jobId) => ipcRenderer.invoke("pipeline:cancel", jobId),
  onPipelineProgress: (callback) => subscribe("pipeline:progress", callback),
  importAsset: () => ipcRenderer.invoke("asset:import"),
  projectOpen: () => ipcRenderer.invoke("project:open"),
  projectSave: (project, as = false) => ipcRenderer.invoke("project:save", project, as),
  projectChanged: (project) => ipcRenderer.invoke("project:changed", project),
  exportFile: (payload) => ipcRenderer.invoke("export:save", payload),
  aiStatus: () => ipcRenderer.invoke("ai:status"),
  aiConnect: (client) => ipcRenderer.invoke("ai:connect", client),
  aiSend: (request) => ipcRenderer.invoke("ai:send", request),
  aiStop: () => ipcRenderer.invoke("ai:stop"),
  onAssistantEvent: (callback) => subscribe("ai:event", callback),
  onCommand: (callback) => subscribe("app:command", callback),
  handleAiTools: (callback) =>
    subscribe("ai:call", async (call) => {
      let result;
      try {
        result = await callback(call);
      } catch (error) {
        result = { ok: false, text: error.message };
      }
      await ipcRenderer.invoke("ai:result", call.id, result);
    }),
});
