import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import { verifyFotoNativeJourney } from "../../apps/edifoto/scripts/native-journey.mts";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools.ts";
import { desktopAppIdSchema } from "../../packages/edi-contracts/src/index.ts";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";
import { observeNativeStartup } from "./native-diagnostics.mts";
import {
  createNativeHarness,
  execute,
  nativeTooling,
  raiseFailures,
  waitForStatus,
} from "./native-harness.mts";
import { verifyNativeInstallationIntegrity } from "./native-installation.mts";

const { packageManager, electronPath } = nativeTooling();
const selected = process.argv.slice(2).map((id) => desktopAppIdSchema.parse(id));
const applications = selected.length ? selected : EDI_DESKTOP_APPS.map((app) => app.id);
const harness = await createNativeHarness("edi-native-", packageManager);
const { root } = harness;
const results = resolve(".cache/edi-native-results");
await mkdir(results, { recursive: true });
const seedLease = harness.seedLease;

async function verifyDeniedBridge(page: Page, path: string[], args: unknown[] = []) {
  const result = await page.evaluate(
    async (call) => {
      let owner: unknown = window;
      for (const part of call.path.slice(0, -1)) {
        if (!owner || typeof owner !== "object") throw new Error("Missing editor bridge");
        owner = Reflect.get(owner, part);
      }
      const name = call.path.at(-1);
      if (!name || !owner || typeof owner !== "object") throw new Error("Missing editor operation");
      const operation: unknown = Reflect.get(owner, name);
      if (typeof operation !== "function") throw new Error("Missing editor operation");
      try {
        await Reflect.apply(operation, owner, call.args);
        return { allowed: true, error: null };
      } catch (error) {
        return { allowed: false, error: error instanceof Error ? error.message : "unknown" };
      }
    },
    { path, args },
  );
  assert.equal(result.allowed, false);
  assert.match(result.error ?? "", /edi_access_restricted/);
}

async function verifyNativeDialog(page: Page, openerName: string, dialogName: string) {
  const opener = page.getByRole("button", { name: openerName }).first();
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.evaluate((element) => element.matches(":modal")), true);
  const focusable = dialog.locator(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
  );
  const first = focusable.first();
  const last = focusable.last();
  await first.focus();
  await first.press("Shift+Tab");
  assert.equal(await last.evaluate((element) => element === document.activeElement), true);
  await last.press("Tab");
  assert.equal(await first.evaluate((element) => element === document.activeElement), true);
  await page.screenshot({ path: join(results, `${dialogName.replace(/\s+/g, "-")}-modal.png`) });
  await first.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await opener.evaluate((element) => element === document.activeElement), true);
}
const runFailures: unknown[] = [];
try {
  await verifyNativeInstallationIntegrity(root, electronPath);
  for (const id of applications) {
    console.log(`Native verification: ${id}`);
    const userData = join(root, id, "user-data");
    const suiteData = join(root, id, "suite");
    await mkdir(userData, { recursive: true });
    await mkdir(join(userData, "documents"), { recursive: true });
    await harness.build(id);
    const application = await harness.launch(id, { userData, suiteData });
    // Native save dialogs must default to this fixture, never the runner/user's Pictures folder.
    await application.evaluate(
      ({ app }, pictures) => app.setPath("pictures", pictures),
      join(userData, "documents"),
    );
    const startup = observeNativeStartup(application, [root, resolve("."), tmpdir()]);
    let closed = false;
    application.once("close", () => {
      closed = true;
    });
    const failures: unknown[] = [];
    let startupFailed = false;
    let diagnosticEditor: Page | undefined;
    try {
      assert.equal(await application.evaluate(() => process.execPath), electronPath);
      const first = await application.firstWindow().catch(async (error: unknown) => {
        startupFailed = true;
        console.error(
          `Native startup diagnostic (${id}):`,
          JSON.stringify(await startup.snapshot()),
        );
        throw error;
      });
      await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
      assert.equal(
        await first.evaluate(async () => (await window.ediSuite.status()).state),
        "restricted",
      );
      await first.screenshot({ path: join(results, `${id}-restricted-start.png`) });
      const editorReady = (
        id === "edi-hub" ? Promise.resolve(first) : application.waitForEvent("window")
      ).then(
        (page) => ({ page }),
        (error: unknown) => ({ error }),
      );
      await seedLease(application, 60);
      const editorResult = await editorReady;
      if (!("page" in editorResult)) throw editorResult.error;
      const editor = editorResult.page;
      diagnosticEditor = editor;
      const pageErrors: string[] = [];
      editor.on("pageerror", (error) => pageErrors.push(error.message));
      await editor.waitForFunction(() => typeof window.ediSuite !== "undefined");
      await waitForStatus(editor, "licensed");
      await editor.evaluate(() => window.ediSuite.refresh());
      assert.equal(
        await editor.evaluate(async () => (await window.ediSuite.status()).offline),
        true,
      );
      await editor.screenshot({ path: join(results, `${id}-licensed.png`) });
      if (id === "ediaula") await verifyNativeDialog(editor, "Novo projeto", "Novo projeto");
      if (id === "edifoto") {
        await verifyNativeDialog(editor, "Novo…", "Novo documento");
        await seedLease(application, 300);
        await verifyFotoNativeJourney(editor, application, root, results);
      }
      if (id === "ediaula") {
        const sentinel = join(userData, "documents", "unselected.mp4");
        await writeFile(sentinel, "preserve previous output");
        const error = await editor.evaluate(async (outPath) => {
          const bridge: unknown = Reflect.get(window, "api");
          if (!bridge || typeof bridge !== "object") throw new Error("Missing EdiAula bridge");
          const start: unknown = Reflect.get(bridge, "startExport");
          if (typeof start !== "function") throw new Error("Missing export operation");
          try {
            // The editor sends the project as JSON text (one IPC node however big it is).
            await Reflect.apply(start, bridge, [
              "native-regression",
              JSON.stringify({
                version: 1,
                id: "native-regression",
                name: "Regression",
                createdAt: 0,
                updatedAt: 0,
                settings: { width: 128, height: 128, fps: 30 },
                assets: [],
                tracks: [],
                clips: [],
              }),
              {
                outPath,
                width: 128,
                height: 128,
                fps: 30,
                videoBitrate: 100,
                normalizeLoudness: false,
                encoder: "x264",
              },
            ]);
            return null;
          } catch (failure) {
            return failure instanceof Error ? failure.message : String(failure);
          }
        }, sentinel);
        assert.match(error ?? "", /destino/);
        assert.equal(await readFile(sentinel, "utf8"), "preserve previous output");
      }
      if (id === "edi-hub") {
        await seedLease(application, 3);
        await waitForStatus(editor, "restricted");
        await verifyDeniedBridge(editor, ["ediHub", "open"], ["edifoto"]);
      } else {
        assert.equal(
          first.isClosed(),
          true,
          "The access gate must close only after the editor exists",
        );
        const modalName =
          id === "ediaula" ? "Novo projeto" : id === "edifoto" ? "Novo documento" : null;
        if (modalName) {
          await editor.evaluate(() => {
            const marker = document.createElement("div");
            marker.id = "native-inert-sentinel";
            marker.inert = true;
            document.body.append(marker);
          });
          await editor
            .getByRole("button", { name: id === "ediaula" ? "Novo projeto" : "Novo…" })
            .first()
            .click();
          await editor
            .getByRole("dialog", { name: modalName, exact: true })
            .waitFor({ state: "visible" });
        }
        await seedLease(application, 3);
        await waitForStatus(editor, "restricted");
        const shield = editor.getByRole("dialog", { name: "Acesso à Suíte Edi", exact: true });
        await shield.waitFor({ state: "visible" });
        assert.equal(
          await shield.evaluate(
            (element) =>
              element.matches(":modal") &&
              element.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)),
          ),
          true,
          "License restriction must cover existing native modals",
        );
        await editor.keyboard.press("Escape");
        assert.equal(
          await shield.evaluate((element) => element.matches(":modal")),
          true,
          "Escape cannot dismiss license restrictions",
        );
        const connect = shield.getByRole("button", { name: "Conectar conta", exact: true });
        await connect.focus();
        await connect.press("Shift+Tab");
        assert.equal(
          await editor.evaluate(() => document.activeElement?.textContent),
          "Salvar trabalho existente",
        );
        const refresh = shield.getByRole("button", { name: "Verificar acesso", exact: true });
        await refresh.focus();
        await refresh.press("Enter");
        await waitForStatus(
          editor,
          "restricted",
          "Não foi possível validar o acesso. Conecte-se à internet.",
        );
        const operations = {
          ediaula: ["api", "listPalettes"],
          edifoto: ["api", "aiSettings"],
          edipdf: ["api", "signatures", "list"],
          edisvg: ["desktop", "projectNew"],
          edicaptura: ["edi", "monitors"],
        };
        await verifyDeniedBridge(editor, operations[id]);
        if (modalName) {
          await seedLease(application, 60);
          await waitForStatus(editor, "licensed");
          const preserved = editor.getByRole("dialog", { name: modalName, exact: true });
          assert.equal(
            await editor.evaluate(() => document.getElementById("native-inert-sentinel")?.inert),
            true,
            "License restoration must not enable a previously inert root",
          );
          await editor.evaluate(() => document.getElementById("native-inert-sentinel")?.remove());
          assert.equal(
            await preserved.evaluate((element) => element.matches(":modal")),
            true,
            "Restoring access must preserve the editor's open dialog",
          );
          await editor.keyboard.press("Escape");
          await preserved.waitFor({ state: "detached" });
          await seedLease(application, 3);
          await waitForStatus(editor, "restricted");
        }
      }
      await editor.screenshot({ path: join(results, `${id}-expired.png`) });
      assert.deepEqual(pageErrors, [], "Editor emitted an unhandled error");
      if (id === "edisvg") {
        const nativePid = await application.evaluate(() => process.pid);
        const nativeWindow = await application.browserWindow(editor);
        await nativeWindow.evaluate((window) => window.close());
        await execute(
          "powershell.exe",
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-File",
            resolve("scripts/edi/respond-test-draft.ps1"),
            "-TestProcessId",
            String(nativePid),
            "-Choice",
            "Cancelar",
          ],
          {
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 32768,
            env: windowsPowerShellEnvironment(),
          },
        );
        assert.equal(editor.isClosed(), false, "Canceling close must preserve the existing draft");
        assert.ok(await editor.evaluate(() => localStorage.getItem("edisvg-project")));
      }
      console.log(`Verified gate, valid signed offline lease, expiration and IPC denial: ${id}`);
    } catch (error) {
      failures.push(error);
      if (diagnosticEditor && !diagnosticEditor.isClosed()) {
        try {
          await diagnosticEditor.screenshot({ path: join(results, `${id}-failure.png`) });
        } catch (screenshotError) {
          failures.push(screenshotError);
        }
      }
    } finally {
      try {
        if (!closed) {
          const nativePid = await application.evaluate(() => process.pid);
          const closing = application.close().then(
            () => ({}),
            (error: unknown) => ({ error }),
          );
          if (id === "edisvg" || id === "edifoto")
            await execute(
              "powershell.exe",
              [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-File",
                resolve(
                  id === "edifoto"
                    ? "apps/edifoto/scripts/respond-native-close.ps1"
                    : "scripts/edi/respond-test-draft.ps1",
                ),
                "-TestProcessId",
                String(nativePid),
              ],
              {
                windowsHide: true,
                timeout: 30000,
                maxBuffer: 32768,
                env: windowsPowerShellEnvironment(),
              },
            );
          const result = await closing;
          if ("error" in result) failures.push(result.error);
        }
      } catch (error) {
        failures.push(error);
      }
      if (startupFailed)
        console.error(`Native startup cleanup (${id}):`, JSON.stringify(await startup.snapshot()));
      startup.dispose();
    }
    raiseFailures(failures, `Native verification and cleanup failed: ${id}`);
  }
} catch (error) {
  runFailures.push(error);
} finally {
  runFailures.push(...(await harness.dispose()));
}
raiseFailures(runFailures, "Native verification and resource cleanup failed");
console.log(
  "Native tests completed with ephemeral keys and isolated profiles. No installer was installed or published.",
);
