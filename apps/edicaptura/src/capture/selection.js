import {
  constrainSelection,
  globalToPixel,
  magnifierSample,
  nudgeSelection,
  pixelToGlobal,
} from "../domain/selection-precision.ts";
import { hydrateIcons } from "../shared/icons.js";

hydrateIcons();
document.documentElement.style.setProperty(
  "--capture-line",
  1 / (window.devicePixelRatio || 1) + "px",
);
const $ = (id) => document.getElementById(id);
const surface = $("surface"),
  picker = $("picker"),
  region = $("region"),
  toolbar = $("capture-toolbar");
let state,
  rect = null,
  drag = null,
  busy = false,
  videoMode = false;
let precision = { kind: "free" };
const pixelRect = () => ({
  x: Math.round((rect.x * state.pixels.width) / viewWidth),
  y: Math.round((rect.y * state.pixels.height) / viewHeight),
  width: Math.round((rect.width * state.pixels.width) / viewWidth),
  height: Math.round((rect.height * state.pixels.height) / viewHeight),
});
const fromPixels = (p) => ({
  x: (p.x * viewWidth) / state.pixels.width,
  y: (p.y * viewHeight) / state.pixels.height,
  width: (p.width * viewWidth) / state.pixels.width,
  height: (p.height * viewHeight) / state.pixels.height,
});
const area = () => ({
  x: state.origin?.x ?? 0,
  y: state.origin?.y ?? 0,
  width: state.display.width,
  height: state.display.height,
});
const fail = (e) => {
  $("error").textContent = e.message;
  $("error").hidden = false;
};
function constrain(anchor = "width") {
  rect = fromPixels(constrainSelection(pixelRect(), state.pixels, precision, anchor));
}
let viewWidth = innerWidth,
  viewHeight = innerHeight,
  offsetX = 0,
  offsetY = 0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const point = (e) => ({
  x: clamp(e.clientX - offsetX, 0, viewWidth),
  y: clamp(e.clientY - offsetY, 0, viewHeight),
});
function render(showToolbar = true) {
  region.hidden = !rect;
  $("intro").hidden = !!rect;
  surface.classList.toggle("selected", !!rect);
  toolbar.hidden = !rect || !showToolbar;
  $("selection-tip").hidden = !rect || !showToolbar;
  if (!rect) return;
  Object.assign(region.style, {
    left: rect.x + "px",
    top: rect.y + "px",
    width: rect.width + "px",
    height: rect.height + "px",
  });
  const sx = state.pixels.width / viewWidth,
    sy = state.pixels.height / viewHeight;
  $("width").value = Math.round(rect.width * sx);
  $("height").value = Math.round(rect.height * sy);
  const global = pixelToGlobal(pixelRect(), area(), state.pixels);
  $("x").value = Number(global.x.toFixed(6));
  $("y").value = Number(global.y.toFixed(6));
  toolbar.style.left =
    offsetX +
    clamp(rect.x + rect.width - toolbar.offsetWidth, 8, viewWidth - toolbar.offsetWidth - 8) +
    "px";
  const availableBottom = innerHeight - $("precision-panel").offsetHeight - 20;
  toolbar.style.top =
    clamp(
      offsetY + (rect.y >= 82 ? rect.y - 78 : rect.y + 10),
      8,
      availableBottom - toolbar.offsetHeight,
    ) + "px";
  $("selection-tip").style.left = offsetX + clamp(rect.x, 8, viewWidth - 490) + "px";
  $("selection-tip").style.top =
    clamp(
      offsetY + rect.y + rect.height + 12,
      8,
      availableBottom - $("selection-tip").offsetHeight,
    ) + "px";
}
picker.addEventListener("pointerdown", (e) => {
  if (busy || e.button !== 0 || !state) return;
  // The graphic owns keyboard focus even when the drag begins on its overlay handles.
  e.preventDefault();
  const p = point(e),
    handle = e.target.dataset.handle;
  drag = {
    start: p,
    original: rect ? { ...rect } : null,
    mode: handle || (e.target === region ? "move" : "new"),
  };
  if (drag.mode === "new") rect = { x: p.x, y: p.y, width: 0, height: 0 };
  surface.setPointerCapture(e.pointerId);
  surface.focus();
  render(false);
});
picker.addEventListener("pointermove", (e) => {
  if (!state || busy) return;
  magnify(point(e));
  if (!drag) return;
  const p = point(e),
    o = drag.original,
    dx = p.x - drag.start.x,
    dy = p.y - drag.start.y;
  if (drag.mode === "new")
    rect = {
      x: Math.min(p.x, drag.start.x),
      y: Math.min(p.y, drag.start.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
  else if (drag.mode === "move")
    rect = {
      ...o,
      x: clamp(o.x + dx, 0, viewWidth - o.width),
      y: clamp(o.y + dy, 0, viewHeight - o.height),
    };
  else {
    let l = o.x,
      t = o.y,
      r = o.x + o.width,
      b = o.y + o.height;
    if (drag.mode.includes("w")) l = p.x;
    if (drag.mode.includes("e")) r = p.x;
    if (drag.mode.includes("n")) t = p.y;
    if (drag.mode.includes("s")) b = p.y;
    rect = {
      x: Math.min(l, r),
      y: Math.min(t, b),
      width: Math.abs(r - l),
      height: Math.abs(b - t),
    };
  }
  try {
    if (drag.mode !== "move") constrain();
    else rect = fromPixels(constrainSelection(pixelRect(), state.pixels, { kind: "free" }));
    $("error").hidden = true;
  } catch (e) {
    fail(e);
  }
  render(false);
});
picker.addEventListener("pointerup", () => {
  drag = null;
  if (rect && (pixelRect().width < 2 || pixelRect().height < 2)) rect = null;
  render();
});
picker.addEventListener("pointercancel", () => {
  if (drag) rect = drag.original;
  drag = null;
  render();
});
for (const dimension of ["width", "height"])
  $(dimension).addEventListener("change", () => {
    if (!rect) return;
    const horizontal = dimension === "width",
      limit = horizontal ? viewWidth : viewHeight,
      origin = horizontal ? rect.x : rect.y,
      scale = state.pixels[dimension] / limit;
    const value = Number($(dimension).value);
    if (Number.isFinite(value)) rect[dimension] = clamp(value, 2, (limit - origin) * scale) / scale;
    try {
      constrain(dimension);
    } catch (e) {
      fail(e);
    }
    render();
  });
async function select(mode) {
  if (busy || !rect) return;
  try {
    constrain();
  } catch (e) {
    fail(e);
    return;
  }
  busy = true;
  document.querySelectorAll("button,input,select").forEach((b) => {
    b.disabled = !["cancel", "precision-cancel"].includes(b.id);
  });
  try {
    const chosen = state.photo
      ? {
          x: (rect.x * state.display.width) / viewWidth,
          y: (rect.y * state.display.height) / viewHeight,
          width: (rect.width * state.display.width) / viewWidth,
          height: (rect.height * state.display.height) / viewHeight,
        }
      : rect;
    await window.edi.select({ rect: chosen, mode });
  } catch (e) {
    $("error").textContent = e.message;
    $("error").hidden = false;
    busy = false;
    document.querySelectorAll("button,input,select").forEach((b) => {
      b.disabled = false;
    });
    $("repeat-region").disabled = !state.last;
  }
}
const recordButton = document.createElement("button");
recordButton.id = "record-start";
recordButton.textContent = "● Gravar";
recordButton.hidden = true;
recordButton.onclick = () => select("video");
toolbar.prepend(recordButton);
toolbar.querySelectorAll("[data-mode]").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.mode !== "video") return select(b.dataset.mode);
    videoMode = !videoMode;
    document.body.classList.toggle("video-mode", videoMode);
    recordButton.hidden = !videoMode;
    b.setAttribute("aria-pressed", String(videoMode));
    $("selection-tip").textContent = videoMode
      ? "Ajuste a região · Gravar ou Enter para iniciar · Esc para cancelar"
      : "Arraste as bordas para ajustar · Enter para capturar · Esc para cancelar";
    render();
  };
});
$("reset").onclick = () => {
  rect = null;
  render();
};
$("cancel").onclick = () => window.edi.cancel();
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    window.edi.cancel();
    return;
  }
  if (busy || ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "Enter") {
    e.preventDefault();
    select(videoMode ? "video" : "image");
  }
  if (rect && e.key.startsWith("Arrow")) {
    e.preventDefault();
    rect = fromPixels(nudgeSelection(pixelRect(), e.key, e.shiftKey, state.pixels));
    render();
    magnify({ x: rect.x, y: rect.y });
  }
});
function magnify(p) {
  const image = $("desktop");
  if (!image.complete || !image.naturalWidth) return;
  const x = clamp(Math.floor((p.x * state.pixels.width) / viewWidth), 0, state.pixels.width - 1),
    y = clamp(Math.floor((p.y * state.pixels.height) / viewHeight), 0, state.pixels.height - 1);
  const sample = magnifierSample(x, y, state.pixels),
    canvas = $("magnifier"),
    ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 150, 150);
  ctx.drawImage(image, sample.x, sample.y, sample.width, sample.height, 0, 0, 150, 150);
  const sx = 150 / sample.width,
    sy = 150 / sample.height;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.strokeRect((x - sample.x) * sx + 0.5, (y - sample.y) * sy + 0.5, sx - 1, sy - 1);
  $("magnifier-label").textContent =
    `Pixel ${x}, ${y} · bitmap ${state.pixels.width} × ${state.pixels.height}`;
  $("loupe").hidden = false;
  $("loupe").style.left = (p.x + offsetX > innerWidth - 220 ? 12 : innerWidth - 200) + "px";
}
picker.addEventListener("pointerleave", () => {
  if (!drag) $("loupe").hidden = true;
});
for (const axis of ["x", "y"])
  $(axis).onchange = () => {
    if (!rect || busy) return;
    try {
      const value = Number($(axis).value);
      if (!Number.isFinite(value) || $(axis).value === "")
        throw new Error("Informe uma coordenada válida.");
      const global = pixelToGlobal(pixelRect(), area(), state.pixels);
      global[axis] = value;
      rect = fromPixels(
        constrainSelection(globalToPixel(global, area(), state.pixels), state.pixels, precision),
      );
      $("error").hidden = true;
    } catch (e) {
      fail(e);
    }
    render();
  };
function applyPrecision() {
  if (!state || busy) return;
  try {
    const value = $("precision").value;
    const next =
      value === "free"
        ? { kind: "free" }
        : value === "fixed"
          ? {
              kind: "fixed",
              width: Number($("fixed-width").value),
              height: Number($("fixed-height").value),
            }
          : {
              kind: "ratio",
              width: Number(value.split(":")[0]),
              height: Number(value.split(":")[1]),
            };
    if (
      next.kind === "fixed" &&
      (!Number.isInteger(next.width) ||
        !Number.isInteger(next.height) ||
        next.width < 2 ||
        next.height < 2)
    )
      throw new Error("Tamanho fixo exige números inteiros de pelo menos 2 pixels.");
    rect = fromPixels(
      constrainSelection(
        rect
          ? pixelRect()
          : {
              x: 0,
              y: 0,
              width: Math.min(640, state.pixels.width),
              height: Math.min(360, state.pixels.height),
            },
        state.pixels,
        next,
      ),
    );
    precision = next;
    $("error").hidden = true;
    render();
  } catch (e) {
    fail(e);
  }
  $("fixed-size").hidden = $("precision").value !== "fixed";
}
$("precision").onchange = applyPrecision;
$("fixed-apply").onclick = applyPrecision;
document.querySelectorAll("[data-size]").forEach((el) => {
  el.onclick = () => {
    const [w, h] = el.dataset.size.split("x");
    $("precision").value = "fixed";
    $("fixed-width").value = w;
    $("fixed-height").value = h;
    applyPrecision();
  };
});
$("create-region").onclick = () => {
  if (!state || busy) return;
  try {
    rect = fromPixels(
      constrainSelection(
        {
          x: 0,
          y: 0,
          width: Math.min(640, state.pixels.width),
          height: Math.min(360, state.pixels.height),
        },
        state.pixels,
        precision,
      ),
    );
    render();
    surface.focus();
  } catch (e) {
    fail(e);
  }
};
$("repeat-region").onclick = () => {
  try {
    const next = globalToPixel(state.last.rect, area(), state.pixels);
    if (
      next.x < 0 ||
      next.y < 0 ||
      next.x + next.width > state.pixels.width ||
      next.y + next.height > state.pixels.height
    )
      throw new Error("Última região fora desta imagem.");
    rect = fromPixels(next);
    precision = { kind: "free" };
    $("precision").value = "free";
    $("fixed-size").hidden = true;
    render();
    surface.focus();
  } catch (e) {
    fail(e);
  }
};
$("precision-cancel").onclick = () => window.edi.cancel();
try {
  state = await window.edi.selection();
  if (!state) throw new Error("Sessão encerrada.");
  $("desktop").src = state.image;
  precision = state.precision ?? { kind: "free" };
  $("repeat-region").disabled = !state.last;
  $("precision").value =
    precision.kind === "ratio" ? `${precision.width}:${precision.height}` : precision.kind;
  if (precision.kind === "fixed") {
    $("fixed-width").value = precision.width;
    $("fixed-height").value = precision.height;
    $("fixed-size").hidden = false;
  }
  if (state.photo) {
    const fit = Math.min(innerWidth / state.display.width, innerHeight / state.display.height);
    viewWidth = state.display.width * fit;
    viewHeight = state.display.height * fit;
    offsetX = (innerWidth - viewWidth) / 2;
    offsetY = (innerHeight - viewHeight) / 2;
    for (const el of [picker, $("desktop")])
      Object.assign(el.style, {
        inset: "auto",
        left: offsetX + "px",
        top: offsetY + "px",
        width: viewWidth + "px",
        height: viewHeight + "px",
      });
    document.body.style.background = "#111820";
    for (const mode of ["video", "scroll"])
      toolbar.querySelector(`[data-mode="${mode}"]`).hidden = true;
    $("intro").querySelector("strong").textContent =
      state.timing === "frozen"
        ? "Selecione na imagem congelada"
        : "Selecione a região da próxima captura";
    $("selection-tip").textContent =
      state.timing === "frozen"
        ? "Imagem congelada ao abrir · Enter salva este instante · Esc cancela"
        : "Imagem de prévia · Enter inicia nova captura e contagem · Esc cancela";
  }
  surface.focus();
} catch (e) {
  $("error").textContent = e.message;
  $("error").hidden = false;
}
