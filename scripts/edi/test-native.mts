import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
      if (id === "edisvg")
        await application.evaluate(
          ({ app }, documents) => app.setPath("documents", documents),
          join(userData, "documents"),
        );
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
        if (id === "edisvg") {
          // This journey includes several real native dialogs. Its valid lease
          // covers the bounded journey; expiration is tested explicitly below.
          await seedLease(application, 300);
          await editor.locator(".scene-artwork>svg").waitFor();
          const workerAssets = (await readdir(resolve("apps/edisvg/out/renderer/assets"))).filter(
            (name) => /^documentWorker-.*\.js$/.test(name),
          );
          assert.equal(workerAssets.length, 1, "Exactly one compiled document worker must ship");
          const workerAsset = workerAssets[0];
          if (!workerAsset) throw new Error("Missing document worker asset");
          const workerProbe = await editor.evaluate(async (asset) => {
            const original = localStorage.getItem("edisvg-project"),
              project = JSON.parse(original ?? "null"),
              sessionId = crypto.randomUUID();
            if (!project?.id) throw new Error("Missing isolated project for worker probe");
            const response = await new Promise<unknown>((resolve, reject) => {
              const worker = new Worker(new URL(`assets/${asset}`, location.href), {
                type: "module",
              });
              const timer = setTimeout(() => {
                worker.terminate();
                reject(new Error("Native document worker exceeded its 10s deadline"));
              }, 10000);
              worker.onmessage = (event: MessageEvent<unknown>) => {
                clearTimeout(timer);
                worker.terminate();
                resolve(event.data);
              };
              worker.onerror = () => {
                clearTimeout(timer);
                worker.terminate();
                reject(new Error("Document worker failed under the real Electron file origin/CSP"));
              };
              worker.postMessage({
                version: 1,
                context: { project, sessionId, revision: 0 },
                request: {
                  projectId: project.id,
                  sessionId,
                  revision: 0,
                  commands: [
                    {
                      type: "motion",
                      command: {
                        type: "create-animation",
                        animation: {
                          id: "animation-native-worker-probe",
                          name: "Worker somente cópia",
                          fps: 30,
                          frames: 30,
                          mode: "once",
                          tracks: [],
                        },
                      },
                    },
                  ],
                },
              });
            });
            return { response, preserved: localStorage.getItem("edisvg-project") === original };
          }, workerAsset);
          assert.equal(workerProbe.preserved, true);
          z.object({
            ok: z.literal(true),
            result: z.object({
              changed: z.literal(true),
              revision: z.literal(1),
              project: z.object({
                motion: z.object({ animations: z.array(z.object({ id: z.string() })) }),
              }),
            }),
          }).parse(workerProbe.response);
          console.log(
            "Verified isolated document worker under Electron file origin/CSP without changing the open project",
          );
          const layoutProbe = await editor.evaluate(async () => {
            const original = localStorage.getItem("edisvg-project");
            const runtime = await import(new URL("edi-player.mjs", location.href).href);
            const host = document.createElement("div");
            host.style.cssText = "width:200px;height:100px;position:fixed;left:0;top:0";
            host.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g data-edi-object="node-layout"><rect x="0" y="0" width="40" height="20"/></g></svg>';
            document.body.append(host);
            let player:
              | {
                  inspectLayout(): { boxes: Map<string, { x: number; width: number }> } | null;
                  destroy(): void;
                }
              | undefined;
            try {
              const svg = host.querySelector("svg");
              if (!svg) throw new Error("Missing native layout SVG");
              player = await runtime.createInteractiveSvgPlayerAsync(
                svg,
                {
                  version: 1,
                  playback: {
                    version: 2,
                    motion: { version: 2, animations: [] },
                    objects: [
                      {
                        id: "node-layout",
                        transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
                      },
                    ],
                    sources: [
                      {
                        id: "node-layout",
                        objectId: "node-layout",
                        artboardId: "artboard-layout",
                        instancePath: [],
                      },
                    ],
                    drivers: [],
                  },
                  behavior: {
                    version: 1,
                    inputs: [],
                    machines: [],
                    bindings: [],
                    listeners: [],
                    events: [],
                    defaultMachineId: null,
                  },
                  content: [{ id: "node-layout", parentId: null, name: "Layout", tag: "rect" }],
                  layout: {
                    version: 1,
                    root: {
                      flow: "row",
                      direction: "ltr",
                      wrap: false,
                      padding: [10, 10, 10, 10],
                      gap: [0, 0],
                      justify: "start",
                      align: "start",
                      clip: true,
                      scroll: null,
                    },
                    containers: [],
                    items: [
                      {
                        targetId: "node-layout",
                        width: { kind: "fill", weight: 1 },
                        height: { kind: "fixed", value: 20 },
                        minWidth: 0,
                        maxWidth: 100000,
                        minHeight: 0,
                        maxHeight: 100000,
                        margin: [0, 0, 0, 0],
                        alignSelf: "auto",
                        aspectRatio: null,
                        position: { kind: "flow" },
                      },
                    ],
                  },
                },
                { autoplay: false, pauseOffscreen: false },
              );
              const box = player?.inspectLayout()?.boxes.get("node-layout");
              return {
                x: box?.x,
                width: box?.width,
                preserved: localStorage.getItem("edisvg-project") === original,
              };
            } finally {
              player?.destroy();
              host.remove();
            }
          });
          assert.deepEqual(layoutProbe, { x: 10, width: 180, preserved: true });
          console.log(
            "Verified bundled Yoga WASM layout under Electron file origin/CSP with no remote dependency",
          );
          const nativePid = await application.evaluate(() => process.pid);
          const rigJourney: unknown = await import(
            new URL("../../apps/edisvg/scripts/native-rig-journey.mts", import.meta.url).href
          );
          if (
            typeof rigJourney !== "object" ||
            rigJourney === null ||
            !("verifySvgNativeRigJourney" in rigJourney) ||
            typeof rigJourney.verifySvgNativeRigJourney !== "function"
          )
            throw new Error("Invalid EdiSVG native journey module");
          await rigJourney.verifySvgNativeRigJourney(
            editor,
            join(results, "edisvg-rig-runtime.png"),
          );
          const destination = join(root, "edisvg-test-project.edisvg");
          const respond = (action: "Save" | "Open" | "Cancel", selectedPath = destination) =>
            execute(
              "powershell.exe",
              [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-File",
                resolve("scripts/edi/respond-test-file.ps1"),
                "-TestProcessId",
                String(nativePid),
                "-Action",
                action,
                "-SelectedPath",
                selectedPath,
              ],
              {
                windowsHide: true,
                timeout: 30_000,
                maxBuffer: 32768,
                env: windowsPowerShellEnvironment(),
              },
            );
          const invoke = (method: string) =>
            editor.evaluate(async (operation) => {
              const desktop: unknown = Reflect.get(window, "desktop");
              if (!desktop || typeof desktop !== "object")
                throw new Error("Missing desktop bridge");
              const callback: unknown = Reflect.get(desktop, operation);
              if (typeof callback !== "function") throw new Error("Missing file operation");
              const draft: unknown = JSON.parse(localStorage.getItem("edisvg-project") ?? "null");
              return Reflect.apply(callback, desktop, operation === "projectSave" ? [draft] : []);
            }, method);
          const saving = invoke("projectSave");
          await respond("Save");
          const saved = z.object({ saved: z.literal(true), path: z.string() }).parse(await saving);
          console.log("Verified native initial project save: edisvg");
          assert.equal(saved.path, destination);
          const written = JSON.parse(await readFile(destination, "utf8"));
          assert.equal(written.name, "Sem título");
          const opening = invoke("projectOpen");
          await respond("Open");
          const opened = z
            .object({
              project: z.object({ name: z.string() }),
              status: z.object({ dirty: z.boolean(), path: z.string() }),
            })
            .parse(await opening);
          assert.equal(opened.project.name, written.name);
          assert.equal(opened.status.path, destination);
          assert.equal(opened.status.dirty, false);
          await editor.locator('[data-action="tool-shapes"]').click();
          const artboard = await editor.locator(".scene-artwork>svg").boundingBox();
          if (!artboard) throw new Error("Missing native artboard");
          await editor.mouse.move(
            artboard.x + artboard.width / 2,
            artboard.y + artboard.height / 2,
          );
          await editor.mouse.down();
          await editor.mouse.move(
            artboard.x + artboard.width / 2 + 50,
            artboard.y + artboard.height / 2 + 40,
          );
          await editor.mouse.up();
          await editor.waitForFunction(
            () =>
              JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene
                .nodes.length === 1,
          );
          const result = z.object({ saved: z.literal(true) }).parse(await invoke("projectSave"));
          assert.equal(result.saved, true);
          const previous = await readFile(destination, "utf8");
          const x = editor.locator('[data-scene-transform="x"]');
          await x.fill("42");
          await x.press("Tab");
          const canceling = editor.evaluate(async () => {
            const desktop: unknown = Reflect.get(window, "desktop");
            if (!desktop || typeof desktop !== "object") throw new Error("Missing desktop bridge");
            const callback: unknown = Reflect.get(desktop, "projectSave");
            if (typeof callback !== "function") throw new Error("Missing save operation");
            return Reflect.apply(callback, desktop, [
              JSON.parse(localStorage.getItem("edisvg-project") ?? "null"),
              true,
            ]);
          });
          await respond("Cancel");
          const canceled = z
            .object({ saved: z.literal(false), dirty: z.literal(true) })
            .parse(await canceling);
          assert.equal(canceled.dirty, true);
          assert.equal(await readFile(destination, "utf8"), previous);
          await editor.evaluate(async () => {
            const desktop: unknown = Reflect.get(window, "desktop");
            if (!desktop || typeof desktop !== "object") throw new Error("Missing desktop bridge");
            const callback: unknown = Reflect.get(desktop, "projectChanged");
            if (typeof callback !== "function") throw new Error("Missing checkpoint operation");
            await Reflect.apply(callback, desktop, [
              JSON.parse(localStorage.getItem("edisvg-project") ?? "null"),
            ]);
          });
          const reloading = editor.reload();
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
              "Recuperar",
            ],
            {
              windowsHide: true,
              timeout: 30_000,
              maxBuffer: 32768,
              env: windowsPowerShellEnvironment(),
            },
          );
          await reloading;
          await editor.locator(".scene-artwork [data-object]").waitFor();
          assert.equal(
            await editor.evaluate(
              () =>
                JSON.parse(localStorage.getItem("edisvg-project") ?? "null").artboards[0].scene
                  .nodes[0].transform.x,
            ),
            42,
          );
          assert.equal(await readFile(destination, "utf8"), previous);
          console.log(
            "Verified native Save/Open, canceled Save As and detached recovery without changing the saved original: edisvg",
          );
          const archivePath = join(root, "edisvg-react-test.react.zip"),
            exportDraft = await editor.evaluate(() => localStorage.getItem("edisvg-project"));
          await editor.locator('[data-action="export"]').click();
          await editor.locator('[name="format"][value="react"]').check();
          await editor.locator("#download").click();
          await respond("Save", archivePath);
          await editor.locator("#export-dialog").waitFor({ state: "hidden" });
          const exportedBytes = await readFile(archivePath);
          assert.equal(exportedBytes.readUInt32LE(0), 0x04034b50);
          assert.ok(exportedBytes.includes(Buffer.from("edi-react-player.mjs")));
          assert.ok(exportedBytes.includes(Buffer.from("EdiAnimation.d.ts")));
          assert.equal(
            await editor.evaluate(() => localStorage.getItem("edisvg-project")),
            exportDraft,
          );
          await editor.locator('[data-action="export"]').click();
          await editor.locator('[name="format"][value="react"]').check();
          await editor.locator("#download").click();
          await respond("Cancel", archivePath);
          await editor.locator("#download").waitFor({ state: "visible" });
          await editor.waitForFunction(
            () => !document.querySelector<HTMLButtonElement>("#download")?.disabled,
          );
          assert.deepEqual(await readFile(archivePath), exportedBytes);
          await editor.locator("#close-export").click();
          assert.equal(await readFile(destination, "utf8"), previous);
          console.log(
            "Verified native binary React ZIP Save/Cancel, unchanged document and preserved original project",
          );
          const lottieJourney = await import(
            new URL("../../apps/edisvg/scripts/native-lottie-journey.mts", import.meta.url).href
          );
          await lottieJourney.verifyNativeLottieExport(
            editor,
            join(root, "edisvg-lottie-test.lottie.json"),
            join(results, "edisvg-lottie-export.png"),
            respond,
          );
          const baselineLottie = await readFile(join(root, "edisvg-lottie-test.lottie.json"));
          await lottieJourney.verifyNativeLottieExport(
            editor,
            join(root, "edisvg-lottie-stroke-test.lottie.json"),
            join(results, "edisvg-lottie-stroke.png"),
            respond,
            {
              kind: "stroke",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><path d="M20 35C20 35 90 35 90 35C90 35 55 90 55 90C55 90 20 35 20 35Z" fill="#2368e5" stroke="rgba(255,0,0,0.75)" stroke-width="8" stroke-opacity="0.5" stroke-linejoin="round"/></svg>',
            },
          );
          assert.deepEqual(
            await readFile(join(root, "edisvg-lottie-test.lottie.json")),
            baselineLottie,
          );
          await lottieJourney.verifyNativeLottieExport(
            editor,
            join(root, "edisvg-lottie-conversion-test.lottie.json"),
            join(results, "edisvg-lottie-conversion.png"),
            respond,
            {
              kind: "cubic-conversion",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><path d="M20 35L90 35L55 90Z" fill="#2368e5" stroke="#ff0000" stroke-width="8" stroke-linejoin="round" stroke-dasharray="8 4 2"/></svg>',
            },
          );
          await lottieJourney.verifyNativeLottieExport(
            editor,
            join(root, "edisvg-lottie-gradient-test.lottie.json"),
            join(results, "edisvg-lottie-gradient.png"),
            respond,
            {
              kind: "gradient",
              expectedGradientCount: 2,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><defs><linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="20" y1="35" x2="90" y2="90" gradientTransform="matrix(1.2 .2 .35 .9 -12 4)"><stop offset="0" stop-color="#e33a60" stop-opacity=".2"/><stop offset=".5" stop-color="#2050b0" stop-opacity=".7"/><stop offset="1" stop-color="#4fe3c1"/></linearGradient><linearGradient id="relative" gradientUnits="objectBoundingBox" x1=".1" y1=".15" x2=".9" y2=".8" gradientTransform="matrix(-1.2 .2 .35 .9 1 .05)"><stop offset="0" stop-color="#e33a60" stop-opacity=".2"/><stop offset="1" stop-color="#4fe3c1"/></linearGradient></defs><path d="M20 35C20 35 90 35 90 35C90 35 55 90 55 90C55 90 20 35 20 35Z" fill="url(#paint)"/><path d="M100 35C100 35 160 35 160 35C160 35 160 75 160 75C160 75 100 75 100 75C100 75 100 35 100 35Z" fill="url(#relative)" fill-opacity=".8"/></svg>',
            },
          );
          assert.deepEqual(
            await readFile(join(root, "edisvg-lottie-test.lottie.json")),
            baselineLottie,
          );
          assert.equal(await readFile(destination, "utf8"), previous);
        }
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
