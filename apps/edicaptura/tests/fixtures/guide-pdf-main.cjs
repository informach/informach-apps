// Electron entry for tests/guide-pdf-native.cjs: prints one HTML file with the app's own
// guidePdf and reports the result. Isolated profile, no window shown.
const fs = require("node:fs/promises");
const { app, BrowserWindow } = require("electron");
const { guidePdf } = require("../../src/main/guide-export.cjs");

const flag = (name) =>
  process.argv.find((value) => value.startsWith(`--fixture-${name}=`))?.slice(name.length + 11);
const [html, output, profile] = ["html", "output", "profile"].map(flag);
require("node:fs").mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
// The print window is the only one here: keep the app alive when it closes, as the editor does.
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    const ours = async () =>
      (await fs.readdir(app.getPath("temp"))).filter((name) =>
        name.startsWith("edicaptura-guide-"),
      );
    const before = new Set(await ours());
    const pdf = await guidePdf(await fs.readFile(html, "utf8"), { app, BrowserWindow });
    await fs.writeFile(output, pdf);
    const leftovers = (await ours()).filter((name) => !before.has(name));
    // Electron on Windows does not reliably forward stdout to a pipe: report through a file.
    await fs.writeFile(
      `${output}.json`,
      JSON.stringify({ bytes: pdf.length, leftovers: leftovers.length }),
    );
    app.exit(0);
  } catch (error) {
    await fs.writeFile(`${output}.error`, String(error.stack)).catch(() => undefined);
    app.exit(1);
  }
});
