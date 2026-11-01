import { constrainSelection, nudgeSelection } from "../domain/selection-precision.ts";
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
  toolbar.style.left =
    offsetX +
    clamp(rect.x + rect.width - toolbar.offsetWidth, 8, viewWidth - toolbar.offsetWidth - 8) +
    "px";
  toolbar.style.top =
    clamp(
      offsetY + (rect.y >= 82 ? rect.y - 78 : rect.y + 10),
      8,
      innerHeight - 8 - toolbar.offsetHeight,
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
    b.disabled = b.id !== "cancel";
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
  if (state && e.key.startsWith("Arrow")) {
    e.preventDefault();
    // Without a mouse, the first arrow creates a region in the corner; the next ones move it.
    try {
      rect = fromPixels(
        rect
          ? nudgeSelection(pixelRect(), e.key, e.shiftKey, state.pixels)
          : constrainSelection(
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
    } catch (error) {
      fail(error);
      return;
    }
    render();
  }
});
try {
  state = await window.edi.selection();
  if (!state) throw new Error("Sessão encerrada.");
  $("desktop").src = state.image;
  precision = state.precision ?? { kind: "free" };
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
  }
  surface.focus();
} catch (e) {
  $("error").textContent = e.message;
  $("error").hidden = false;
}
