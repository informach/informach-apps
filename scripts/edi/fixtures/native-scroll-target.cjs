// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct isolated test child; never cached or invoked through Turbo.
// Owned synthetic input target, deliberately outside the EdiCaptura process.
const { app, BrowserWindow } = require("electron");
const { mkdirSync } = require("node:fs");
const { isAbsolute, join } = require("node:path");
const profile = process.env.EDI_NATIVE_SCROLL_PROFILE;
if (!profile || !isAbsolute(profile) || app.isReady() || app.isPackaged)
  throw new Error("Synthetic target requires an isolated profile before ready");
for (const name of ["userData", "sessionData", "logs", "crashDumps"]) {
  const directory = name === "userData" ? profile : join(profile, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
  if (app.getPath(name) !== directory) throw new Error("Synthetic profile mismatch");
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 320,
    height: 240,
    frame: false,
    show: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL("data:text/html,<html><body style='margin:0'></body></html>");
  window.setTitle("EDI synthetic scroll target");
});
