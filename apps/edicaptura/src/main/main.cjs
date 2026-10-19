const {
  app,
  BrowserWindow,
  desktopCapturer,
  screen,
  globalShortcut,
  dialog,
  clipboard,
  nativeImage,
  session,
  protocol,
  Tray,
  Menu,
  shell,
} = require("electron");
const { createEdiDesktop, desktopIpc: ipcMain } = require("@informach/edi-desktop/main");
const path = require("node:path");
const fs = require("node:fs/promises");
const { atomicWrite } = require("@informach/edi-desktop/files");
const { RecordingStore, appendSchema, finishSchema } = require("./recording-store.ts");
const { VideoStreams } = require("./video-stream.ts");
const { registerQuickVideo } = require("./quick-video-ipc.ts");
const { copyVideo } = require("./video-files.ts");
const { publishIndividualExport } = require("./export-destination.ts");
const { resolveRecordingSource } = require("./recording-permission.ts");
const { pathToFileURL } = require("node:url");
const { PhotoCapture } = require("./capture-pipeline.ts");
const { CapturePreferences } = require("./capture-preferences.ts");
const { validateSavedRegion, profileUpdateSchema } = require("../domain/capture-preferences.ts");
const { Library } = require("./library.cjs");
const { registerLibraryIpc, readPreferences } = require("./library-ipc.ts");
const { decodeRaster } = require("./raster-codec.mts");
const { imageEditSchema } = require("../domain/document.ts");
const { collectImageAssets } = require("../domain/assets.ts");
const { ScrollSession } = require("./scroll-session.ts");
const { ScrollAutomation } = require("./scroll-automation.ts");
const { windowHandle, acquireScreens } = require("./capture-sources.ts");
const { scrollAcquisitionBudget, scrollBudget, checkScrollBytes } = require("../domain/scroll.ts");
const scrollWorkerEntry = path.join(
  __dirname,
  require("node:fs").existsSync(path.join(__dirname, "scroll-worker.ts"))
    ? "scroll-worker.ts"
    : "scroll-worker.js",
);
const { allowCapturePermission } = require("./capture-permission.cjs");
const { VideoOptionsStore } = require("./video-options.ts");
const { RECORDING_PHASES } = require("../domain/video-options.ts");
const { pixelRect } = require("../capture/geometry.cjs");
const { chooseDisplay, frameWindows, controlPosition } = require("../capture/displays.cjs");

app.setPath("userData", path.join(app.getPath("appData"), "edicaptura"));
if (!app.isPackaged && process.env.EDICAPTURA_TEST_PROFILE)
  app.setPath("userData", path.resolve(process.env.EDICAPTURA_TEST_PROFILE));
const desktop = createEdiDesktop({
  appId: "edicaptura",
  preloadPath: path.join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: path.join(__dirname, "../renderer"),
  getRecoveryWindow: () =>
    capture?.mode === "scroll" || (capture?.mode === "video" && capture.recordStarted)
      ? controller
      : editor,
  recoveryChannels: [
    "app:close",
    "app:status",
    "library:update",
    "library:save",
    "record:save",
    "record:append",
    "record:failed",
    "record:ready",
    "record:phase",
    "record:options",
    "control:finish",
    "control:state",
    "capture:cancel",
    "scroll:pause",
    "photo:cancel",
    "photo:retry",
    "photo:discard",
    "video:cancel",
  ],
});
app.setAppUserModelId("br.com.informach.edicaptura");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "edicaptura-media",
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
  },
]);
const recordingStore = new RecordingStore(path.join(app.getPath("userData"), "recordings"));
const videoOptions = new VideoOptionsStore(
  path.join(app.getPath("userData"), "video-options.json"),
);
let startupRecoveries = [];
let recoveringVideo = false;
const videoStreams = new VideoStreams((root) => {
  try {
    desktop.assertAccess();
    return !librarySwitch && library?.root === root;
  } catch {
    return false;
  }
});
const videoUrl = (root, id, file) => videoStreams.grant(root, id, file);
let editor,
  overlay,
  controller,
  capture,
  library,
  starting = false,
  closing = false;
let photoCapture, photoSelection, photoState;
let quickVideo;
let photoCancelShortcut = false;
let photoPreferences;
function captureTopology() {
  return screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    rotation: d.rotation,
  }));
}
function photoProfile() {
  const profile = photoPreferences.status();
  const valid = (region) => {
    try {
      if (!region) return false;
      validateSavedRegion(region, captureTopology());
      return true;
    } catch {
      return false;
    }
  };
  return {
    ...profile,
    lastValid: valid(profile.last),
    presets: profile.presets.map((p) => ({ ...p, regionValid: !p.region || valid(p.region) })),
  };
}
function startPhoto(input) {
  const display = chooseDisplay(
    screen.getAllDisplays(),
    monitorPreference,
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id,
  );
  return photoCapture.start(input, String(display.id));
}
let libraryWorkflow,
  librarySwitch = false,
  tray = null;
let captureFrames = [],
  monitorPreference = "cursor";
const windows = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pages = {
  editor: "editor/index.html",
  overlay: "capture/selection.html",
  controller: "recording/control.html",
  frame: "capture/frame.html",
};
const pageURL = (role) =>
  process.env.ELECTRON_RENDERER_URL && !app.isPackaged
    ? new URL(pages[role], process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(path.join(__dirname, "../renderer", pages[role])).href;
function createWindow(role, options = {}, query = {}) {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: "#f5f6f8",
    title: "EdiCaptura",
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
      autoplayPolicy: role === "controller" ? "no-user-gesture-required" : "user-gesture-required",
      ...(role === "editor" ? { partition: "edicaptura-editor" } : {}),
    },
  });
  win.role = role;
  windows.add(win);
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("closed", () => windows.delete(win));
  const target = new URL(pageURL(role));
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, String(value));
  win.trustedURL = target.href;
  win.loadURL(target.href);
  return win;
}
function handle(name, roles, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !windows.has(win) ||
      !roles.includes(win.role) ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== win.trustedURL
    )
      throw new Error("Origem não autorizada.");
    if (librarySwitch && name !== "library:workflow")
      throw new Error("Biblioteca em transferência. Aguarde a conclusão.");
    return fn(...args);
  });
}
function send(name, data) {
  if (editor && !editor.isDestroyed()) editor.webContents.send(name, data);
}
function stopRecording() {
  if (capture?.mode === "video") {
    capture.stopRequested = true;
    capture.recordingState = "finalizing";
    controller?.webContents.send("control-update", controlState());
  }
  if (controller && !controller.isDestroyed()) controller.webContents.send("record-stop");
}
function showEditor() {
  if (editor && !editor.isDestroyed()) {
    editor.show();
    editor.focus();
  }
}
function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
}
function closeController() {
  if (controller && !controller.isDestroyed()) controller.destroy();
  controller = null;
}
function closeCaptureFrames() {
  for (const win of captureFrames) if (!win.isDestroyed()) win.destroy();
  captureFrames = [];
}
function cleanup() {
  capture?.automation?.stop();
  capture?.scroll?.dispose();
  capture?.job?.finish();
  clearTimeout(capture?.scrollTimer);
  closeOverlay();
  closeController();
  closeCaptureFrames();
  capture = null;
  showEditor();
}
function completeCapture(active) {
  if (capture !== active) return;
  if (!active.restricted) return cleanup();
  // Keep this WebContents alive until the recovery IPC acknowledgment.
  active.automation?.stop();
  active.scroll?.dispose();
  active.job?.finish();
  clearTimeout(active.scrollTimer);
  closeOverlay();
  closeCaptureFrames();
  capture = null;
  controller?.hide();
  showEditor();
}
function monitorState() {
  const primary = screen.getPrimaryDisplay().id;
  return {
    selected: monitorPreference,
    displays: screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      name: `Monitor ${i + 1}${d.id === primary ? " (principal)" : ""}${d.label ? " — " + d.label : ""}`,
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
    })),
  };
}
async function showCaptureFrames() {
  closeCaptureFrames();
  const active = capture;
  const ready = frameWindows(active.rect, active.display.bounds).map(
    ({ bounds, line }) =>
      new Promise((resolve) => {
        const win = createWindow(
          "frame",
          {
            ...bounds,
            minWidth: 1,
            minHeight: 1,
            frame: false,
            resizable: false,
            movable: false,
            focusable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            hasShadow: false,
            transparent: true,
            backgroundColor: "#00000000",
          },
          Object.fromEntries(Object.entries(line).map(([k, v]) => [k, String(v)])),
        );
        captureFrames.push(win);
        win.setBounds(bounds);
        win.setIgnoreMouseEvents(true);
        win.setContentProtection(true);
        win.setAlwaysOnTop(true, "screen-saver");
        win.once("ready-to-show", () => {
          if (capture === active && !win.isDestroyed()) win.showInactive();
          resolve();
        });
        win.once("closed", resolve);
      }),
  );
  await Promise.all(ready);
  // Capture exclusion is applied on the next desktop composition.
  await delay(180);
}
async function getScreen(display, scroll = null, guard = () => {}) {
  const topology = captureTopology();
  let sizes;
  const admit = (all, encodedBytes) => {
    guard();
    const selected = all.find((s) => s.id === String(display.id));
    if (!selected) throw new Error("Fonte de monitor indisponível.");
    if (scroll) scroll.checkAcquisition(all, selected, encodedBytes);
    else scrollAcquisitionBudget(64 * 1048576, all, selected, selected, encodedBytes);
    sizes = all;
  };
  const sources = await acquireScreens(desktopCapturer, topology, {
    currentTopology: captureTopology,
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
    admit,
  });
  guard();
  const source = sources.find((s) => s.id === String(display.id));
  if (!source) throw new Error("Fonte de monitor indisponível.");
  // Normalize the native image to a single physical-pixel representation.
  const encoded = source.image.toPNG();
  admit(sizes, encoded.length);
  const image = nativeImage.createFromBuffer(encoded);
  const normalized = image.getSize();
  if (normalized.width !== source.width || normalized.height !== source.height)
    throw new Error("Dimensões alteradas durante a normalização do monitor.");
  guard();
  return { image, sourceId: source.sourceId };
}
async function beginCapture() {
  if (starting || capture || photoCapture?.busy) return;
  starting = true;
  try {
    if (librarySwitch) throw new Error("Aguarde a transferência da biblioteca antes de capturar.");
    desktop.assertAccess();
    closeController();
    const display = chooseDisplay(
      screen.getAllDisplays(),
      monitorPreference,
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id,
    );
    editor.hide();
    await delay(250);
    const { image, sourceId } = await getScreen(display);
    const active = { display, image, sourceId, mode: "select" };
    active.job = desktop.jobs.begin({
      preserveForMs: 0,
      stop: () => preserveCapture(active),
    });
    capture = active;
    overlay = createWindow("overlay", {
      ...display.bounds,
      minWidth: 1,
      minHeight: 1,
      frame: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    });
    overlay.setBounds(display.bounds);
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.once("ready-to-show", () => {
      if (overlay) {
        overlay.show();
        overlay.focus();
      }
    });
    overlay.on("closed", () => {
      overlay = null;
      if (capture?.mode === "select") {
        capture.job?.finish();
        capture = null;
        showEditor();
      }
    });
  } catch (error) {
    cleanup();
    send("notice", { error: true, message: error.message });
  } finally {
    starting = false;
  }
}
function openController(mode) {
  closeController();
  const height =
    mode === "scroll"
      ? Math.min(720, capture.display.workAreaSize?.height || 720)
      : mode === "video"
        ? 340
        : 180;
  const position = controlPosition(
    capture.rect,
    capture.display,
    screen.getAllDisplays(),
    410,
    height,
  );
  controller = createWindow("controller", {
    width: 410,
    height,
    minWidth: 410,
    minHeight: 100,
    ...position,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
  });
  controller.setContentProtection(true);
  controller.once("ready-to-show", () => {
    if (capture?.mode === "video") {
      controller?.show();
      controller?.focus();
    } else controller?.showInactive();
  });
  controller.on("close", (e) => {
    if (capture) {
      e.preventDefault();
      if (capture.mode === "video") stopRecording();
      else if (capture.mode === "scroll") pauseScroll("Rolagem pausada; trechos preservados.");
      else cleanup();
    }
  });
}
async function selectRegion({ rect, mode }) {
  if (capture?.mode !== "select" || !["image", "video", "scroll"].includes(mode))
    throw new Error("Sessão inválida.");
  const crop = pixelRect(rect, capture.display.size, capture.image.getSize());
  if (mode === "scroll") {
    const size = capture.image.getSize();
    checkScrollBytes(scrollBudget([crop], crop) + size.width * size.height * 4);
  }
  capture.rect = rect;
  capture.crop = crop;
  capture.mode = mode;
  const active = capture;
  await showCaptureFrames();
  if (capture !== active) return;
  closeOverlay();
  if (mode === "image") {
    const image = capture.image.crop(crop);
    const entry = await library.save(
      {
        name: `Captura ${new Date().toLocaleString("pt-BR").replaceAll("/", "-")}`,
        kind: "image",
        preview: thumbnail(image),
        sourceApp: "Tela",
      },
      image.toPNG(),
    );
    cleanup();
    send("document", await library.read(entry.id));
  } else if (mode === "video") {
    openController("video");
  } else {
    const first = capture.image.crop(crop);
    capture.segments = [first];
    capture.overlaps = [0];
    capture.scroll = new ScrollSession(first, scrollWorkerEntry);
    capture.image = null;
    capture.automation = new ScrollAutomation();
    openController("scroll");
    scheduleScroll(capture);
  }
}
function ensureScroll(active) {
  if (!active.scroll) active.scroll = new ScrollSession(active.segments[0], scrollWorkerEntry);
  if (!active.automation) active.automation = new ScrollAutomation();
  return active.scroll;
}
function syncScroll(active) {
  active.segments = active.scroll.images;
  active.overlaps = active.scroll.cuts;
  active.feedback = active.scroll.warning;
}
function pauseScroll(message = "Rolagem pausada; trechos preservados.") {
  const active = capture;
  if (active?.mode !== "scroll") return;
  clearTimeout(active.scrollTimer);
  active.scrollGeneration = (active.scrollGeneration || 0) + 1;
  active.automation?.stop();
  ensureScroll(active).stop(message);
  syncScroll(active);
  controller?.webContents.send("control-update", controlState());
}
function scheduleScroll(active) {
  clearTimeout(active.scrollTimer);
  if (
    capture !== active ||
    active.restricted ||
    active.interrupted ||
    active.finishing ||
    active.scroll?.paused ||
    active.segments.length >= 30
  )
    return;
  active.scrollTimer = setTimeout(async () => {
    try {
      await nextSegment(true);
    } catch (error) {
      if (capture === active) pauseScroll(error.message);
    }
    scheduleScroll(active);
  }, 650);
}
function movingNativeRegion(active) {
  const area = active.scroll.margins,
    pixels = active.crop;
  const xScale = active.rect.width / pixels.width,
    yScale = active.rect.height / pixels.height;
  return screen.dipToScreenRect(null, {
    x: active.display.bounds.x + active.rect.x + area.left * xScale,
    y: active.display.bounds.y + active.rect.y + area.top * yScale,
    width: active.rect.width - (area.left + area.right) * xScale,
    height: active.rect.height - (area.top + area.bottom) * yScale,
  });
}
async function scrollTargets() {
  const active = capture;
  if (active?.mode !== "scroll" || active.restricted || active.interrupted)
    throw new Error("Sessão indisponível.");
  pauseScroll("Escolha a janela e autorize o início automático.");
  const generation = active.scrollGeneration || 0;
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  if (
    capture !== active ||
    active.restricted ||
    active.interrupted ||
    generation !== (active.scrollGeneration || 0)
  )
    throw new Error("Sessão encerrada.");
  if (sources.length > 128) throw new Error("Limite de janelas excedido.");
  const own = new Set(
    BrowserWindow.getAllWindows().map((win) =>
      win.getNativeWindowHandle().readBigUInt64LE().toString(),
    ),
  );
  const candidates = sources
    .map((source) => ({ handle: windowHandle(source.id), name: source.name.slice(0, 256) }))
    .filter((source) => !own.has(source.handle));
  const targets = await active.automation.list(
    candidates.map((source) => source.handle),
    movingNativeRegion(active),
  );
  if (
    capture !== active ||
    active.restricted ||
    active.interrupted ||
    generation !== (active.scrollGeneration || 0)
  ) {
    active.automation.stop();
    throw new Error("Sessão encerrada.");
  }
  return targets.map((target) => ({
    token: target.token,
    name: candidates.find((source) => source.handle === target.handle)?.name || "Janela",
  }));
}
async function startScrollAuto(request) {
  const active = capture;
  if (
    active?.mode !== "scroll" ||
    active.restricted ||
    active.interrupted ||
    active.finishing ||
    active.pending
  )
    throw new Error("Sessão indisponível.");
  const scroll = ensureScroll(active);
  if (request?.axis !== scroll.axis) throw new Error("Aplique o eixo antes de autorizar.");
  await active.automation.start(request, movingNativeRegion(active));
  try {
    desktop.assertAccess();
  } catch (error) {
    active.automation.stop();
    throw error;
  }
  if (capture !== active || active.restricted || active.interrupted || active.finishing) {
    active.automation.stop();
    throw new Error("Sessão encerrada.");
  }
  scroll.resume();
  active.autoStarted = false;
  active.unstableSamples = 0;
  scheduleScroll(active);
  controller?.webContents.send("control-update", controlState());
}
async function reviewScroll(input) {
  const active = capture;
  if (active?.mode !== "scroll" || active.finishing) throw new Error("Sessão indisponível.");
  pauseScroll();
  const generation = active.scrollGeneration || 0;
  await active.pending;
  if (capture !== active || generation !== (active.scrollGeneration || 0)) return;
  const scroll = ensureScroll(active);
  try {
    const result = await scroll.edit(input);
    if (capture !== active || generation !== (active.scrollGeneration || 0)) return;
    if (input.op !== "preview") active.savedScroll = null;
    syncScroll(active);
    const bitmap = result.result;
    if (!bitmap) throw new Error("Prévia indisponível.");
    controller?.webContents.send("control-update", controlState());
    return {
      ...controlState(),
      preview: nativeImage
        .createFromBitmap(
          Buffer.from(bitmap.bitmap.buffer, bitmap.bitmap.byteOffset, bitmap.bitmap.byteLength),
          { width: bitmap.width, height: bitmap.height },
        )
        .toDataURL(),
    };
  } finally {
    // edit() restores its snapshot and clears busy before this finalization. A
    // pause changes generation, but still requires reconciliation of this session.
    if (capture === active && active.scroll === scroll) {
      syncScroll(active);
      if (!controller?.isDestroyed())
        controller?.webContents.send("control-update", controlState());
    }
  }
}
async function nextSegment(automatic = false, manualOverlap = null) {
  const active = capture;
  if (active?.mode !== "scroll" || active.restricted || active.interrupted || active.finishing)
    return;
  const scroll = ensureScroll(active);
  if (automatic && scroll.paused) return;
  if (active.pending) {
    await active.pending;
    if (!automatic && capture === active) return nextSegment(false, manualOverlap);
    return;
  }
  const generation = active.scrollGeneration || 0;
  active.pending = (async () => {
    try {
      if (active.automation.waiting) {
        desktop.assertAccess();
        if (!(await active.automation.waitForTarget())) return;
      }
      if (active.automation.running) await active.automation.verify();
      if (
        capture !== active ||
        active.restricted ||
        active.interrupted ||
        generation !== (active.scrollGeneration || 0)
      )
        return;
      const { image } = await getScreen(active.display, scroll, () => {
        if (
          capture !== active ||
          active.interrupted ||
          generation !== (active.scrollGeneration || 0)
        )
          throw new Error("Aquisição cancelada; trechos preservados.");
      });
      if (capture !== active || active.interrupted || generation !== (active.scrollGeneration || 0))
        return;
      if (active.automation.running) await active.automation.verify();
      if (capture !== active || active.interrupted || generation !== (active.scrollGeneration || 0))
        return;
      const crop = pixelRect(active.rect, active.display.size, image.getSize());
      if (crop.width !== active.crop.width || crop.height !== active.crop.height)
        throw new Error("Dimensões do monitor alteradas; trechos preservados.");
      const result = await scroll.add(image.crop(crop), automatic, manualOverlap);
      if (capture !== active || active.interrupted || generation !== (active.scrollGeneration || 0))
        return;
      syncScroll(active);
      if (result === "added") active.savedScroll = null;
      if (active.automation.running && !active.restricted) {
        if (result === "ambiguous") pauseScroll(scroll.warning);
        else if (result === "waiting") {
          if (++active.unstableSamples >= 8)
            pauseScroll("Conteúdo não estabilizou; revise e use Fotografar trecho.");
        } else if (result === "stable" && active.autoStarted)
          pauseScroll("Fim provável: duas amostras estáveis sem avanço. Revise a prévia.");
        else {
          desktop.assertAccess();
          active.unstableSamples = 0;
          active.autoStarted = true;
          await active.automation.wheel(movingNativeRegion(active));
        }
      }
    } catch (error) {
      if (capture === active) {
        pauseScroll(error.message);
        controller?.webContents.send("control-error", error.message);
      }
      if (!automatic) throw error;
    } finally {
      if (capture === active) controller?.webContents.send("control-update", controlState());
    }
  })();
  try {
    await active.pending;
  } finally {
    active.pending = null;
  }
}
async function preserveCapture(active) {
  if (capture !== active) return;
  active.restricted = true;
  active.automation?.stop();
  clearTimeout(active.scrollTimer);
  if (active.mode === "video" && active.recordStarted) stopRecording();
  else if (active.mode === "scroll") await finishCapture(null);
  else cleanup();
}
async function finishCapture(overlap = null) {
  if (capture?.mode === "video") {
    stopRecording();
    return;
  }
  const active = capture;
  if (active?.mode !== "scroll") return;
  if (active.finishPromise) return active.finishPromise;
  active.finishing = true;
  active.automation?.stop();
  clearTimeout(active.scrollTimer);
  active.finishPromise = finishScrollCapture(active, overlap);
  return active.finishPromise;
}
async function finishScrollCapture(active, overlap) {
  const generation = active.scrollGeneration || 0;
  try {
    await active.pending;
    if (capture !== active || generation !== (active.scrollGeneration || 0)) return;
    const scroll = ensureScroll(active);
    if (overlap !== null) throw new Error("Ajuste cada emenda na revisão antes de salvar.");
    if (!active.savedScroll) {
      const output = await scroll.stitch();
      if (capture !== active || generation !== (active.scrollGeneration || 0)) return;
      const merged = output.result;
      if (!merged) throw new Error("Composição indisponível.");
      const image = nativeImage.createFromBitmap(
        Buffer.from(merged.bitmap.buffer, merged.bitmap.byteOffset, merged.bitmap.byteLength),
        { width: merged.width, height: merged.height },
      );
      const encoded = image.toPNG();
      scroll.checkPublication(encoded.length);
      active.savedScroll = await library.save(
        {
          name: "Captura com rolagem",
          kind: "image",
          preview: thumbnail(image),
          sourceApp: "Tela",
        },
        encoded,
      );
    }
    const doc = await library.read(active.savedScroll.id);
    if (capture === active && generation === (active.scrollGeneration || 0)) {
      const count = scroll.images.length;
      completeCapture(active);
      send("document", doc);
      send("notice", { message: count + " trecho(s) salvo(s) em uma imagem." });
    }
  } catch (error) {
    if (capture === active)
      pauseScroll("Falha ao salvar; trechos preservados para tentar novamente.");
    throw error;
  } finally {
    active.finishing = false;
    active.finishPromise = null;
    if (capture === active) controller?.webContents.send("control-update", controlState());
  }
}

/** The sound the person turned on for the quick video; nothing outside a video capture. */
function recordingAudio() {
  if (capture?.mode !== "video" || capture.stopRequested || capture.restricted)
    return { microphone: false, system: false };
  const options = videoOptions.read();
  return { microphone: options.microphone.enabled, system: options.system.enabled };
}

function controlState() {
  if (photoCapture?.busy && photoState)
    return { mode: "photo", ...photoState, cancelShortcut: photoCancelShortcut };
  return capture
    ? {
        mode: capture.mode,
        phase: capture.recordingState || "preparing",
        feedback: capture.feedback || "Primeira foto capturada. Pode rolar.",
        count: capture.segments?.length || 0,
        height: capture.crop.height,
        width: capture.crop.width,
        monitor:
          monitorState().displays.find((d) => d.id === String(capture.display.id))?.name ||
          "Monitor",
        frameVisible: captureFrames.length === 4,
        ...(capture.mode === "scroll" && capture.scroll
          ? {
              ...capture.scroll.state(),
              automatic: capture.automation?.running || false,
              waitingFocus: capture.automation?.waiting || false,
              steps: capture.automation?.steps || 0,
            }
          : {}),
      }
    : null;
}
function thumbnail(image) {
  const size = image.getSize(),
    scale = Math.min(240 / size.width, 150 / size.height, 1);
  return image
    .resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    })
    .toDataURL();
}
function pngBytes(data) {
  if (
    typeof data !== "string" ||
    data.length > 150_000_000 ||
    !data.startsWith("data:image/png;base64,")
  )
    throw new Error("Imagem inválida ou muito grande.");
  const image = nativeImage.createFromDataURL(data);
  if (image.isEmpty()) throw new Error("Imagem inválida.");
  const size = image.getSize();
  if (size.width * size.height > 100_000_000) throw new Error("Imagem maior que 100 megapixels.");
  return image.toPNG();
}
async function initialize() {
  const settingsPath = path.join(app.getPath("userData"), "library-settings.json");
  const preferences = await readPreferences(
    settingsPath,
    path.join(app.getPath("userData"), "captures"),
  );
  library = new Library(preferences.root, videoUrl);
  await library.init();
  startupRecoveries = await recordingStore.recoveries();
  const mediaSession = session.fromPartition("edicaptura-editor");
  mediaSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  mediaSession.setPermissionCheckHandler(() => false);
  mediaSession.webRequest.onBeforeRequest(
    { urls: ["edicaptura-media://*/*"] },
    (details, callback) => {
      callback({
        cancel:
          !editor ||
          editor.isDestroyed() ||
          details.webContentsId !== editor.webContents.id ||
          details.frame !== editor.webContents.mainFrame ||
          details.frame.url !== editor.trustedURL ||
          !["media", "xhr", "image"].includes(details.resourceType),
      });
    },
  );
  mediaSession.protocol.handle("edicaptura-media", (request) => videoStreams.respond(request));
  photoPreferences = new CapturePreferences(
    path.join(app.getPath("userData"), "photo-presets.json"),
    globalShortcut,
    (id) => {
      try {
        desktop.assertAccess();
        if (starting || capture || photoCapture?.busy || librarySwitch)
          throw new Error("Encerre a captura atual antes de usar um preset.");
        send("photo-preset", id);
      } catch (error) {
        send("notice", { error: true, message: error.message });
      }
    },
  );
  let profileError;
  try {
    await photoPreferences.load();
    await videoOptions.load();
  } catch (error) {
    profileError = error.message;
  }
  try {
    const prefs = JSON.parse(
      await fs.readFile(path.join(app.getPath("userData"), "capture-settings.json"), "utf8"),
    );
    if (typeof prefs.monitor === "string") monitorPreference = prefs.monitor;
  } catch {}
  editor = createWindow("editor");
  editor.once("ready-to-show", () => {
    editor.show();
    if (profileError)
      send("notice", {
        error: true,
        message: `Preferências preservadas, mas indisponíveis: ${profileError}`,
      });
  });
  editor.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (capture?.mode === "video") stopRecording();
    else send("before-close");
  });
  editor.on("closed", () => {
    videoStreams.revoke();
    editor = null;
    closeOverlay();
    closeController();
    closeCaptureFrames();
    app.quit();
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(
      allowCapturePermission({
        trusted:
          !capture?.stopRequested &&
          !capture?.restricted &&
          !!controller &&
          !controller.isDestroyed() &&
          wc === controller.webContents &&
          wc.getURL() === pageURL("controller"),
        mode: capture?.mode,
        started: capture?.recordStarted,
        permission,
        details,
        audio: recordingAudio(),
      }),
    ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const active = capture,
      owner = controller;
    const valid = () => {
      try {
        desktop.assertAccess();
      } catch {
        return false;
      }
      return (
        !!active &&
        active === capture &&
        owner === controller &&
        owner &&
        !owner.isDestroyed() &&
        request.frame === owner.webContents.mainFrame &&
        request.frame.url === owner.trustedURL &&
        active.mode === "video" &&
        active.recordStarted &&
        !active.stopRequested &&
        !active.restricted &&
        (!request.audioRequested || recordingAudio().system) &&
        request.videoRequested
      );
    };
    if (!valid()) return callback(null);
    try {
      const source = await resolveRecordingSource(active, valid, () =>
        desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
        }),
      );
      // Windows loopback; the controller asks Chromium to leave its own sound out.
      callback(
        source
          ? request.audioRequested
            ? { video: source, audio: "loopback" }
            : { video: source }
          : null,
      );
    } catch {
      callback(null);
    }
  });
  photoCapture = new PhotoCapture({
    sources: desktopCapturer,
    screen,
    images: nativeImage,
    assertAccess: () => desktop.assertAccess(),
    allowed: () => !librarySwitch && !capture && !starting,
    beginJob: (stop) => desktop.jobs.begin({ preserveForMs: 0, stop }),
    hide: () => {
      closeOverlay();
      editor.hide();
    },
    show: () => {
      photoSelection = null;
      closeOverlay();
      closeController();
      showEditor();
    },
    state: (state) => {
      photoState = state;
      send("photo-state", state);
      if (["countdown", "composing"].includes(state.phase)) {
        if (!controller || controller.isDestroyed()) {
          controller = createWindow("controller", {
            width: 410,
            height: 180,
            minWidth: 410,
            minHeight: 100,
            frame: false,
            alwaysOnTop: true,
            focusable: false,
          });
          const win = controller;
          win.setContentProtection(true);
          win.once("ready-to-show", () => {
            if (controller === win) win.showInactive();
          });
          win.on("close", (event) => {
            if (photoCapture?.busy) {
              event.preventDefault();
              photoCapture.interrupt();
            }
          });
        }
        controller.webContents.send("control-update", {
          mode: "photo",
          ...state,
          cancelShortcut: photoCancelShortcut,
        });
      } else closeController();
    },
    remember: (region) => photoPreferences.remember(region),
    select: (image, region, timing, precision) => {
      const profile = photoProfile();
      photoSelection = {
        image: image.toDataURL(),
        display: { width: region.width, height: region.height },
        pixels: image.getSize(),
        origin: { x: region.x, y: region.y },
        photo: true,
        timing,
        precision: precision ?? profile.defaults.precision,
        last: profile.lastValid ? profile.last : undefined,
      };
      // A bounded virtual desktop canvas allows selection across mixed-scale monitors.
      const bounds = screen.getPrimaryDisplay().workArea;
      overlay = createWindow("overlay", {
        ...bounds,
        minWidth: 1,
        minHeight: 1,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
      });
      const win = overlay;
      win.once("ready-to-show", () => {
        if (overlay === win && photoSelection) {
          win.show();
          win.focus();
        }
      });
      win.on("closed", () => {
        if (overlay === win) overlay = null;
      });
    },
    save: async (image) => {
      const entry = await library.save(
        {
          name: `Captura ${new Date().toLocaleString("pt-BR").replaceAll("/", "-")}`,
          kind: "image",
          preview: thumbnail(image),
          sourceApp: "Tela",
        },
        image.toPNG(),
      );
      return entry.id;
    },
    publish: async (id, current) => {
      const doc = await library.read(id);
      if (current()) send("document", doc);
    },
  });
  handle("photo:sources", ["editor"], () => photoCapture.sources());
  handle("photo:controls", ["editor"], (source) => photoCapture.children(source));
  handle("photo:start", ["editor"], startPhoto);
  handle("photo:preferences", ["editor"], () => photoProfile());
  handle("photo:preferences-save", ["editor"], async (input) => {
    if (starting || capture || photoCapture.busy)
      throw new Error("Encerre a captura antes de alterar presets.");
    const change = profileUpdateSchema.parse(input);
    const before = photoPreferences.read();
    for (const preset of change.presets)
      if (
        preset.region &&
        JSON.stringify(preset.region) !==
          JSON.stringify(before.presets.find((p) => p.id === preset.id)?.region)
      )
        validateSavedRegion(preset.region, captureTopology());
    await photoPreferences.update(change);
    return photoProfile();
  });
  handle("photo:preset", ["editor"], (id) => {
    if (starting || capture || photoCapture.busy)
      throw new Error("Encerre a captura atual antes de usar um preset.");
    if (typeof id !== "string") throw new Error("Preset inválido.");
    const preset = photoPreferences.read().presets.find((p) => p.id === id);
    if (!preset) throw new Error("Preset removido.");
    if (["window", "control"].includes(preset.mode)) {
      showEditor();
      return { chooseSource: true, ...preset };
    }
    return startPhoto({
      ...preset.options,
      timing: preset.mode.startsWith("region") ? preset.options.timing : "fresh",
      mode: preset.mode,
      ...(preset.region ? { savedRegion: preset.region } : {}),
    });
  });
  handle("photo:repeat", ["editor"], () => {
    const profile = photoPreferences.read();
    if (!profile.last) throw new Error("Selecione uma região primeiro.");
    validateSavedRegion(profile.last, captureTopology());
    return startPhoto({ ...profile.defaults, mode: "region-all", savedRegion: profile.last });
  });
  handle("photo:retry", ["editor"], () => photoCapture.retry());
  handle("photo:discard", ["editor"], () => photoCapture.discard());
  handle("capture:start", ["editor"], beginCapture);
  handle("capture:monitors", ["editor"], monitorState);
  handle("capture:monitor", ["editor"], async (id) => {
    if (starting || capture || photoCapture?.busy)
      throw new Error("Encerre a captura antes de trocar de monitor.");
    if (
      typeof id !== "string" ||
      (id !== "cursor" && !screen.getAllDisplays().some((d) => String(d.id) === id))
    )
      throw new Error("Monitor não disponível.");
    await fs.writeFile(
      path.join(app.getPath("userData"), "capture-settings.json"),
      JSON.stringify({ monitor: id }),
    );
    monitorPreference = id;
    return monitorState();
  });
  handle("app:close", ["editor"], async () => {
    if (photoCapture?.busy)
      throw new Error("Cancele a captura ou salve/descarte a imagem preservada antes de fechar.");
    await quickVideo?.close();
    await library.queue;
    closing = true;
    editor.close();
  });
  handle(
    "capture:init",
    ["overlay"],
    () =>
      photoSelection ||
      (capture?.mode === "select"
        ? {
            image: capture.image.toDataURL(),
            display: capture.display.size,
            pixels: capture.image.getSize(),
            origin: { x: capture.display.bounds.x, y: capture.display.bounds.y },
            precision: photoPreferences.read().defaults.precision,
          }
        : null),
  );
  handle("capture:select", ["overlay"], async (data) => {
    if (photoSelection) {
      if (data?.mode !== "image") throw new Error("Seleção de imagem inválida.");
      const origin = photoSelection.origin;
      return photoCapture.selected({
        ...data.rect,
        x: data.rect.x + origin.x,
        y: data.rect.y + origin.y,
      });
    }
    try {
      return await selectRegion(data);
    } catch (error) {
      cleanup();
      send("notice", { error: true, message: error.message });
      throw error;
    }
  });
  handle("capture:cancel", ["overlay", "controller"], () => {
    if (photoCapture?.busy) photoCapture.interrupt();
    else if (capture?.mode === "video" && capture.recordStarted) stopRecording();
    else if (capture?.mode === "scroll") pauseScroll();
    else cleanup();
  });
  handle("photo:cancel", ["editor"], () => {
    if (photoCapture?.busy) photoCapture.interrupt();
  });
  const applyPreferences = (prefs) => {
    if (prefs.startWithWindows && !app.isPackaged)
      throw new Error("Iniciar com Windows está disponível no aplicativo instalado.");
    app.setLoginItemSettings({ openAtLogin: prefs.startWithWindows, path: process.execPath });
    if (prefs.tray && !tray) {
      const pixels = Buffer.alloc(16 * 16 * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 255;
        pixels[i + 1] = 98;
        pixels[i + 2] = 0;
        pixels[i + 3] = 255;
      }
      tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }));
      tray.setToolTip("EdiCaptura");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Abrir EdiCaptura", click: showEditor },
          { label: "Capturar", click: beginCapture },
        ]),
      );
      tray.on("click", showEditor);
    } else if (!prefs.tray && tray) {
      tray.destroy();
      tray = null;
    }
  };
  libraryWorkflow = registerLibraryIpc({
    handle,
    electron: { clipboard, dialog, nativeImage, shell, BrowserWindow },
    editor: () => editor,
    library: () => library,
    preferences,
    settingsPath,
    assertAccess: () => desktop.assertAccess(),
    canSwitch: () =>
      !starting && !capture && !photoCapture?.busy && !recoveringVideo && !quickVideo?.busy(),
    isSwitching: () => librarySwitch,
    switching: (value) => {
      librarySwitch = value;
    },
    replaceRoot: async (root) => {
      const next = new Library(root, videoUrl);
      await next.init();
      await next.loadIndex();
      library = next;
      videoStreams.revoke();
    },
    thumbnail,
    applyPreferences,
  });
  quickVideo = registerQuickVideo({
    app,
    handle,
    library: () => library,
    streams: videoStreams,
    assertAccess: () => desktop.assertAccess(),
    beginJob: (stop) => desktop.jobs.begin({ preserveForMs: 0, stop }),
    chooseDestination: async (name, format) => {
      const result = await dialog.showSaveDialog(editor, {
        defaultPath: `${String(name)
          .split("")
          .map((character) =>
            character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
          )
          .join("")
          .slice(0, 120)}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      return result.canceled ? null : result.filePath;
    },
    remember: (file, format) => libraryWorkflow.rememberExport(file, format),
    progress: (value) => send("video-progress", value),
  });
  // Reapply only preferences explicitly persisted by the user.
  if (preferences.tray || preferences.startWithWindows) applyPreferences(preferences);
  handle("library:list", ["editor"], (query) => library.list(query));
  handle("library:read", ["editor"], (id) => library.read(id));
  handle("library:update", ["editor"], (data) => library.updateMetadata(data));
  handle("library:recover", ["editor"], async (id) => {
    await library.recover(id);
    return library.read(id);
  });
  handle("library:save", ["editor"], async (data) => {
    if (!data || !Array.isArray(data.annotations) || data.annotations.length > 1000)
      throw new Error("Projeto inválido.");
    const edits = imageEditSchema.parse({
      annotations: data.annotations,
      crop: data.crop,
      viewTransform: data.viewTransform,
    });
    const assets = [...collectImageAssets(edits.annotations, data.assets)].map(([id, dataUrl]) => ({
      id,
      bytes: pngBytes(dataUrl),
    }));
    const preview = data.preview
      ? thumbnail(nativeImage.createFromBuffer(pngBytes(data.preview)))
      : undefined;
    return library.save(
      {
        id: data.id,
        name: data.name,
        annotations: edits.annotations,
        crop: edits.crop,
        viewTransform: edits.viewTransform,
        kind: "image",
        preview,
      },
      data.dataUrl ? pngBytes(data.dataUrl) : null,
      assets,
    );
  });
  handle("image:import", ["editor"], async () => {
    const result = await dialog.showOpenDialog(editor, {
      title: "Abrir imagem ou vídeo WebM",
      properties: ["openFile"],
      filters: [
        { name: "Imagens e vídeo WebM", extensions: ["png", "jpg", "jpeg", "webp", "webm"] },
      ],
    });
    if (result.canceled) return null;
    desktop.assertAccess();
    const file = result.filePaths[0];
    const stat = await fs.stat(file);
    if (stat.size > 400_000_000) throw new Error("Arquivo maior que 400 MB.");
    return libraryWorkflow.importMedia({
      name: path.basename(file).slice(0, 120),
      bytes: new Uint8Array(await fs.readFile(file)),
    });
  });
  handle("image:copy", ["editor"], (data) => {
    clipboard.writeImage(nativeImage.createFromBuffer(pngBytes(data)));
    return true;
  });
  handle("image:import-object", ["editor"], async () => {
    const result = await dialog.showOpenDialog(editor, {
      title: "Inserir imagem na captura",
      properties: ["openFile"],
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (result.canceled) return null;
    desktop.assertAccess();
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 50_000_000) throw new Error("Escolha imagem de até 50 MB.");
    const image = await decodeRaster(new Uint8Array(await fs.readFile(result.filePaths[0])), {
      nativeImage,
      BrowserWindow,
    });
    return nativeImage.createFromBuffer(pngBytes(image.toDataURL())).toDataURL();
  });
  handle("image:paste", ["editor"], () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) throw new Error("A área de transferência não contém imagem.");
    return nativeImage.createFromBuffer(pngBytes(image.toDataURL())).toDataURL();
  });
  handle("image:bytes", ["editor"], async (bytes) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 50_000_000)
      throw new Error("Imagem inválida ou maior que 50 MB.");
    const image = await decodeRaster(bytes, { nativeImage, BrowserWindow });
    return nativeImage.createFromBuffer(pngBytes(image.toDataURL())).toDataURL();
  });
  handle("file:export", ["editor"], async ({ dataUrl, id, format, name, quality = 92 }) => {
    const originalLibrary = library,
      originalRoot = library.root,
      originalEditor = editor,
      originalFrame = editor.webContents.mainFrame;
    const assertAuthority = () => {
      desktop.assertAccess();
      if (
        library !== originalLibrary ||
        library.root !== originalRoot ||
        librarySwitch ||
        editor !== originalEditor ||
        originalEditor.isDestroyed() ||
        originalEditor.webContents.mainFrame !== originalFrame ||
        originalFrame.url !== originalEditor.trustedURL
      )
        throw new Error("Biblioteca ou sessão alterada durante a exportação.");
    };
    assertAuthority();
    if (!["png", "jpg", "webp", "webm"].includes(format)) throw new Error("Formato inválido.");
    if (!Number.isInteger(quality) || quality < 10 || quality > 100)
      throw new Error("Qualidade inválida.");
    const safeName = String(name || "Captura")
      .split("")
      .map((character) =>
        character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
      )
      .join("")
      .replace(/\.(png|jpe?g|webp|webm)$/i, "");
    const settingsPath = path.join(app.getPath("userData"), "export-settings.json");
    let directory = app.getPath("pictures");
    try {
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      if (typeof settings.directory === "string" && path.isAbsolute(settings.directory))
        directory = settings.directory;
    } catch (error) {
      if (error.code !== "ENOENT")
        send("notice", {
          message: "Não foi possível ler a pasta de exportação anterior. Escolha o destino.",
        });
    }
    const result = await dialog.showSaveDialog(editor, {
      defaultPath: path.join(directory, safeName + "." + format),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled) return null;
    assertAuthority();
    let webp;
    if (format === "webp") {
      if (
        typeof dataUrl !== "string" ||
        !dataUrl.startsWith("data:image/webp;base64,") ||
        dataUrl.length > 150_000_000
      )
        throw new Error("WebP inválido.");
      const image = await decodeRaster(
          Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
          { nativeImage, BrowserWindow },
          150_000_000,
        ),
        size = image.getSize();
      if (image.isEmpty() || size.width * size.height > 100_000_000)
        throw new Error("WebP inválido ou muito grande.");
      webp = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    }
    const bytes =
      format === "webm"
        ? null
        : format === "webp"
          ? webp
          : format === "jpg"
            ? nativeImage.createFromBuffer(pngBytes(dataUrl)).toJPEG(quality)
            : pngBytes(dataUrl);
    assertAuthority();
    await publishIndividualExport(
      originalRoot,
      result.filePath,
      assertAuthority,
      async (staging) => {
        if (format === "webm") {
          const document = await originalLibrary.read(id);
          assertAuthority();
          if (document.kind !== "video" || document.deletedAt)
            throw new Error("Vídeo indisponível.");
          if (document.videoRecipe)
            throw new Error("Vídeo aparado: exporte o intervalo em MP4 ou GIF pelo editor.");
          await copyVideo(originalLibrary.file(id, "webm"), staging);
        } else await atomicWrite(staging, bytes);
      },
    );
    try {
      await atomicWrite(settingsPath, JSON.stringify({ directory: path.dirname(result.filePath) }));
    } catch {
      send("notice", { message: "Arquivo exportado. Não foi possível guardar a pasta escolhida." });
    }
    await libraryWorkflow.rememberExport(result.filePath, format);
    return result.filePath;
  });
  handle("control:state", ["controller"], controlState);
  handle("record:options", ["controller"], () => ({
    ...videoOptions.read(),
    error: videoOptions.error,
  }));
  handle("record:options-save", ["controller"], async (input) => {
    if (capture?.mode !== "video" || capture.recordStarted)
      throw new Error("As opções de vídeo valem antes de começar a gravar.");
    return videoOptions.save(input);
  });
  handle("control:next", ["controller"], (overlap) => nextSegment(false, overlap ?? null));
  handle("control:finish", ["controller"], finishCapture);
  handle("scroll:review", ["controller"], reviewScroll);
  handle("scroll:targets", ["controller"], scrollTargets);
  handle("scroll:auto", ["controller"], startScrollAuto);
  handle("scroll:pause", ["controller"], () => pauseScroll());
  handle("scroll:assist", ["controller"], () => {
    if (
      capture?.mode !== "scroll" ||
      capture.restricted ||
      capture.interrupted ||
      capture.finishing
    )
      throw new Error("Sessão indisponível.");
    capture.automation?.stop();
    ensureScroll(capture).resume();
    scheduleScroll(capture);
    controller?.webContents.send("control-update", controlState());
  });
  handle("record:begin", ["controller"], async () => {
    if (capture?.mode !== "video" || capture.recordStarted) return;
    const active = capture;
    active.recordStarted = true;
    const recording = await recordingStore.begin(library.root);
    active.recording = recording;
    if (capture !== active || active.stopRequested || active.restricted)
      throw new Error("Gravação interrompida antes de iniciar.");
    controller.show();
    controller.focus();
    const payload = JSON.stringify({
      rect: capture.rect,
      display: capture.display.size,
      ...recording,
    });
    await controller.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edicaptura-record', {detail:${payload}}))`,
      true,
    );
  });
  handle("record:ready", ["controller"], () => {
    if (capture?.mode !== "video" || capture.stopRequested || capture.restricted)
      throw new Error("Sessão encerrada.");
    capture.recordingState = "recording";
    controller?.webContents.send("control-update", controlState());
    return true;
  });
  handle("record:phase", ["controller"], (phase) => {
    if (capture?.mode !== "video" || !capture.recordStarted || !RECORDING_PHASES.includes(phase))
      throw new Error("Estado de gravação inválido.");
    capture.recordingState = phase;
    controller?.webContents.send("control-update", controlState());
  });
  handle("record:append", ["controller"], async (raw) => {
    const input = appendSchema.parse(raw);
    if (capture?.mode !== "video" || capture.recording?.sessionId !== input.sessionId)
      throw new Error("Sessão de gravação inválida.");
    const active = capture;
    const ack = await recordingStore.append(input);
    active.recordedBytes = ack.bytes;
    active.durationMs = ack.durationMs;
    if (capture === active) controller?.webContents.send("record-progress", ack);
    return ack;
  });
  handle("record:save", ["controller"], async (raw) => {
    const input = finishSchema.parse(raw);
    if (capture?.mode !== "video" || capture.recording?.sessionId !== input.sessionId)
      throw new Error("Gravação encerrada.");
    const active = capture;
    try {
      await recordingStore.finish(input);
      let document;
      await recordingStore.commit(
        input.sessionId,
        library.root,
        (file, journal) => library.importVideoFile(file, journal),
        async (entry) => {
          document = await library.read(entry.id);
        },
      );
      // Leave the controller alive until its save IPC receives the durable ACK.
      active.job?.finish();
      closeCaptureFrames();
      capture = null;
      controller?.hide();
      showEditor();
      if (!active.restricted) send("document", document);
      return true;
    } catch (error) {
      throw new Error(
        `Não foi possível concluir o salvamento. Tente Parar e salvar novamente. Partes confirmadas preservadas na sessão ${input.sessionId}.`,
        { cause: error },
      );
    }
  });
  handle("record:recoveries", ["editor"], () => startupRecoveries);
  handle("record:recover", ["editor"], async (sessionId) => {
    if (capture || librarySwitch || recoveringVideo)
      throw new Error("Encerre a captura ou recuperação antes de recuperar.");
    if (!startupRecoveries.some((item) => item.sessionId === sessionId))
      throw new Error("Recuperação não autorizada.");
    const original = library;
    recoveringVideo = true;
    try {
      let document;
      await recordingStore.commit(
        sessionId,
        original.root,
        (file, journal) => original.importVideoFile(file, journal),
        async (entry) => {
          document = await original.read(entry.id);
          if (library !== original || librarySwitch)
            throw new Error("A biblioteca mudou durante a recuperação.");
        },
      );
      startupRecoveries = startupRecoveries.filter((item) => item.sessionId !== sessionId);
      return document;
    } finally {
      recoveringVideo = false;
    }
  });
  handle("record:failed", ["controller"], (message) => {
    cleanup();
    send("notice", { error: true, message: String(message) });
  });
  photoCancelShortcut = globalShortcut.register("CommandOrControl+Shift+Escape", () => {
    if (photoCapture?.busy) photoCapture.interrupt();
    else if (capture?.mode === "scroll") pauseScroll();
  });
  globalShortcut.register("PrintScreen", beginCapture);
  globalShortcut.register("CommandOrControl+Shift+S", beginCapture);
  globalShortcut.register("CommandOrControl+Shift+F10", () => {
    if (capture?.mode === "video") stopRecording();
  });
  globalShortcut.register("CommandOrControl+Shift+F9", () => {
    if (
      capture?.mode === "video" &&
      capture.recordStarted &&
      controller &&
      !controller.isDestroyed()
    )
      controller.webContents.send("record-toggle-pause");
  });
  globalShortcut.register("CommandOrControl+Shift+PageDown", () => {
    try {
      desktop.assertAccess();
      void nextSegment(false).catch((error) =>
        send("notice", { error: true, message: error.message }),
      );
    } catch {
      send("notice", {
        error: true,
        message: "Valide sua assinatura antes de continuar a captura.",
      });
    }
  });
  photoPreferences.activate();
  handle("app:status", ["editor"], () => ({
    captureShortcut: globalShortcut.isRegistered("PrintScreen")
      ? "Print Screen"
      : globalShortcut.isRegistered("CommandOrControl+Shift+S")
        ? "Ctrl+Shift+S"
        : "Use o botão Capturar",
    version: app.getVersion(),
    photoCancelShortcut,
  }));
  const displaysChanged = (_event, display, changed) => {
    send("monitors-changed", monitorState());
    if (photoCapture?.busy)
      photoCapture.interrupt("Topologia alterada. Imagem já adquirida preservada.");
    if (!capture || display?.id !== capture.display.id) return;
    const missing = !screen.getAllDisplays().some((d) => d.id === capture.display.id);
    if (!missing && !changed?.some((k) => ["bounds", "scaleFactor", "rotation"].includes(k)))
      return;
    send("notice", {
      error: true,
      message:
        "O monitor da captura foi desconectado ou sua resolução mudou. A captura foi encerrada; selecione o monitor novamente.",
    });
    if (capture.mode === "video") {
      closeCaptureFrames();
      stopRecording();
    } else if (capture.mode === "scroll") {
      const active = capture;
      active.interrupted = true;
      active.automation?.stop();
      clearTimeout(active.scrollTimer);
      void finishCapture(null).catch((error) =>
        controller?.webContents.send(
          "control-error",
          `${error.message} — tente Pronto para salvar os trechos preservados.`,
        ),
      );
    } else cleanup();
  };
  screen.on("display-added", displaysChanged);
  screen.on("display-removed", displaysChanged);
  screen.on("display-metrics-changed", displaysChanged);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showEditor);
  app
    .whenReady()
    .then(async () => {
      await desktop.start();
      await initialize();
    })
    .catch((error) => {
      dialog.showErrorBox("EdiCaptura", error.message);
      app.quit();
    });
}
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
