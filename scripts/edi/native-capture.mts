import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { z } from "zod";
import { nativeFailure, trackNativeChild, verifyNativeClose } from "./native-diagnostics.mts";
import { ownedWheelFocus } from "./native-wheel-focus.mts";

const entrySchema = z.object({ id: z.uuid() }).passthrough();
const listSchema = z.object({ items: z.array(entrySchema) }).passthrough();
const documentSchema = z
  .object({
    id: z.uuid(),
    dataUrl: z.string(),
    annotations: z.array(z.object({ kind: z.string() }).passthrough()),
    name: z.string(),
  })
  .passthrough();

async function invoke(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    async ({ method, args }) => {
      const bridge: unknown = Reflect.get(window, "edi");
      if (!bridge || typeof bridge !== "object") throw new Error("Missing real capture bridge");
      const operation: unknown = Reflect.get(bridge, method);
      if (typeof operation !== "function") throw new Error("Missing capture operation");
      return Reflect.apply(operation, bridge, args);
    },
    { method, args },
  );
}
async function verifyVideoStream(editor: Page) {
  return editor.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Owned video canvas unavailable");
    context.fillStyle = "#193857";
    context.fillRect(0, 0, 96, 64);
    const stream = canvas.captureStream(20);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    let firstPart: () => void;
    const encoded = new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("Synthetic encoder produced no chunk")),
        8000,
      );
      firstPart = () => {
        clearTimeout(deadline);
        resolve();
      };
    });
    const produced = new Promise<Uint8Array>((resolve, reject) => {
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          parts.push(event.data);
          firstPart();
        }
      };
      recorder.onerror = () => reject(new Error("Synthetic fixture encoder failed"));
      recorder.onstop = () => {
        void new Blob(parts).arrayBuffer().then((bytes) => resolve(new Uint8Array(bytes)), reject);
      };
    });
    recorder.start(100);
    await new Promise<void>((resolve) => {
      let frames = 0;
      const draw = () => {
        context.fillStyle = frames % 2 ? "#486b92" : "#193857";
        context.fillRect(0, 0, 96, 64);
        if (++frames === 8) resolve();
        else requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });
    await encoded;
    recorder.stop();
    const bytes = await produced;
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    if (bytes.length > 1024 * 1024) throw new Error("Synthetic fixture exceeded its byte budget");
    const bridge: unknown = Reflect.get(window, "edi");
    if (!bridge || typeof bridge !== "object") throw new Error("Missing capture bridge");
    const operation: unknown = Reflect.get(bridge, "importMedia");
    if (typeof operation !== "function") throw new Error("Missing media import");
    const mediaDocument: unknown = await Reflect.apply(operation, bridge, [
      { name: "Owned synthetic video.webm", bytes },
    ]);
    if (!mediaDocument || typeof mediaDocument !== "object")
      throw new Error("Invalid video document");
    const url: unknown = Reflect.get(mediaDocument, "dataUrl");
    if (typeof url !== "string" || !/^edicaptura-media:\/\/video\/[a-f0-9]{64}$/.test(url))
      throw new Error("Video must use an opaque local capability");
    async function load(owner: Document, source: string, expected: boolean) {
      const video = owner.createElement("video");
      video.muted = true;
      owner.body.append(video);
      try {
        const loaded = await new Promise<boolean>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(new Error("Owned video response deadline")),
            8000,
          );
          video.onloadeddata = () => {
            clearTimeout(deadline);
            resolve(true);
          };
          video.onerror = () => {
            clearTimeout(deadline);
            resolve(false);
          };
          video.src = source;
        });
        if (loaded !== expected) throw new Error("Video stream authority mismatch");
        if (loaded && (video.videoWidth !== 96 || video.videoHeight !== 64))
          throw new Error("Unexpected synthetic video dimensions");
      } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
    }
    await load(window.document, url, true);
    await load(window.document, `edicaptura-media://video/${"0".repeat(64)}`, false);
    const frame = window.document.createElement("iframe");
    frame.srcdoc = "<!doctype html><body></body>";
    const ready = new Promise<void>((resolve) => {
      frame.onload = () => resolve();
    });
    window.document.body.append(frame);
    await ready;
    try {
      if (!frame.contentDocument) throw new Error("Owned subframe unavailable");
      await load(frame.contentDocument, url, false);
    } finally {
      frame.remove();
    }
    return {
      bytes: bytes.length,
      playback: "96x64",
      unknownCapabilityDenied: true,
      subframeDenied: true,
      physicalDeviceUsed: false,
    };
  });
}
async function finishControllerCleanup(page: Page) {
  try {
    await invoke(page, "finish", null);
  } catch (error) {
    if (
      !page.isClosed() ||
      !(error instanceof Error) ||
      !/Target page, context or browser has been closed/.test(error.message)
    )
      throw error;
    // Cleanup only: the shipped finish operation destroys this controller.
  }
}
async function selectRectangle(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
  mode: string,
) {
  await page.waitForLoadState("load");
  await click(page, "#create-region");
  for (const field of ["width", "height", "x", "y"] as const) {
    await page.locator(`#${field}`).fill(String(rect[field]));
    await page.locator(`#${field}`).press("Tab");
    assert.equal(await page.locator(`#${field}`).inputValue(), String(rect[field]));
  }
  await click(page, `[data-mode="${mode}"]`);
}
async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  label: string,
  timeout = 20000,
): Promise<T> {
  const deadline = performance.now() + timeout;
  while (true) {
    const value = await read();
    if (accept(value)) return value;
    if (performance.now() >= deadline) throw new Error(`Timed out observing ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
async function click(page: Page, selector: string) {
  await page.locator(selector).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement) || button.disabled)
      throw new Error("Control unavailable");
    button.click();
  });
}
function waitForCapturePage(application: ElectronApplication, suffix: string) {
  return application.waitForEvent("window", {
    predicate: async (page) => {
      try {
        await page.waitForURL((url) => url.protocol === "file:", { timeout: 10000 });
        return new URL(page.url()).pathname.endsWith(suffix);
      } catch (error) {
        if (page.isClosed()) return false;
        throw error;
      }
    },
  });
}
async function openCapturePage(
  application: ElectronApplication,
  suffix: string,
  start: () => Promise<unknown>,
) {
  const ready = waitForCapturePage(application, suffix);
  const outcome = start().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const page = await Promise.race([
    ready,
    outcome.then((result) => {
      if ("error" in result) throw result.error;
      return ready;
    }),
  ]);
  return {
    page,
    async finish() {
      const result = await outcome;
      if ("error" in result) throw result.error;
    },
  };
}

/** Test tooling only: all actions go through the shipped renderer bridge and license gates. */
export async function verifyLicensedCapture(
  application: ElectronApplication,
  editor: Page,
  userData: string,
  markStage: (stage: string) => void,
  environment: Record<string, string>,
  registerChild: (child: ReturnType<typeof trackNativeChild>) => void,
) {
  const owned: number[] = [];
  const coverIds: number[] = [];
  const diagnostics: object[] = [];
  const log = (value: { phase: string; [key: string]: unknown }) => {
    markStage(`capture:${value.phase}`);
    diagnostics.push(value);
    console.log(JSON.stringify({ nativeCapture: value }));
  };
  const editorWindow = await application.browserWindow(editor);
  const editorId = await editorWindow.evaluate((window) => window.id);
  const displays = await application.evaluate(({ screen }) =>
    screen.getAllDisplays().map((display) => ({
      id: String(display.id),
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
    })),
  );
  log({
    phase: "topology",
    displays: displays.map(({ bounds, scaleFactor, rotation }) => ({
      bounds,
      scaleFactor,
      rotation,
    })),
  });
  const primaryId = await application.evaluate(({ screen }) =>
    String(screen.getPrimaryDisplay().id),
  );
  const primary = displays.find((display) => display.id === primaryId);
  assert(primary);
  const rect = { x: primary.bounds.x + 60, y: primary.bounds.y + 60, width: 320, height: 240 };
  async function createSurface(bounds: typeof rect, title: string, html: string) {
    const pageReady = application.waitForEvent("window");
    const id = await application.evaluate(
      async ({ BrowserWindow }, options) => {
        const window = new BrowserWindow({
          ...options.bounds,
          frame: false,
          show: false,
          resizable: false,
          skipTaskbar: true,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        });
        window.setAlwaysOnTop(true, "screen-saver");
        await window.loadURL(`data:text/html,${encodeURIComponent(options.html)}`);
        window.setTitle(options.title);
        return window.id;
      },
      { bounds, title, html },
    );
    owned.push(id);
    const page = await pageReady;
    return { id, page };
  }
  async function visible(ids: number[], show: boolean) {
    await application.evaluate(
      ({ BrowserWindow }, { ids, show }) => {
        for (const id of ids) {
          const window = BrowserWindow.fromId(id);
          if (!window) throw new Error("Owned window missing");
          if (show) window.showInactive();
          else window.hide();
          if (window.isVisible() !== show) throw new Error("Owned visibility mismatch");
        }
      },
      { ids, show },
    );
  }
  async function presented(id: number, expected: number[], owner = application) {
    // A real compositor frame, independently of DOM acknowledgement; does not substitute capture pixels.
    await owner.evaluate(
      async ({ BrowserWindow }, { id, expected }) => {
        const window = BrowserWindow.fromId(id);
        if (!window?.isVisible() || window.isMinimized())
          throw new Error("Owned surface not visible");
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            window.webContents.endFrameSubscription();
            reject(new Error("Owned presentation deadline"));
          }, 5000);
          window.webContents.beginFrameSubscription((image) => {
            const size = image.getSize();
            const pixel = image
              .toBitmap()
              .subarray((Math.floor(size.height / 2) * size.width + Math.floor(size.width / 4)) * 4)
              .subarray(0, 4);
            if (expected.every((byte, index) => pixel[index] === byte)) {
              clearTimeout(timeout);
              window.webContents.endFrameSubscription();
              resolve();
            }
          });
          window.webContents.invalidate();
        });
      },
      { id, expected },
    );
  }
  async function entries() {
    return listSchema.parse(await invoke(editor, "list", {})).items;
  }
  async function newest(before: Set<string>) {
    const records = await until(
      entries,
      (items) => items.some((item) => !before.has(item.id)),
      "saved project",
    );
    const item = records.find((item) => !before.has(item.id));
    assert(item);
    return documentSchema.parse(await invoke(editor, "read", item.id));
  }
  async function pixels(
    dataUrl: string,
    points: { x: number; y: number; bgra: number[] }[],
    size?: { width: number; height: number },
  ) {
    const actual = await application.evaluate(
      ({ nativeImage }, { dataUrl, points }) => {
        const image = nativeImage.createFromDataURL(dataUrl),
          size = image.getSize(),
          bytes = image.toBitmap();
        return {
          size,
          samples: points.map(({ x, y }) =>
            Array.from(bytes.subarray((y * size.width + x) * 4, (y * size.width + x) * 4 + 4)),
          ),
        };
      },
      { dataUrl, points },
    );
    if (size) assert.deepEqual(actual.size, size);
    assert.deepEqual(
      actual.samples,
      points.map((point) => point.bgra),
    );
    return actual.size;
  }
  let target: { id: number; page: Page } | undefined;
  let activeController: Page | undefined;
  let recordingController: Page | undefined;
  let scrollApplication: ElectronApplication | undefined;
  let scrollChild: ReturnType<ElectronApplication["process"]> | undefined;
  let scrollLifetime: ReturnType<typeof trackNativeChild> | undefined;
  const failures: unknown[] = [];
  let before = new Set<string>();
  try {
    const profilePaths = Object.fromEntries(
      ["userData", "sessionData", "logs", "crashDumps"].map((name) => [
        name,
        name === "userData" ? userData : join(userData, name),
      ]),
    );
    const profilesOwned = await application.evaluate(
      ({ app }, expected) =>
        Object.entries(expected).every(
          ([name, path]) =>
            app.getPath(name as "userData" | "sessionData" | "logs" | "crashDumps") === path,
        ),
      profilePaths,
    );
    assert(profilesOwned);
    log({ phase: "profiles", allFourOwned: profilesOwned });
    log({ phase: "video-stream", ...(await verifyVideoStream(editor)) });
    for (const display of displays) {
      const cover = await createSurface(
        display.bounds,
        "EDI owned opaque cover",
        '<html><body style="margin:0;background:rgb(12,34,56)"></body></html>',
      );
      coverIds.push(cover.id);
    }
    target = await createSurface(
      rect,
      "EDI synthetic capture target",
      '<html><body style="margin:0;background:rgb(200,30,40)"><div style="position:absolute;left:50%;top:0;width:50%;height:100%;background:rgb(20,180,60)"></div></body></html>',
    );
    const targetId = target.id;
    await visible(coverIds, true);
    for (const id of coverIds) await presented(id, [56, 34, 12, 255]);
    await visible([targetId], true);
    await presented(targetId, [40, 30, 200, 255]);
    const protections = await editorWindow.evaluate((window) => {
      const preferences = window.webContents.getLastWebPreferences();
      return {
        visible: window.isVisible(),
        focused: window.isFocused(),
        minimized: window.isMinimized(),
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
      };
    });
    assert.equal(protections.sandbox, true);
    assert.equal(protections.contextIsolation, true);
    assert.equal(protections.nodeIntegration, false);
    log({ phase: "owned-ready", protections });
    log({
      phase: "source-shapes",
      ...(await application.evaluate(async ({ desktopCapturer, BrowserWindow }, id) => {
        const window = BrowserWindow.fromId(id);
        if (!window) throw new Error("Owned target missing");
        const handle = window.getNativeWindowHandle().readBigUInt64LE().toString();
        const sources = await desktopCapturer.getSources({
          types: ["window"],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
        const counts = { valid: 0, zeroHandle: 0, otherNumericSuffix: 0, other: 0, owned: 0 };
        for (const source of sources) {
          if (source.id.startsWith(`window:${handle}:`)) counts.owned++;
          if (/^window:[1-9]\d{0,18}:[01]$/.test(source.id)) counts.valid++;
          else if (/^window:0:\d+$/.test(source.id)) counts.zeroHandle++;
          else if (/^window:[1-9]\d{0,18}:\d+$/.test(source.id)) counts.otherNumericSuffix++;
          else counts.other++;
        }
        return counts;
      }, targetId)),
    });
    await invoke(editor, "setMonitor", primaryId);
    before = new Set((await entries()).map((entry) => entry.id));
    const recordingSelection = await openCapturePage(application, "/capture/selection.html", () =>
      invoke(editor, "capture"),
    );
    const recordingReady = waitForCapturePage(application, "/recording/control.html");
    await selectRectangle(
      recordingSelection.page,
      { x: 20, y: 20, width: 64, height: 48 },
      "video",
    );
    await click(recordingSelection.page, "#record-start");
    await recordingSelection.finish();
    recordingController = await recordingReady;
    await recordingController.waitForFunction(() =>
      document.querySelector("#stop-hint")?.textContent?.includes("MB no disco"),
    );
    await click(recordingController, "#finish");
    const recorded = await newest(before);
    assert.match(recorded.dataUrl, /^edicaptura-media:/);
    await editor.locator("#video-preview").evaluate(async (element) => {
      if (!(element instanceof HTMLVideoElement)) throw new Error("Video preview missing");
      if (element.readyState < 2)
        await new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error("Recorded playback deadline")), 8000);
          element.addEventListener(
            "loadeddata",
            () => {
              clearTimeout(deadline);
              resolve();
            },
            { once: true },
          );
          element.addEventListener(
            "error",
            () => {
              clearTimeout(deadline);
              reject(new Error("Recorded playback failed"));
            },
            { once: true },
          );
        });
      if (element.videoWidth !== 64 || element.videoHeight !== 48)
        throw new Error("Recorded dimensions differ from owned region");
    });
    assert.equal(
      await recordingController.locator("#title").textContent(),
      "Gravação salva na biblioteca.",
    );
    recordingController = undefined;
    log({
      phase: "durable-video",
      ownedOpaqueCoverage: true,
      playback: "64x48",
      incrementalDiskAck: true,
      controllerAck: true,
    });
    // Filter inside the renderer: never return/persist unrelated names, IDs or thumbnails.
    async function sourceToken() {
      return z
        .string()
        .uuid()
        .parse(
          await editor.evaluate(async () => {
            const bridge: unknown = Reflect.get(window, "edi");
            if (!bridge || typeof bridge !== "object") throw new Error("Missing bridge");
            const operation = Reflect.get(bridge, "photoSources");
            if (typeof operation !== "function") throw new Error("Missing sources");
            const sources: unknown = await Reflect.apply(operation, bridge, []);
            if (!Array.isArray(sources)) throw new Error("Invalid sources");
            const owned = sources.filter(
              (source) => source.name === "EDI synthetic capture target",
            );
            if (owned.length !== 1) throw new Error(`Owned source count ${owned.length}`);
            return owned[0].token;
          }),
        );
    }
    // Independent photo and scroll cases retain every failure in the final result.
    try {
      const token = await sourceToken();
      log({ phase: "window-source", ownedSourceCount: 1 });
      before = new Set((await entries()).map((entry) => entry.id));
      const start = performance.now();
      log({ phase: "window-acquiring" });
      await invoke(editor, "photoStart", { mode: "window", source: token, destination: "editor" });
      const captured = await newest(before);
      const size = await pixels(captured.dataUrl, [
        { x: 40, y: 80, bgra: [40, 30, 200, 255] },
        { x: 240, y: 80, bgra: [60, 180, 20, 255] },
      ]);
      assert(size.width >= 320 && size.height >= 240);
      log({ phase: "window-saved", size, elapsedMs: Math.round(performance.now() - start) });
      await visible(owned, false);
      await editorWindow.evaluate((window) => {
        window.show();
        window.focus();
      });
      await editor.locator("#document-name").waitFor({ state: "visible" });
      await until(
        () => editor.locator("#document-name").isEnabled(),
        Boolean,
        "document activation",
      );
      await editor.getByRole("button", { name: "Forma", exact: true }).click();
      const canvas = await editor.locator("#canvas").boundingBox();
      assert(canvas);
      await editor.mouse.move(canvas.x + 30, canvas.y + 30);
      await editor.mouse.down();
      await editor.mouse.move(canvas.x + 110, canvas.y + 90, { steps: 5 });
      await editor.mouse.up();
      await editor.locator("#save").click();
      const annotated = await until(
        async () => documentSchema.parse(await invoke(editor, "read", captured.id)),
        (doc) => doc.annotations.length === 1,
        "annotation persisted",
      );
      assert.equal(annotated.annotations[0]?.kind, "square");
      const original = await readFile(join(userData, "captures", `${captured.id}.png`));
      assert(original.equals(Buffer.from(captured.dataUrl.split(",")[1] ?? "", "base64")));
      log({ phase: "annotation", persisted: true, originalUnchanged: true });
      await visible(coverIds, true);
      for (const id of coverIds) await presented(id, [56, 34, 12, 255]);
      before = new Set((await entries()).map((entry) => entry.id));
      await invoke(editor, "photoStart", { mode: "monitor", destination: "library" });
      const monitor = await newest(before);
      await pixels(monitor.dataUrl, [{ x: 20, y: 20, bgra: [56, 34, 12, 255] }], {
        width: Math.round(primary.bounds.width * primary.scaleFactor),
        height: Math.round(primary.bounds.height * primary.scaleFactor),
      });
      log({ phase: "monitor", synthetic: true });
      before = new Set((await entries()).map((entry) => entry.id));
      const selectionReady = waitForCapturePage(application, "/capture/selection.html");
      await invoke(editor, "photoStart", {
        mode: "region",
        timing: "fresh",
        destination: "library",
      });
      const selection = await selectionReady;
      await selection.waitForFunction(() => typeof Reflect.get(window, "edi") === "object");
      await selectRectangle(
        selection,
        { x: primary.bounds.x + 20, y: primary.bounds.y + 20, width: 64, height: 48 },
        "image",
      );
      const region = await newest(before);
      await pixels(region.dataUrl, [{ x: 10, y: 10, bgra: [56, 34, 12, 255] }], {
        width: Math.round(64 * primary.scaleFactor),
        height: Math.round(48 * primary.scaleFactor),
      });
      log({ phase: "region", fresh: true });
      await visible([targetId], true);
      await presented(targetId, [40, 30, 200, 255]);
      before = new Set((await entries()).map((entry) => entry.id));
      const freshToken = await sourceToken();
      log({ phase: "timer-acquiring" });
      const timedCapture = await openCapturePage(application, "/recording/control.html", () =>
        invoke(editor, "photoStart", {
          mode: "window",
          source: freshToken,
          delay: 2,
          destination: "library",
        }),
      );
      const timer = timedCapture.page;
      await timer.waitForFunction(() => typeof Reflect.get(window, "edi") === "object");
      const changedAt = performance.now();
      await target.page.evaluate(() => {
        document.body.style.background = "rgb(30,50,210)";
      });
      await presented(targetId, [210, 50, 30, 255]);
      const paintedAfterMs = Math.round(performance.now() - changedAt);
      await timedCapture.finish();
      const fresh = await newest(before);
      await pixels(fresh.dataUrl, [{ x: 40, y: 80, bgra: [210, 50, 30, 255] }], size);
      log({
        phase: "timer",
        freshPixels: true,
        paintedAfterMs,
        completedAfterStimulusMs: Math.round(performance.now() - changedAt),
      });
      // A focus request cannot authorize acquisition from an unknown foreground
      // window. Active-mode coverage requires a separately controlled desktop.
      log({ phase: "active-unverified", reason: "No atomic owned foreground guarantee" });
      await visible([targetId], false);
      // Cancel while countdown is active. Await the original operation; no late save is allowed.
      before = new Set((await entries()).map((entry) => entry.id));
      const pending = await openCapturePage(application, "/recording/control.html", () =>
        invoke(editor, "photoStart", { mode: "monitor", delay: 2, destination: "library" }),
      );
      const countdown = pending.page;
      await countdown.waitForFunction(() => typeof Reflect.get(window, "edi") === "object");
      await click(countdown, "#cancel");
      await assert.rejects(() => pending.finish(), /abort|encerrad|cancelad/i);
      assert.deepEqual(new Set((await entries()).map((entry) => entry.id)), before);
      assert.equal(
        documentSchema.parse(await invoke(editor, "read", captured.id)).annotations.length,
        1,
      );
      log({ phase: "cancel", noLateSave: true, previousAnnotationPreserved: true });
      before = new Set((await entries()).map((entry) => entry.id));
      // Main IPC round-trip includes scheduling and transport; RSS is main-only, not a process-tree budget.
      let completed = false;
      const pings: number[] = [],
        rss: number[] = [];
      const allCapture = invoke(editor, "photoStart", {
        mode: "all",
        destination: "library",
      }).finally(() => {
        completed = true;
      });
      const observation = (async () => {
        while (!completed) {
          const sent = performance.now();
          rss.push(await application.evaluate(() => process.memoryUsage().rss));
          pings.push(performance.now() - sent);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      })();
      await Promise.all([allCapture, observation]);
      const all = await newest(before);
      const minX = Math.min(...displays.map((display) => display.bounds.x));
      const minY = Math.min(...displays.map((display) => display.bounds.y));
      const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
      const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
      const outputScale = Math.max(...displays.map((display) => display.scaleFactor));
      await pixels(
        all.dataUrl,
        displays.map((display) => ({
          x: Math.round((display.bounds.x - minX + 20) * outputScale),
          y: Math.round((display.bounds.y - minY + 20) * outputScale),
          bgra: [56, 34, 12, 255],
        })),
        {
          width: Math.round((maxX - minX) * outputScale),
          height: Math.round((maxY - minY) * outputScale),
        },
      );
      assert(pings.length > 1);
      log({
        phase: "all-monitors",
        displays: displays.length,
        mainPingSamples: pings.length,
        maxMainRoundTripMs: Math.round(Math.max(...pings)),
        peakObservedMainRssBytes: Math.max(...rss),
      });
    } catch (error) {
      failures.push(error);
      log({ phase: "photo-case-failed", error: nativeFailure(error, [userData, resolve(".")]) });
      await invoke(editor, "photoCancel");
    }
    await visible(coverIds, true);
    await visible([targetId], false);
    // Deterministic owned moving content. Real targeted native wheel is received by Chromium.
    const color = (x: number, y: number) => [
      (x * 7 + y * 29) % 251,
      (x * 11 + y * 13) % 251,
      (x * 37 + y * 17) % 251,
      255,
    ];
    assert.equal(
      primary.scaleFactor,
      1,
      "Exact native scrolling fixture currently requires a 100% selected display",
    );
    // Production correctly excludes its own UI windows. The input target is a
    // separate owned Electron process with its own pre-ready profile roots.
    scrollApplication = await _electron.launch({
      args: [resolve("scripts/edi/fixtures/native-scroll-target.cjs")],
      env: { ...environment, EDI_NATIVE_SCROLL_PROFILE: join(userData, "scroll-target") },
    });
    scrollChild = scrollApplication.process();
    scrollLifetime = trackNativeChild(scrollChild);
    registerChild(scrollLifetime);
    const scrollPage = await scrollApplication.firstWindow();
    const scrollWindow = await scrollApplication.browserWindow(scrollPage);
    const scrollId = await scrollWindow.evaluate((window, bounds) => {
      window.setBounds(bounds);
      window.setAlwaysOnTop(true, "screen-saver");
      window.showInactive();
      return window.id;
    }, rect);
    log({
      phase: "scroll-target-ready",
      childPid: scrollChild.pid,
      childName: basename(scrollChild.spawnfile),
      runtimePid: await scrollApplication.evaluate(() => process.pid),
      separateProcess: true,
    });
    for (const axis of ["vertical", "horizontal"]) {
      await scrollPage.evaluate((axis) => {
        document.body.replaceChildren();
        document.body.style.cssText = "margin:0;overflow:hidden";
        document.body.dataset.wheels = "0";
        document.body.dataset.offset = "0";
        document.body.dataset.events = "[]";
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 600;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas missing");
        const image = context.createImageData(600, 600);
        for (let y = 0; y < 600; y++)
          for (let x = 0; x < 600; x++) {
            const i = (y * 600 + x) * 4;
            image.data.set(
              [(x * 37 + y * 17) % 251, (x * 11 + y * 13) % 251, (x * 7 + y * 29) % 251, 255],
              i,
            );
          }
        context.putImageData(image, 0, 0);
        document.body.append(canvas);
        canvas.addEventListener(
          "wheel",
          (event) => {
            event.preventDefault();
            const events = JSON.parse(document.body.dataset.events || "[]");
            events.push({
              x: event.deltaX,
              y: event.deltaY,
              mode: event.deltaMode,
              cancelable: event.cancelable,
              trusted: event.isTrusted,
              at: event.timeStamp,
            });
            document.body.dataset.events = JSON.stringify(events.slice(-8));
            const offset = Number(document.body.dataset.offset) + 40;
            document.body.dataset.wheels = String(Number(document.body.dataset.wheels) + 1);
            document.body.dataset.offset = String(offset);
            canvas.style.transform =
              axis === "vertical" ? `translateY(-${offset}px)` : `translateX(-${offset}px)`;
          },
          { passive: false },
        );
      }, axis);
      await scrollWindow.evaluate((window) => window.showInactive());
      await presented(scrollId, color(80, 120), scrollApplication);
      await scrollWindow.evaluate((window) => window.focus());
      const ownHandle = await scrollWindow.evaluate((window) =>
        window.getNativeWindowHandle().readBigUInt64LE().toString(),
      );
      const recipient = await ownedWheelFocus(
        ownHandle,
        primary.bounds.x + 140,
        primary.bounds.y + 130,
      );
      assert(
        recipient.focusOwned && recipient.hitOwned,
        "Owned target recipient before acquisition",
      );
      log({
        phase: "scroll-native-recipient",
        axis,
        ...recipient,
        childPid: scrollChild.pid,
        ownedTargetBounds: rect,
        selectedRegion: {
          x: primary.bounds.x + 80,
          y: primary.bounds.y + 80,
          width: 120,
          height: 100,
        },
        opaqueOwnedMonitorCovers: coverIds.length,
        targetPresented: true,
      });
      before = new Set((await entries()).map((entry) => entry.id));
      const overlayReady = waitForCapturePage(application, "/capture/selection.html");
      log({ phase: "scroll-acquiring", axis });
      await invoke(editor, "capture");
      const overlay = await overlayReady;
      const controllerReady = waitForCapturePage(application, "/recording/control.html");
      await overlay.waitForFunction(() => typeof Reflect.get(window, "edi") === "object");
      await selectRectangle(
        overlay,
        { x: primary.bounds.x + 80, y: primary.bounds.y + 80, width: 120, height: 100 },
        "scroll",
      );
      const controller = await controllerReady;
      activeController = controller;
      await controller.waitForLoadState("load");
      log({ phase: "scroll-controller", axis });
      await invoke(controller, "scrollPause");
      const configurationState = z.object({
        axis: z.enum(["vertical", "horizontal"]),
        busy: z.boolean(),
        paused: z.boolean(),
      });
      // Pause cancels the assisted worker asynchronously. The real UI disables
      // configuration until its idle state arrives; bypassing it can cancel the
      // configure intent itself and leave the previous axis authoritative.
      await until(
        () => invoke(controller, "controlState").then((value) => configurationState.parse(value)),
        (state) => state.paused && !state.busy,
        "assisted worker cancellation settled",
      );
      await controller.locator("#scroll-axis").selectOption(axis);
      await controller.locator("#scroll-configure").click();
      const configured = await until(
        () => invoke(controller, "controlState").then((value) => configurationState.parse(value)),
        (state) => state.axis === axis && state.paused && !state.busy,
        "authoritative scroll axis configured",
      );
      const rendererExtent = axis === "horizontal" ? "119" : "99";
      await controller.waitForFunction(
        (extent) => document.getElementById("overlap")?.getAttribute("max") === extent,
        rendererExtent,
      );
      log({
        phase: "scroll-configured",
        requestedAxis: axis,
        mainAxis: configured.axis,
        rendererExtent,
      });
      // Load only the known target into the real selector; external catalog data never leaves this renderer.
      await controller.evaluate(async () => {
        const bridge: unknown = Reflect.get(window, "edi");
        if (!bridge || typeof bridge !== "object") throw new Error("Missing bridge");
        const operation = Reflect.get(bridge, "scrollTargets");
        if (typeof operation !== "function") throw new Error("Missing targets");
        const sources: unknown = await Reflect.apply(operation, bridge, []);
        if (!Array.isArray(sources)) throw new Error("Invalid targets");
        const own = sources.filter((source) => source.name === "EDI synthetic scroll target");
        if (own.length !== 1) throw new Error(`Owned scroll target count ${own.length}`);
        const select = document.getElementById("scroll-target");
        if (!(select instanceof HTMLSelectElement)) throw new Error("Missing selector");
        select.replaceChildren(new Option("Owned synthetic target", own[0].token));
        select.value = own[0].token;
      });
      const nativeController = await application.browserWindow(controller);
      await nativeController.evaluate((window) => {
        window.setPosition(600, 80);
        window.setAlwaysOnTop(true, "screen-saver");
        window.show();
        window.focus();
      });
      const controllerFocused = await nativeController.evaluate((window) => window.isFocused());
      assert(controllerFocused, "Start originates in the actual foreground Electron controller");
      await controller.locator("#scroll-limit").fill("1");
      assert.equal(configurationState.parse(await invoke(controller, "controlState")).axis, axis);
      assert.equal(await controller.locator("#overlap").getAttribute("max"), rendererExtent);
      await controller.locator("#scroll-auto").click();
      const stateSchema = z
        .object({
          count: z.number(),
          axis: z.enum(["vertical", "horizontal"]),
          automatic: z.boolean(),
          waitingFocus: z.boolean(),
          paused: z.boolean(),
          steps: z.number(),
          bytes: z.number(),
          dimensions: z.object({ width: z.number(), height: z.number() }),
        })
        .passthrough();
      const state = () =>
        invoke(controller, "controlState").then((value) => stateSchema.parse(value));
      const starting = await until(
        state,
        (state) => state.automatic || state.waitingFocus,
        "native auto authorization",
      );
      assert.equal(starting.axis, axis);
      log({
        phase: "scroll-start",
        axis,
        mainAxis: starting.axis,
        rendererExtent,
        controllerFocused,
        waitingFocus: starting.waitingFocus,
      });
      if (starting.waitingFocus)
        await scrollWindow.evaluate((window) => {
          window.show();
          window.focus();
        });
      await scrollPage.waitForFunction(() => Number(document.body.dataset.wheels) > 0, undefined, {
        timeout: 15000,
      });
      await invoke(controller, "scrollPause");
      const received: { wheels: number; offset: number } = await scrollPage.evaluate(() => ({
        wheels: Number(document.body.dataset.wheels),
        offset: Number(document.body.dataset.offset),
      }));
      log({ phase: "scroll-input", axis, ...received });
      assert.equal(received.wheels, 1);
      assert.equal(received.offset, 40);
      await scrollPage.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const unexpected = (event: WheelEvent) => {
              clearTimeout(timeout);
              window.removeEventListener("wheel", unexpected);
              reject(
                new Error(
                  `Late wheel after cancellation: ${JSON.stringify({ x: event.deltaX, y: event.deltaY, mode: event.deltaMode, trusted: event.isTrusted, events: document.body.dataset.events })}`,
                ),
              );
            };
            const timeout = setTimeout(() => {
              window.removeEventListener("wheel", unexpected);
              resolve();
            }, 1400);
            window.addEventListener("wheel", unexpected);
          }),
      );
      await presented(
        scrollId,
        axis === "vertical" ? color(80, 160) : color(120, 120),
        scrollApplication,
      );
      await invoke(controller, "nextSegment", axis === "vertical" ? 60 : 80);
      const collected = await state();
      assert.equal(collected.count, 2);
      assert(collected.bytes < 512 * 1024 ** 2);
      await click(controller, "#scroll-preview");
      await controller.locator("#scroll-figure").waitFor({ state: "visible" });
      assert.equal(await controller.locator("#scroll-markers > *").count(), 1);
      await invoke(controller, "scrollReview", { op: "remove", index: 1 });
      assert.equal((await state()).count, 1);
      await invoke(controller, "scrollReview", { op: "undo" });
      assert.equal((await state()).count, 2);
      await click(controller, "#finish");
      const stitched = await newest(before);
      activeController = undefined;
      const outputSize =
        axis === "vertical" ? { width: 120, height: 140 } : { width: 160, height: 100 };
      await pixels(
        stitched.dataUrl,
        [
          { x: 10, y: 10, bgra: color(30, 30) },
          {
            x: outputSize.width - 10,
            y: outputSize.height - 10,
            bgra: color(outputSize.width + 10, outputSize.height + 10),
          },
        ],
        outputSize,
      );
      log({
        phase: "scroll-saved",
        axis,
        received,
        count: collected.count,
        modeledWorkBytes: collected.bytes,
        previewSeams: 1,
        removeUndo: true,
        exactPixels: true,
        noLateWheel: true,
      });
    }
  } catch (error) {
    failures.push(error);
  } finally {
    const cleanup = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        failures.push(error);
      }
    };
    if (!editor.isClosed()) await cleanup(() => invoke(editor, "photoCancel"));
    if (recordingController && !recordingController.isClosed()) {
      const controller = recordingController;
      await cleanup(() => invoke(controller, "finish", null));
    }
    if (activeController && !activeController.isClosed()) {
      const controller = activeController;
      await cleanup(async () => {
        await invoke(controller, "scrollPause");
        await finishControllerCleanup(controller);
      });
    }
    if (scrollApplication) {
      const targetApplication = scrollApplication;
      await cleanup(async () => {
        const child = scrollChild;
        assert.ok(child && scrollLifetime);
        await verifyNativeClose(child, scrollLifetime.completion, targetApplication.close());
        log({ phase: "scroll-target-cleanup", exitCode: child.exitCode, signal: child.signalCode });
        assert.equal(child.exitCode, 0);
      });
    }
    // Only known test windows; leave actual editor/controller lifecycle to the owning harness.
    await cleanup(() =>
      application.evaluate(({ BrowserWindow }, ids) => {
        for (const id of ids) {
          const window = BrowserWindow.fromId(id);
          if (window && !window.isDestroyed()) window.destroy();
        }
      }, owned),
    );
    log({ phase: "owned-cleanup", count: owned.length, editorIdKnown: editorId > 0 });
  }
  if (failures.length)
    throw new Error(
      JSON.stringify(failures.map((error) => nativeFailure(error, [userData, resolve(".")]))),
    );
  assert(diagnostics.length > 0);
}
