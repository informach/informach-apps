import { toolIdSchema } from "@informach/edi-contracts";
import { exposeEdiBridge } from "@informach/edi-desktop/preload";
import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import { type HubBridge, installActivitySchema, installationSchema } from "../shared/hub";

exposeEdiBridge();
const bridge: HubBridge = {
  list: async () => z.array(installationSchema).parse(await ipcRenderer.invoke("hub:list")),
  install: (id) => ipcRenderer.invoke("hub:install", toolIdSchema.parse(id)),
  open: (id) => ipcRenderer.invoke("hub:open", toolIdSchema.parse(id)),
  onActivity: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(z.array(installActivitySchema).parse(value));
    ipcRenderer.on("hub:activity", listener);
    return () => {
      ipcRenderer.removeListener("hub:activity", listener);
    };
  },
};
contextBridge.exposeInMainWorld("ediHub", bridge);
