import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import { strFromU8, unzipSync } from "fflate";
import type { ElectronApplication, Page } from "playwright";
import { trackNativeChild, verifyNativeClose } from "../../../scripts/edi/native-diagnostics.mts";
import { createNativeHarness, nativeTooling } from "../../../scripts/edi/native-harness.mts";
import { parseProject } from "../src/shared/project";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("Informe um projeto editável e uma pasta nova de evidências.");
const source = resolve(sourceArgument);
const output = resolve(outputArgument);
const original = await readFile(source);
const sourceSha256 = createHash("sha256").update(original).digest("hex");
const project = parseProject(JSON.parse(original.toString("utf8")));
await mkdir(output, { recursive: false });
process.chdir(resolve(import.meta.dirname, "../../.."));
const { packageManager } = nativeTooling();
const harness = await createNativeHarness("edi-web-export-", packageManager);
let application: ElectronApplication | undefined;
let lifecycle: ReturnType<typeof trackNativeChild> | undefined;
let editor: Page | undefined;
const failures: unknown[] = [];
const report: Record<string, unknown> = {
  source: basename(source),
  sourceProjectId: project.id,
  sourceSha256,
  passed: false,
  limitation:
    "Native file selection is deterministic. The renderer, IPC, payload validation and atomic file writer are real.",
};
try {
  await harness.build("edisvg");
  const launched = await harness.launch("edisvg", {
    userData: resolve(harness.root, "user-data"),
    suiteData: resolve(harness.root, "suite"),
  });
  application = launched;
  lifecycle = trackNativeChild(launched.process());
  await launched.firstWindow({ timeout: 30000 });
  await harness.seedLease(launched, 300);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !editor) {
    for (const page of launched.windows()) {
      if (!page.isClosed() && (await page.evaluate(() => "desktop" in window).catch(() => false))) {
        editor = page;
        break;
      }
    }
    if (!editor) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(editor, "A janela do editor não abriu.");
  const copy = resolve(harness.root, "source.edisvg");
  await writeFile(copy, original, { flag: "wx" });
  await launched.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.source] });
      // Only this disposable profile is in scope. Discard its initial unnamed draft.
      dialog.showMessageBox = async (windowOrOptions, maybeOptions?) => {
        const options = maybeOptions ?? windowOrOptions;
        if (
          !options ||
          typeof options !== "object" ||
          !("buttons" in options) ||
          !Array.isArray(options.buttons)
        )
          throw new Error("Confirmação inesperada no teste.");
        const response = options.buttons.indexOf("Descartar");
        if (response < 0) throw new Error("O teste não autoriza outra confirmação.");
        return { response, checkboxChecked: false };
      };
      dialog.showSaveDialog = async (windowOrOptions, maybeOptions?) => {
        const options = maybeOptions ?? windowOrOptions;
        if (
          !options ||
          typeof options !== "object" ||
          !("defaultPath" in options) ||
          typeof options.defaultPath !== "string"
        )
          throw new Error("Destino sem extensão.");
        if (options.defaultPath.endsWith(".web-player.zip"))
          return { canceled: false, filePath: paths.player };
        if (options.defaultPath.endsWith(".edi-animation.json"))
          return { canceled: false, filePath: paths.art };
        throw new Error("O teste não autoriza outro formato.");
      };
    },
    {
      source: copy,
      player: resolve(output, "player.web-player.zip"),
      art: resolve(output, "art.edi-animation.json"),
    },
  );
  editor.setDefaultTimeout(15000);
  await editor.locator('[data-action="export"]').waitFor();
  await launched.evaluate(({ Menu, BrowserWindow }) => {
    const fileMenu = Menu.getApplicationMenu()?.items.find(
      (item) => item.label === "Arquivo",
    )?.submenu;
    const item = fileMenu?.items.find((value) => value.label.startsWith("Abrir projeto"));
    if (!item) throw new Error("O comando de abrir projeto não está no menu.");
    item.click(item, BrowserWindow.getFocusedWindow() ?? undefined, {
      triggeredByAccelerator: false,
    });
  });
  await editor.waitForFunction(() =>
    document.querySelector(".project>span")?.textContent?.includes("source.edisvg"),
  );
  const before = await editor.evaluate(() => localStorage.getItem("edisvg-project"));
  await editor.locator('[data-action="export"]').click();
  const dialog = editor.locator("#export-dialog");
  await dialog.locator('input[name="format"][value="player-web"]').check();
  await dialog.getByRole("button", { name: "Baixar player para outro aplicativo" }).click();
  await editor.waitForFunction(() => !document.querySelector("#export-dialog button[disabled]"));
  // File presence is observed through bounded polling, not a fixed delay after clicking.
  async function saved(path: string) {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      try {
        return await readFile(path);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("O arquivo não foi gravado.");
  }
  const player = await saved(resolve(output, "player.web-player.zip"));
  const zip = unzipSync(player);
  const manifest = zip["manifest.json"];
  assert.ok(manifest);
  assert.equal(JSON.parse(strFromU8(manifest)).format, "edi-web-player");
  assert.ok(zip["edi-web-player.mjs"]);
  await dialog.locator("#download").click();
  const art = await saved(resolve(output, "art.edi-animation.json"));
  const artifact = parseAnimationArtifact(art.toString("utf8"));
  assert.ok(artifact.poster && artifact.document.content.length);
  assert.equal(await editor.evaluate(() => localStorage.getItem("edisvg-project")), before);
  assert.equal(
    createHash("sha256")
      .update(await readFile(source))
      .digest("hex"),
    sourceSha256,
  );
  await editor.screenshot({ path: resolve(output, "editor.png") });
  Object.assign(report, {
    passed: true,
    artSha256: createHash("sha256").update(art).digest("hex"),
    playerSha256: createHash("sha256").update(player).digest("hex"),
    title: artifact.title,
  });
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  if (editor && !editor.isClosed()) {
    try {
      await editor.screenshot({ path: resolve(output, "failed.png") });
      await writeFile(resolve(output, "failed.html"), await editor.content());
    } catch (captureError) {
      report.captureError = String(captureError);
    }
  }
  failures.push(error);
} finally {
  const cleanup: unknown[] = [];
  const closeStarted = performance.now();
  try {
    if (application && lifecycle)
      await verifyNativeClose(application.process(), lifecycle.completion, application.close());
    report.closeElapsedMs = performance.now() - closeStarted;
  } catch (error) {
    cleanup.push(error);
    const child = application?.process();
    if (child && child.exitCode === null) child.kill();
  }
  cleanup.push(...(await harness.dispose()));
  report.cleanupFailures = cleanup.map(String);
  failures.push(...cleanup);
  if (failures.length) report.passed = false;
  await writeFile(resolve(output, "receipt.json"), JSON.stringify(report, null, 2), { flag: "wx" });
}
if (failures.length) throw new AggregateError(failures, "Falha no teste nativo ou em sua limpeza.");
