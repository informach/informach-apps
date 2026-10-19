import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { app, BrowserWindow } from "electron";
import { flattenPrint, printPrepared } from "../../src/main/pdf-printer.ts";
import { DEFAULT_PRINT_SETTINGS } from "../../src/shared/print-format.ts";

const root = resolve(process.argv[2] ?? "");
if (
  dirname(root) !== resolve(tmpdir()) ||
  !/^edipdf-print-pipeline-[a-zA-Z0-9]+$/.test(basename(root))
)
  throw new Error("Invalid owned print fixture directory");
mkdirSync(join(root, "temporary"));
app.setPath("userData", join(root, "profile"));
app.setPath("temp", join(root, "temporary"));
app.on("window-all-closed", () => {});
void app
  .whenReady()
  .then(async () => {
    const owner = new BrowserWindow({
      width: 400,
      height: 250,
      show: true,
      title: "Isolated EdiPDF print test",
      webPreferences: { sandbox: true },
    });
    await owner.loadURL(
      "data:text/html,<title>Isolated EdiPDF print test</title><p>Print cancellation fixture</p>",
    );
    const bytes = new Uint8Array(await readFile(join(root, "input.pdf")));
    const result = await flattenPrint(
      {
        bytes,
        pdf: bytes,
        pages: 3,
        warnings: [],
        extension: "pdf",
        detail: { kind: "printing", stage: "input", settings: DEFAULT_PRINT_SETTINGS },
      },
      async () => {},
      new AbortController().signal,
    );
    await writeFile(join(root, "flattened.pdf"), result.pdf);
    if (process.argv[3] === "--cancel-dialog") {
      await writeFile(join(root, "pid.txt"), String(process.pid));
      if (result.detail?.kind !== "printing") throw new Error("Missing printing detail");
      const submission =
        process.argv[4] === "--html-dialog"
          ? await new Promise<{ submitted: boolean }>((resolve, reject) => {
              owner.webContents.print(
                { silent: false, deviceName: "OneNote (Desktop)", pageSize: "A4" },
                (success, failure) =>
                  failure && failure !== "Print job canceled"
                    ? reject(new Error(failure))
                    : resolve({ submitted: success }),
              );
            })
          : await printPrepared(
              {
                ...result,
                detail: {
                  ...result.detail,
                  stage: "output",
                  settings: {
                    ...result.detail.settings,
                    printer: "OneNote (Desktop)",
                    paper: "a4",
                  },
                },
              },
              async () => {
                console.log("Isolated system print checkpoint");
              },
              new AbortController().signal,
            );
      if (submission.submitted)
        throw new Error("The fixture must cancel printing and never submit a print job.");
    }
    await writeFile(
      join(root, "result.json"),
      JSON.stringify({
        stage: result.detail?.kind === "printing" ? result.detail.stage : undefined,
        warnings: result.warnings,
      }),
    );
    app.quit();
  })
  .catch(async (failure: unknown) => {
    console.error(failure instanceof Error ? failure.message : "Printer fixture failed");
    await writeFile(
      join(root, "result.json"),
      JSON.stringify({
        error: failure instanceof Error ? failure.message : "Printer fixture failed",
      }),
    );
    app.exit(1);
  });
