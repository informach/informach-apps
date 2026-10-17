import { hydrateIcons } from "../shared/icons.js";

hydrateIcons();
document.documentElement.style.setProperty(
  "--capture-line",
  1 / (window.devicePixelRatio || 1) + "px",
);
const $ = (id) => document.getElementById(id);
const surface = $("surface"),
  region = $("region"),
  toolbar = $("capture-toolbar");
let state,
  rect = null,
  drag = null,
  busy = false,
  videoMode = false;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const point = (e) => ({ x: clamp(e.clientX, 0, innerWidth), y: clamp(e.clientY, 0, innerHeight) });
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
  const sx = state.pixels.width / innerWidth,
    sy = state.pixels.height / innerHeight;
  $("width").value = Math.round(rect.width * sx);
  $("height").value = Math.round(rect.height * sy);
  toolbar.style.left =
    clamp(rect.x + rect.width - toolbar.offsetWidth, 8, innerWidth - toolbar.offsetWidth - 8) +
    "px";
  toolbar.style.top = (rect.y >= 82 ? rect.y - 78 : clamp(rect.y + 10, 8, innerHeight - 80)) + "px";
  $("selection-tip").style.left = clamp(rect.x, 8, innerWidth - 490) + "px";
  $("selection-tip").style.top = clamp(rect.y + rect.height + 12, 8, innerHeight - 36) + "px";
}
surface.addEventListener("pointerdown", (e) => {
  if (busy || e.button !== 0 || !state) return;
  const p = point(e),
    handle = e.target.dataset.handle;
  drag = {
    start: p,
    original: rect ? { ...rect } : null,
    mode: handle || (e.target === region ? "move" : "new"),
  };
  if (drag.mode === "new") rect = { x: p.x, y: p.y, width: 0, height: 0 };
  surface.setPointerCapture(e.pointerId);
  render(false);
});
surface.addEventListener("pointermove", (e) => {
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
      x: clamp(o.x + dx, 0, innerWidth - o.width),
      y: clamp(o.y + dy, 0, innerHeight - o.height),
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
  render(false);
});
surface.addEventListener("pointerup", () => {
  drag = null;
  if (rect && (rect.width < 2 || rect.height < 2)) rect = null;
  render();
});
surface.addEventListener("pointercancel", () => {
  drag = null;
  render();
});
for (const dimension of ["width", "height"])
  $(dimension).addEventListener("change", () => {
    if (!rect) return;
    const horizontal = dimension === "width",
      limit = horizontal ? innerWidth : innerHeight,
      origin = horizontal ? rect.x : rect.y,
      scale = state.pixels[dimension] / limit;
    const value = Number($(dimension).value);
    if (Number.isFinite(value)) rect[dimension] = clamp(value / scale, 2, limit - origin);
    render();
  });
async function select(mode) {
  if (busy || !rect) return;
  busy = true;
  toolbar.querySelectorAll("button").forEach((b) => {
    b.disabled = true;
  });
  try {
    await window.edi.select({ rect, mode });
  } catch (e) {
    $("error").textContent = e.message;
    $("error").hidden = false;
    busy = false;
    toolbar.querySelectorAll("button").forEach((b) => {
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
  if (e.key === "Escape") window.edi.cancel();
  if (e.key === "Enter" && e.target.tagName !== "INPUT") select(videoMode ? "video" : "image");
});
try {
  state = await window.edi.selection();
  if (!state) throw new Error("Sessão encerrada.");
  $("desktop").src = state.image;
} catch (e) {
  $("error").textContent = e.message;
  $("error").hidden = false;
}
