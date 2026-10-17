const assert = require("node:assert/strict");
const { renameSync, writeFileSync } = require("node:fs");
const { isAbsolute } = require("node:path");
const { app, BrowserWindow } = require("electron");
const { profile, result } = require("./configuration.json");

assert.ok(typeof profile === "string" && isAbsolute(profile));
assert.ok(typeof result === "string" && isAbsolute(result));
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 480,
    height: 320,
    title: "Edi installation manager fixture",
    webPreferences: { sandbox: true },
  });
  await window.loadURL(
    "data:text/html,<title>Edi installation manager fixture</title><button>Conectar conta</button>",
  );
  writeFileSync(`${result}.tmp`, JSON.stringify({ pid: process.pid, visible: window.isVisible() }));
  renameSync(`${result}.tmp`, result);
  window.close();
});
app.on("window-all-closed", () => app.quit());
setTimeout(() => app.quit(), 15_000).unref();
