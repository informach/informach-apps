const { app, BrowserWindow } = require("electron");
const { isAbsolute } = require("node:path");

const profile = process.argv[2];
if (!profile || !isAbsolute(profile)) throw new Error("An isolated fixture profile is required");
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 480,
    height: 320,
    title: "Edi isolated launcher fixture",
    webPreferences: { sandbox: true },
  });
  await window.loadURL(
    "data:text/html,<title>Edi isolated launcher fixture</title><button>Conectar conta</button>",
  );
});
app.on("window-all-closed", () => app.quit());
// A failed launcher cannot leave this fixture running in a developer's session.
setTimeout(() => app.quit(), 15_000).unref();
