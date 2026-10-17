const { contextBridge, ipcRenderer } = require("electron");
require("@informach/edi-desktop/preload").protectEditor();
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);
const on = (channel) => (callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("edi", {
  close: invoke("app:close"),
  onBeforeClose: on("before-close"),
  capture: invoke("capture:start"),
  selection: invoke("capture:init"),
  select: invoke("capture:select"),
  cancel: invoke("capture:cancel"),
  monitors: invoke("capture:monitors"),
  setMonitor: invoke("capture:monitor"),
  onMonitors: on("monitors-changed"),
  list: invoke("library:list"),
  read: invoke("library:read"),
  save: invoke("library:save"),
  importImage: invoke("image:import"),
  copy: invoke("image:copy"),
  export: invoke("file:export"),
  status: invoke("app:status"),
  controlState: invoke("control:state"),
  nextSegment: invoke("control:next"),
  finish: invoke("control:finish"),
  beginRecording: invoke("record:begin"),
  recordReady: invoke("record:ready"),
  recordSave: invoke("record:save"),
  recordFailed: invoke("record:failed"),
  onDocument: on("document"),
  onNotice: on("notice"),
  onStop: on("record-stop"),
  onControl: on("control-update"),
  onControlError: on("control-error"),
});
