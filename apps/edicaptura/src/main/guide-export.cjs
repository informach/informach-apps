const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * Prints the guide's own HTML to PDF in a hidden Chromium window: no script, an in-memory
 * session, a local file that is removed afterwards. Chromium lays out the Unicode text and the
 * embedded images; no PDF library is needed in the Captura.
 */
async function guidePdf(html, { app, BrowserWindow }) {
  const dir = await fs.mkdtemp(path.join(app.getPath("temp"), "edicaptura-guide-"));
  const file = path.join(dir, "guia.html");
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "edicaptura-guide-print",
    },
  });
  try {
    await fs.writeFile(file, html, { flag: "wx" });
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await win.loadFile(file);
    return await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
  } finally {
    win.destroy();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
module.exports = { guidePdf };
