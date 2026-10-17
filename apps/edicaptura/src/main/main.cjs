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
} = require("electron");
const { createEdiDesktop, desktopIpc: ipcMain } = require("@informach/edi-desktop/main");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { atomicWrite } = require("@informach/edi-desktop/files");
const { pathToFileURL } = require("node:url");
const { Library } = require("./library.cjs");
const { signature, difference, findOverlap, stitchBitmaps } = require("../capture/scroll.cjs");
const { allowCapturePermission } = require("./capture-permission.cjs");
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
    "record:failed",
    "record:ready",
    "control:finish",
    "control:state",
    "capture:cancel",
  ],
});
app.setAppUserModelId("br.com.informach.edicaptura");
let editor,
  overlay,
  controller,
  capture,
  library,
  starting = false,
  closing = false;
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
    return fn(...args);
  });
}
function send(name, data) {
  if (editor && !editor.isDestroyed()) editor.webContents.send(name, data);
}
function stopRecording() {
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
async function getScreen(display) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
  });
  const source =
    sources.find((s) => s.display_id === String(display.id)) ||
    (sources.length === 1 ? sources[0] : null);
  if (!source || source.thumbnail.isEmpty())
    throw new Error(
      "Não foi possível capturar este monitor. Verifique a permissão de gravação de tela.",
    );
  // Normalize the native image to a single physical-pixel representation.
  const image = nativeImage.createFromBuffer(source.thumbnail.toPNG());
  return { image, sourceId: source.id };
}
async function beginCapture() {
  if (starting || capture) return;
  starting = true;
  try {
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
  const height = mode === "scroll" ? 350 : 180;
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
      else cleanup();
    }
  });
}
async function selectRegion({ rect, mode }) {
  if (!capture || capture.mode !== "select" || !["image", "video", "scroll"].includes(mode))
    throw new Error("Sessão inválida.");
  const crop = pixelRect(rect, capture.display.size, capture.image.getSize());
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
      { name: `Captura ${new Date().toLocaleString("pt-BR").replaceAll("/", "-")}`, kind: "image" },
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
    capture.lastSignature = signature(first.toBitmap(), crop.width, crop.height);
    openController("scroll");
    scheduleScroll(capture);
  }
}
function scheduleScroll(active) {
  clearTimeout(active.scrollTimer);
  if (capture !== active || active.restricted || active.finishing || active.segments.length >= 30)
    return;
  active.scrollTimer = setTimeout(async () => {
    await nextSegment(true);
    scheduleScroll(active);
  }, 650);
}
async function nextSegment(automatic = false, manualOverlap = null) {
  const active = capture;
  if (active?.mode !== "scroll" || active.restricted || active.finishing) return;
  if (active.pending) {
    await active.pending;
    if (!automatic && capture === active) return nextSegment(false, manualOverlap);
    return;
  }
  active.pending = (async () => {
    try {
      if (active.segments.length >= 30)
        throw new Error("Limite de 30 trechos atingido. Clique em Pronto.");
      const { image } = await getScreen(active.display);
      if (capture !== active) return;
      const crop = pixelRect(active.rect, active.display.size, image.getSize());
      const piece = image.crop(crop),
        sample = signature(piece.toBitmap(), crop.width, crop.height);
      if (automatic && (!active.previousSample || difference(active.previousSample, sample) > 3)) {
        active.previousSample = sample;
        return;
      }
      active.previousSample = sample;
      let overlap = findOverlap(active.lastSignature, sample);
      if (overlap === crop.height) {
        if (!automatic) active.feedback = "A tela não mudou. Role para baixo para a próxima foto.";
        return;
      }
      if (overlap === null) {
        if (automatic) {
          controller?.webContents.send(
            "control-error",
            "Alinhamento automático indisponível. Clique em Fotografar trecho para registrar esta tela.",
          );
          return;
        }
        if (
          manualOverlap !== null &&
          (!Number.isInteger(manualOverlap) || manualOverlap < 0 || manualOverlap >= crop.height)
        )
          throw new Error("Sobreposição inválida.");
        overlap = manualOverlap ?? 0;
        active.manualUnaligned = true;
      }
      const nextHeight =
        active.segments.reduce((h, f, i) => h + f.getSize().height - active.overlaps[i], 0) +
        crop.height -
        overlap;
      if (nextHeight > 30000 || nextHeight * crop.width > 100_000_000)
        throw new Error("Limite de tamanho atingido. Clique em Pronto para salvar.");
      active.segments.push(piece);
      active.overlaps.push(overlap);
      active.lastSignature = sample;
      active.feedback = active.manualUnaligned
        ? "Foto capturada sem alinhamento automático. Ajuste a sobreposição antes de unir."
        : "Foto capturada. Pode rolar para o próximo trecho.";
      controller?.webContents.send(
        "control-error",
        active.manualUnaligned
          ? "Trecho mantido inteiro. A imagem pode conter partes repetidas."
          : "",
      );
      active.manualUnaligned = false;
    } catch (error) {
      if (capture === active) controller?.webContents.send("control-error", error.message);
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
  if (active?.mode !== "scroll" || active.finishing) return;
  active.finishing = true;
  clearTimeout(active.scrollTimer);
  try {
    await active.pending;
    if (capture !== active) return;
    if (
      overlap !== null &&
      (!Number.isInteger(overlap) || overlap < 0 || overlap >= active.crop.height)
    )
      throw new Error("Sobreposição inválida.");
    const cuts =
      overlap === null ? active.overlaps : active.overlaps.map((v, i) => (i ? overlap : 0));
    const frames = active.segments.map((image) => ({
      ...image.getSize(),
      bitmap: image.toBitmap(),
    }));
    const merged = stitchBitmaps(frames, cuts);
    const image = nativeImage.createFromBitmap(merged.bitmap, {
      width: merged.width,
      height: merged.height,
    });
    const entry = await library.save({ name: "Captura com rolagem", kind: "image" }, image.toPNG());
    const doc = await library.read(entry.id);
    if (capture === active) {
      completeCapture(active);
      send("document", doc);
      send("notice", { message: frames.length + " trecho(s) salvo(s) em uma imagem." });
    }
  } catch (error) {
    if (capture === active) {
      active.finishing = false;
      scheduleScroll(active);
    }
    throw error;
  }
}
function controlState() {
  return capture
    ? {
        mode: capture.mode,
        feedback: capture.feedback || "Primeira foto capturada. Pode rolar.",
        count: capture.segments?.length || 0,
        height: capture.crop.height,
        width: capture.crop.width,
        monitor:
          monitorState().displays.find((d) => d.id === String(capture.display.id))?.name ||
          "Monitor",
        frameVisible: captureFrames.length === 4,
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
  library = new Library(path.join(app.getPath("userData"), "captures"));
  await library.init();
  try {
    const prefs = JSON.parse(
      await fs.readFile(path.join(app.getPath("userData"), "capture-settings.json"), "utf8"),
    );
    if (typeof prefs.monitor === "string") monitorPreference = prefs.monitor;
  } catch {}
  editor = createWindow("editor");
  editor.once("ready-to-show", () => editor.show());
  editor.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    if (capture?.mode === "video") stopRecording();
    else send("before-close");
  });
  editor.on("closed", () => {
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
          !!controller &&
          !controller.isDestroyed() &&
          wc === controller.webContents &&
          wc.getURL() === pageURL("controller"),
        mode: capture?.mode,
        started: capture?.recordStarted,
        permission,
        details,
      }),
    ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      !request.frame ||
      request.frame !== controller?.webContents.mainFrame ||
      capture?.mode !== "video" ||
      !capture.recordStarted ||
      request.audioRequested
    )
      return callback(null);
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find((s) => s.id === capture.sourceId);
      callback(source ? { video: source } : null);
    } catch {
      callback(null);
    }
  });
  handle("capture:start", ["editor"], beginCapture);
  handle("capture:monitors", ["editor"], monitorState);
  handle("capture:monitor", ["editor"], async (id) => {
    if (starting || capture) throw new Error("Encerre a captura antes de trocar de monitor.");
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
    await library.queue;
    closing = true;
    editor.close();
  });
  handle("capture:init", ["overlay"], () =>
    capture?.mode === "select"
      ? {
          image: capture.image.toDataURL(),
          display: capture.display.size,
          pixels: capture.image.getSize(),
        }
      : null,
  );
  handle("capture:select", ["overlay"], async (data) => {
    try {
      return await selectRegion(data);
    } catch (error) {
      cleanup();
      send("notice", { error: true, message: error.message });
      throw error;
    }
  });
  handle("capture:cancel", ["overlay", "controller"], cleanup);
  handle("library:list", ["editor"], () => library.list());
  handle("library:read", ["editor"], (id) => library.read(id));
  handle("library:save", ["editor"], async (data) => {
    if (
      !data ||
      !Array.isArray(data.annotations) ||
      data.annotations.length > 1000 ||
      JSON.stringify(data.annotations).length > 2_000_000
    )
      throw new Error("Projeto inválido.");
    const preview = data.preview
      ? thumbnail(nativeImage.createFromBuffer(pngBytes(data.preview)))
      : undefined;
    return library.save(
      {
        id: data.id,
        name: data.name,
        annotations: data.annotations,
        crop: data.crop,
        kind: "image",
        preview,
      },
      data.dataUrl ? pngBytes(data.dataUrl) : null,
    );
  });
  handle("image:import", ["editor"], async () => {
    const result = await dialog.showOpenDialog(editor, {
      title: "Abrir imagem",
      properties: ["openFile"],
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (result.canceled) return null;
    desktop.assertAccess();
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 50_000_000) throw new Error("Escolha uma imagem de até 50 MB.");
    const image = nativeImage.createFromPath(result.filePaths[0]);
    if (image.isEmpty()) throw new Error("Formato de imagem não suportado.");
    const entry = await library.save(
      { name: path.basename(result.filePaths[0]), kind: "image" },
      pngBytes(image.toDataURL()),
    );
    return library.read(entry.id);
  });
  handle("image:copy", ["editor"], (data) => {
    clipboard.writeImage(nativeImage.createFromBuffer(pngBytes(data)));
    return true;
  });
  handle("file:export", ["editor"], async ({ dataUrl, id, format, name }) => {
    if (!["png", "jpg", "webm"].includes(format)) throw new Error("Formato inválido.");
    const safeName = String(name || "Captura")
      .split("")
      .map((character) =>
        character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
      )
      .join("")
      .replace(/\.(png|jpe?g|webm)$/i, "");
    const result = await dialog.showSaveDialog(editor, {
      defaultPath: path.join(app.getPath("pictures"), safeName + "." + format),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled) return null;
    const bytes =
      format === "webm"
        ? await fs.readFile(library.file(id, "webm"))
        : format === "jpg"
          ? nativeImage.createFromBuffer(pngBytes(dataUrl)).toJPEG(92)
          : pngBytes(dataUrl);
    desktop.assertAccess();
    await atomicWrite(result.filePath, bytes);
    return result.filePath;
  });
  handle("control:state", ["controller"], controlState);
  handle("control:next", ["controller"], (overlap) => nextSegment(false, overlap ?? null));
  handle("control:finish", ["controller"], finishCapture);
  handle("record:begin", ["controller"], async () => {
    if (capture?.mode !== "video" || capture.recordStarted) return;
    capture.recordStarted = true;
    capture.recoveryPath = path.join(app.getPath("userData"), "recovery", `${randomUUID()}.webm`);
    controller.show();
    controller.focus();
    const payload = JSON.stringify({ rect: capture.rect, display: capture.display.size });
    await controller.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edicaptura-record', {detail:${payload}}))`,
      true,
    );
  });
  handle("record:ready", ["controller"], () => true);
  handle("record:save", ["controller"], async (bytes) => {
    if (capture?.mode !== "video" || !capture.recordStarted) throw new Error("Gravação encerrada.");
    const active = capture;
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 400_000_000)
        throw new Error("Vídeo excedeu 400 MB.");
      await fs.mkdir(path.dirname(active.recoveryPath), { recursive: true });
      await atomicWrite(active.recoveryPath, bytes);
      const entry = await library.save(
        { name: `Gravação ${new Date().toLocaleString("pt-BR")}`, kind: "video" },
        Buffer.from(bytes),
      );
      await fs.unlink(active.recoveryPath);
      completeCapture(active);
      send("document", await library.read(entry.id));
      return true;
    } catch (error) {
      throw new Error(
        `Não foi possível concluir o salvamento. Tente Salvar trabalho existente novamente. Cópia de recuperação, se gravada: ${active.recoveryPath}`,
        { cause: error },
      );
    }
  });
  handle("record:failed", ["controller"], (message) => {
    cleanup();
    send("notice", { error: true, message: String(message) });
  });
  globalShortcut.register("PrintScreen", beginCapture);
  globalShortcut.register("CommandOrControl+Shift+S", beginCapture);
  globalShortcut.register("CommandOrControl+Shift+F10", () => {
    if (capture?.mode === "video") stopRecording();
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
  handle("app:status", ["editor"], () => ({
    captureShortcut: globalShortcut.isRegistered("PrintScreen")
      ? "Print Screen"
      : globalShortcut.isRegistered("CommandOrControl+Shift+S")
        ? "Ctrl+Shift+S"
        : "Use o botão Capturar",
    version: app.getVersion(),
  }));
  const displaysChanged = (_event, display, changed) => {
    send("monitors-changed", monitorState());
    if (!capture || display?.id !== capture.display.id) return;
    const missing = !screen.getAllDisplays().some((d) => d.id === capture.display.id);
    if (
      !missing &&
      (!changed || !changed.some((k) => ["bounds", "scaleFactor", "rotation"].includes(k)))
    )
      return;
    send("notice", {
      error: true,
      message:
        "O monitor da captura foi desconectado ou sua resolução mudou. A captura foi encerrada; selecione o monitor novamente.",
    });
    if (capture.mode === "video") {
      closeCaptureFrames();
      stopRecording();
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
