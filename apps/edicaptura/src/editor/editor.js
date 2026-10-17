import { hydrateIcons, icon } from "../shared/icons.js";
import { CanvasEditor } from "./canvas.js";

hydrateIcons();
const $ = (id) => document.getElementById(id),
  api = window.edi;
let current = null,
  entries = [],
  zoom = 1,
  fit = true,
  view = "editor",
  saveTimer,
  saveChain = Promise.resolve(),
  toastTimer;
const toolList = [
  ["select", "Selecionar", "pointer"],
  ["arrow", "Seta", "arrow"],
  ["text", "Texto", "text"],
  ["square", "Forma", "square"],
  ["highlighter", "Destaque", "highlighter"],
  ["blur", "Pixelizar", "blur"],
  ["steps", "Passos", "steps"],
  ["crop", "Recortar", "crop"],
  ["pen", "Caneta", "pen"],
  ["eraser", "Borracha", "trash"],
];
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), error ? 9000 : 4000);
}
const safe =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      toast(error.message, true);
    }
  };
let lastMonitor = "cursor";
function renderMonitors(state) {
  const select = $("capture-monitor");
  select.replaceChildren(new Option("Monitor onde está o cursor", "cursor"));
  for (const display of state.displays)
    select.add(new Option(`${display.name} · ${display.width} × ${display.height}`, display.id));
  if (state.selected !== "cursor" && !state.displays.some((d) => d.id === state.selected))
    select.add(new Option("Monitor desconectado — escolha outro", state.selected));
  select.value = state.selected;
  lastMonitor = state.selected;
  select.title = select.selectedOptions[0]?.textContent || "";
}
$("capture-monitor").onchange = async () => {
  try {
    renderMonitors(await api.setMonitor($("capture-monitor").value));
  } catch (error) {
    $("capture-monitor").value = lastMonitor;
    toast(error.message, true);
  }
};
const engine = new CanvasEditor($("canvas"), {
  change: () => {
    scheduleSave();
    updateState();
    requestAnimationFrame(resize);
  },
  text: () =>
    new Promise((resolve) => {
      $("text-value").value = "";
      $("text-dialog").showModal();
      $("text-value").focus();
      $("text-dialog").addEventListener(
        "close",
        () => resolve($("text-dialog").returnValue === "ok" ? $("text-value").value.trim() : ""),
        { once: true },
      );
    }),
  selection: (a) => {
    $("delete-annotation").disabled = !a;
  },
});
for (const [id, label, i] of toolList) {
  const b = document.createElement("button");
  b.dataset.tool = id;
  b.innerHTML = icon(i) + `<span>${label}</span>`;
  b.title = label;
  b.onclick = () => setTool(id);
  $("tools").append(b);
}
const spacer = document.createElement("div");
spacer.className = "spacer";
$("tools").append(spacer);
for (const [id, i, label] of [
  ["undo", "undo", "Desfazer (Ctrl+Z)"],
  ["redo", "redo", "Refazer (Ctrl+Shift+Z)"],
]) {
  const b = document.createElement("button");
  b.id = id;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.className = "history-button";
  b.innerHTML = icon(i);
  b.onclick = () => engine[id]();
  $("tools").append(b);
}
function setTool(id) {
  engine.setTool(id);
  const item = toolList.find((t) => t[0] === id);
  $("property-title").textContent = item[1];
  $("property-icon").innerHTML = icon(item[2]);
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === id);
  });
  const hints = {
    select: "Clique em uma anotação para selecionar. Arraste para mover; Delete para excluir.",
    text: "Clique na imagem e escreva sua anotação.",
    steps: "Clique para adicionar passos numerados.",
    crop: "Arraste para recortar a imagem. Você pode restaurar o original.",
    blur: "Arraste para pixelizar a região. O efeito é aplicado à imagem exportada.",
    eraser: "Clique em uma anotação para removê-la.",
  };
  $("property-note").textContent =
    hints[id] || "Arraste na imagem para desenhar. Segure Shift para alinhar a seta.";
  $("tool-hint").textContent = $("property-note").textContent;
}
setTool("arrow");
for (const color of ["#0062ff", "#f05c4f", "#f5ba46", "#35a47d", "#283142", "#ffffff"]) {
  const b = document.createElement("button");
  b.style.background = color;
  b.title = color;
  b.setAttribute("aria-label", "Usar cor " + color);
  b.onclick = () => {
    $("color").value = color;
    engine.updateStyle({ color });
  };
  $("swatches").append(b);
}
for (const color of ["#0062ff", "#f05c4f", "#283142"]) {
  const b = document.createElement("button");
  b.style.color = color;
  b.innerHTML = icon("arrow");
  b.title = "Seta " + color;
  b.onclick = () => {
    setTool("arrow");
    $("color").value = color;
    engine.updateStyle({ color });
  };
  $("presets").append(b);
}
$("color").oninput = (e) => engine.updateStyle({ color: e.target.value });
$("stroke").oninput = (e) => {
  $("stroke-label").textContent = e.target.value + " px";
  engine.updateStyle({ stroke: Number(e.target.value) });
};
$("opacity").oninput = (e) => {
  $("opacity-label").textContent = e.target.value + "%";
  engine.updateStyle({ opacity: Number(e.target.value) / 100 });
};
$("font-size").onchange = (e) => engine.updateStyle({ fontSize: Number(e.target.value) });
$("delete-annotation").onclick = () => engine.remove();
$("reset-crop").onclick = () => engine.resetCrop();
function updateState() {
  const image = current?.kind === "image";
  for (const id of ["copy", "save"]) $(id).disabled = !image;
  $("export").disabled = !current;
  $("document-name").disabled = !current;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.disabled = !image;
  });
  $("undo").disabled = !image || !engine.past.length;
  $("redo").disabled = !image || !engine.future.length;
  $("reset-crop").hidden = !engine.crop;
  const b = engine.bounds();
  $("dimensions").textContent = image
    ? `${b.width} × ${b.height} px`
    : current
      ? "WebM · vídeo da região"
      : "";
}
function scheduleSave() {
  if (current?.kind !== "image") return;
  clearTimeout(saveTimer);
  $("save-status").textContent = "Salvando alterações…";
  saveTimer = setTimeout(() => persist().catch((e) => toast(e.message, true)), 450);
}
function persist() {
  clearTimeout(saveTimer);
  if (current?.kind !== "image") return saveChain;
  const id = current.id,
    data = {
      id,
      name: $("document-name").value.trim() || "Captura",
      annotations: structuredClone(engine.annotations),
      crop: engine.crop,
      preview: engine.export(),
    };
  const op = saveChain.then(() => api.save(data));
  saveChain = op.catch(() => {});
  return op.then(() => {
    if (current?.id === id) {
      current.name = data.name;
      current.annotations = data.annotations;
      current.crop = data.crop;
      $("save-status").textContent = "Todas as alterações salvas";
    }
    return refreshLibrary();
  });
}
async function open(doc) {
  if (!doc) return;
  await persist();
  current = doc;
  $("document-name").value = doc.name;
  $("save-status").textContent = "Salvo neste computador";
  $("video-preview").pause();
  $("video-preview").removeAttribute("src");
  if (doc.kind === "image") await engine.load(doc);
  else $("video-preview").src = doc.dataUrl;
  showView("editor");
  fit = true;
  updateState();
  requestAnimationFrame(resize);
  await refreshLibrary();
}
function showView(next) {
  view = next;
  $("library-view").hidden = next !== "library";
  $("canvas-wrap").hidden = next !== "editor" || current?.kind !== "image";
  $("video-preview").hidden = next !== "editor" || current?.kind !== "video";
  $("empty").hidden = next !== "editor" || !!current;
  $("view-label").textContent = next === "library" ? "BIBLIOTECA" : "EDITOR";
  $("editor-tab").classList.toggle("active", next === "editor");
  $("library-tab").classList.toggle("active", next === "library");
  if (next === "library") renderLibrary();
  resize();
}
function resize() {
  if (!engine.image || view !== "editor" || current?.kind !== "image") return;
  const b = engine.bounds(),
    vp = $("canvas-viewport");
  if (fit) zoom = Math.min((vp.clientWidth - 30) / b.width, (vp.clientHeight - 30) / b.height, 1);
  zoom = Math.max(0.03, Math.min(zoom, 4));
  $("canvas").style.width = Math.round(b.width * zoom) + "px";
  $("canvas").style.height = Math.round(b.height * zoom) + "px";
  $("zoom-label").textContent = Math.round(zoom * 100) + "%";
}
new ResizeObserver(resize).observe($("canvas-viewport"));
$("zoom-in").onclick = () => {
  fit = false;
  zoom *= 1.25;
  resize();
};
$("zoom-out").onclick = () => {
  fit = false;
  zoom /= 1.25;
  resize();
};
$("zoom-fit").onclick = () => {
  fit = true;
  resize();
};
async function refreshLibrary() {
  entries = await api.list();
  $("recent-count").textContent = entries.length + " arquivos";
  $("recent-list").replaceChildren();
  for (const entry of entries.slice(0, 8)) $("recent-list").append(card(entry, false));
  if (!entries.length) {
    const p = document.createElement("span");
    p.className = "muted";
    p.textContent = "Suas capturas aparecerão aqui.";
    $("recent-list").append(p);
  }
  if (view === "library") renderLibrary();
}
function card(entry, large) {
  const button = document.createElement("button");
  button.className = large ? "library-card" : "recent-card";
  button.classList.toggle("selected", entry.id === current?.id);
  const thumb = document.createElement("div");
  thumb.className = "recent-thumb";
  thumb.innerHTML = icon(entry.kind === "video" ? "video" : "images");
  const info = document.createElement("span");
  info.className = "recent-info";
  const name = document.createElement("strong");
  name.textContent = entry.name;
  const date = document.createElement("small");
  date.textContent = new Date(entry.created).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  info.append(name, date);
  button.append(thumb, info);
  button.onclick = safe(async () => open(await api.read(entry.id)));
  if (entry.preview || (entry.id === current?.id && current.kind === "image")) {
    const img = new Image();
    img.src =
      entry.id === current?.id && current.kind === "image" ? engine.export() : entry.preview;
    thumb.replaceChildren(img);
  }
  return button;
}
function renderLibrary() {
  const query = $("library-search").value.toLocaleLowerCase();
  $("library-grid").replaceChildren();
  const found = entries.filter((e) => e.name.toLocaleLowerCase().includes(query));
  for (const entry of found) $("library-grid").append(card(entry, true));
  if (!found.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = query
      ? "Nenhuma captura encontrada."
      : "Sua biblioteca está vazia. Faça sua primeira captura.";
    $("library-grid").append(p);
  }
}
$("library-search").oninput = renderLibrary;
const capture = safe(async () => {
  await persist();
  await api.capture();
});
window.ediSuite?.onRecovery(async () => {
  await persist();
});
for (const id of ["capture", "empty-capture"]) $(id).onclick = capture;
const importImage = safe(async () => open(await api.importImage()));
for (const id of ["empty-import", "import-top"]) $(id).onclick = importImage;
for (const id of ["library-tab", "all-captures"]) $(id).onclick = () => showView("library");
$("editor-tab").onclick = () => showView("editor");
for (const id of ["help", "open-help"]) $(id).onclick = () => $("help-dialog").showModal();
$("save").onclick = safe(async () => {
  await persist();
  toast("Projeto salvo.");
});
$("document-name").oninput = scheduleSave;
$("copy").onclick = safe(async () => {
  await api.copy(engine.export());
  toast("Imagem copiada para a área de transferência.");
});
$("export").onclick = safe(async () => {
  if (!current) return;
  if (current.kind === "video") {
    const file = await api.export({ id: current.id, format: "webm", name: current.name });
    if (file) toast("Vídeo exportado.");
  } else $("export-dialog").showModal();
});
$("export-dialog").addEventListener(
  "close",
  safe(async () => {
    if ($("export-dialog").returnValue !== "ok") return;
    await persist();
    const file = await api.export({
      dataUrl: engine.export(),
      format: $("export-format").value,
      name: current.name,
    });
    if (file) toast("Imagem exportada.");
  }),
);
api.onDocument(safe(open));
api.onNotice(({ message, error }) => toast(message, error));
api.onMonitors(renderMonitors);
api.onBeforeClose(
  safe(async () => {
    await persist();
    await api.close();
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea,select") || document.querySelector("dialog[open]")) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "o") {
    e.preventDefault();
    importImage();
  }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    persist().catch((err) => toast(err.message, true));
  }
  if (current?.kind !== "image") return;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? engine.redo() : engine.undo();
  }
  if (e.key === "Delete") engine.remove();
});
await safe(async () => {
  const status = await api.status();
  $("shortcut").textContent = status.captureShortcut;
  $("status-text").textContent = `EdiCaptura ${status.version} · Salvo neste computador`;
  renderMonitors(await api.monitors());
  await refreshLibrary();
  updateState();
})();
