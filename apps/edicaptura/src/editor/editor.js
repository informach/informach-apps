import { hydrateIcons, icon } from "../shared/icons.js";
import { createAssistant, mountCaptureAssistant } from "./assistant.js";
import { CanvasEditor } from "./canvas.js";
import { mountGuides } from "./guides.js";
import { mountLibrary } from "./library.js";
import { installPhotoPresets, photoOptions } from "./photo-presets.js";
import { mountQuickVideo } from "./quick-video.js";
import { mountRecordingRecovery } from "./recording-recovery.js";
import { mountTextPanel } from "./text-panel.js";

hydrateIcons();
const $ = (id) => document.getElementById(id),
  api = window.edi;
let quickPanel, textPanel, guidePanel, assistantPanel;
let current = null,
  entries = [],
  zoom = 1,
  fit = true,
  view = "editor",
  saveTimer,
  saveChain = Promise.resolve(),
  openChain = Promise.resolve(),
  revision = 0,
  savedRevision = 0,
  toastTimer;
const toolList = [
  ["select", "Selecionar", "pointer"],
  ["arrow", "Seta", "arrow"],
  ["text", "Texto", "text"],
  ["square", "Forma", "square"],
  ["ellipse", "Elipse", "square"],
  ["line", "Linha", "arrow"],
  ["callout", "Balão", "text"],
  ["highlighter", "Destaque", "highlighter"],
  ["blur", "Pixelizar", "blur"],
  ["redact", "Ocultar", "blur"],
  ["spotlight", "Foco", "highlighter"],
  ["magnify", "Lupa", "scan"],
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
let lastMonitor = "cursor",
  libraryUI,
  documentRequest = 0,
  workspaceGeneration = 0,
  workspaceTransition = false,
  visualRevision = 0,
  savedVisualRevision = 0,
  recentRequest = 0;
const workspaceProgress = "Troca de biblioteca em andamento — edição bloqueada…";
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
    visualRevision++;
    scheduleSave();
    updateState();
    renderObjects();
    requestAnimationFrame(resize);
  },
  text: (previous = "") =>
    new Promise((resolve) => {
      $("text-value").value = previous;
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
    const style = a || engine.style;
    $("color").value = style.color;
    $("stroke").value = style.stroke;
    $("stroke-label").textContent = style.stroke + " px";
    $("opacity").value = Math.round(style.opacity * 100);
    $("opacity-label").textContent = Math.round(style.opacity * 100) + "%";
    $("font-size").value = style.fontSize || 24;
    if ($("object-rotation")) $("object-rotation").value = style.rotation || 0;
    if ($("object-width") && a) {
      const b = engine.box(a);
      $("object-width").value = Math.round(b.width);
      $("object-height").value = Math.round(b.height);
      $("fill-enabled").checked = !!a.fill;
      $("fill-color").value = a.fill || "#ffffff";
      $("object-shadow").checked = !!a.shadow;
    }
    syncProperties(a?.kind || engine.tool);
    renderObjects();
  },
});
$("canvas").addEventListener("editor-error", (event) => toast(event.detail.message, true));
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
    b.setAttribute("aria-pressed", String(b.dataset.tool === id));
  });
  const hints = {
    select: "Clique em uma anotação para selecionar. Arraste para mover; Delete para excluir.",
    text: "Clique na imagem e escreva sua anotação.",
    steps: "Clique para adicionar passos numerados.",
    crop: "Arraste para recortar a imagem. Você pode restaurar o original.",
    blur: "Arraste para pixelizar. O original permanece recuperável no projeto local; compartilhe a imagem exportada. Para ocultação opaca, use Ocultar.",
    redact:
      "Arraste para cobrir com máscara opaca. O original permanece no projeto local; compartilhe a imagem exportada.",
    callout: "Arraste para criar um balão. Selecione e dê dois cliques para editar o texto.",
    eraser: "Clique em uma anotação para removê-la.",
  };
  $("property-note").textContent =
    hints[id] || "Arraste na imagem para desenhar. Segure Shift para alinhar a seta.";
  $("tool-hint").textContent = $("property-note").textContent;
  syncProperties(id);
}
function syncProperties(kind) {
  const step = engine.annotations[engine.selected];
  const stepNumber = document.getElementById("step-number");
  if (stepNumber) {
    stepNumber.value = step?.kind === "steps" ? String(step.number) : "";
    stepNumber.disabled = step?.kind !== "steps";
  }
  const text = ["text", "callout"].includes(kind),
    color = ["blur", "redact", "crop", "image"].includes(kind);
  $("font-size").hidden = !text;
  document.querySelector('label[for="font-size"]').hidden = !text;
  $("color").closest("label").hidden = color;
  $("swatches").hidden = color;
  $("opacity").hidden = kind === "redact";
  document.querySelector('label[for="opacity"]').hidden = kind === "redact";
  $("presets").hidden = kind !== "arrow";
  document.querySelector(".section-label").hidden = kind !== "arrow";
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
  document.querySelector(".properties").inert = !image;
  $("copy").disabled = !image;
  $("save").disabled = !current;
  document.querySelectorAll("[data-image-action]").forEach((button) => {
    button.disabled = !image;
  });
  $("export").disabled = !current;
  $("document-name").disabled = !current;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.disabled = !image;
  });
  $("undo").disabled = !image || !engine.past.length;
  $("redo").disabled = !image || !engine.future.length;
  $("reset-crop").hidden = !engine.crop;
  const b = engine.displaySize();
  $("dimensions").textContent = image
    ? `${b.width} × ${b.height} px`
    : current
      ? "WebM · vídeo da região"
      : "";
}
function scheduleSave() {
  if (!current || workspaceTransition) return;
  revision++;
  clearTimeout(saveTimer);
  $("save-status").textContent = "Salvando alterações…";
  saveTimer = setTimeout(() => persist().catch((e) => toast(e.message, true)), 450);
}
function persist(transition = false, refresh = true) {
  clearTimeout(saveTimer);
  if (workspaceTransition && !transition) return saveChain;
  if (!current) return saveChain;
  const generation = workspaceGeneration,
    id = current.id,
    savingRevision = revision,
    savingVisualRevision = visualRevision,
    kind = current.kind,
    assetStore = engine.assets,
    metadataOnly =
      kind === "video" || (visualRevision === savedVisualRevision && !!current.preview),
    metadata = {
      id,
      name: $("document-name").value.trim().slice(0, 120) || "Captura",
      ...(kind === "video" ? { videoRecipe: structuredClone(current.videoRecipe ?? null) } : {}),
    },
    data = metadataOnly
      ? metadata
      : {
          id,
          name: metadata.name,
          annotations: structuredClone(engine.annotations),
          crop: structuredClone(engine.crop),
          viewTransform: structuredClone(engine.viewTransform),
          ...(!current.preview || visualRevision !== savedVisualRevision
            ? { preview: editorThumbnail() }
            : {}),
        };
  const op = saveChain.then(async () => {
    if (generation !== workspaceGeneration) return false;
    if (metadataOnly) await api.update(data);
    else {
      // Resolve pending sources after earlier saves settle, so queued snapshots send them once.
      const assets = assetStore.pending(data.annotations);
      await api.save({ ...data, assets });
      assetStore.acknowledge(assets);
    }
    return true;
  });
  saveChain = op.then(
    () => undefined,
    () => undefined,
  );
  return op.then(
    (saved) => {
      if (!saved || generation !== workspaceGeneration) return;
      if (current?.id === id) {
        current.name = data.name;
        if (data.preview) current.preview = data.preview;
        savedVisualRevision = savingVisualRevision;
        savedRevision = Math.max(savedRevision, savingRevision);
        $("save-status").textContent = workspaceTransition
          ? workspaceProgress
          : savedRevision === revision
            ? "Todas as alterações salvas"
            : "Alterações pendentes…";
      }
      if (refresh) return refreshLibrary();
    },
    (error) => {
      if (generation === workspaceGeneration && current?.id === id)
        $("save-status").textContent = "Não salvo — tente Salvar novamente";
      throw error;
    },
  );
}
function open(
  doc,
  generation = workspaceGeneration,
  request = ++documentRequest,
  authority = () => true,
) {
  const operation = openChain.then(() => activateDocument(doc, generation, request, authority));
  openChain = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
async function activateDocument(doc, generation, request, authority) {
  const valid = () =>
    !workspaceTransition &&
    generation === workspaceGeneration &&
    request === documentRequest &&
    authority();
  if (!doc || !valid()) return;
  if (doc.id === current?.id) {
    showView("editor");
    return;
  }
  const prepared = doc.kind === "image" ? await engine.prepare(doc) : null;
  if (!valid()) return;
  do {
    await persist();
    if (!valid()) return;
  } while (current && savedRevision !== revision);
  clearTimeout(saveTimer);
  if (prepared) engine.activate(prepared);
  else engine.clear();
  current = doc;
  quickPanel?.activate(doc);
  textPanel?.activate(doc);
  assistantPanel?.activate(doc);
  revision = 0;
  savedRevision = 0;
  visualRevision = savedVisualRevision = 0;
  $("document-name").value = doc.name;
  $("save-status").textContent = "Salvo neste computador";
  $("video-preview").pause();
  $("video-preview").removeAttribute("src");
  if (doc.kind === "video") $("video-preview").src = doc.dataUrl;
  showView("editor");
  fit = true;
  updateState();
  renderObjects();
  requestAnimationFrame(resize);
  await refreshLibrary();
}
function showView(next) {
  view = next;
  quickPanel?.show(next === "editor");
  document.body.classList.toggle("library-mode", next === "library");
  $("library-view").hidden = next !== "library";
  $("canvas-wrap").hidden = next !== "editor" || current?.kind !== "image";
  $("video-preview").hidden = next !== "editor" || current?.kind !== "video";
  $("empty").hidden = next !== "editor" || !!current;
  $("view-label").textContent = next === "library" ? "BIBLIOTECA" : "EDITOR";
  $("editor-tab").classList.toggle("active", next === "editor");
  $("library-tab").classList.toggle("active", next === "library");
  if (next === "library") renderLibrary().catch((error) => toast(error.message, true));
  resize();
}
function resize() {
  if (!engine.image || view !== "editor" || current?.kind !== "image") return;
  const b = engine.displaySize(),
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
function editorThumbnail() {
  const size = engine.displaySize();
  return engine.export({
    width: Math.max(1, Math.round(size.width * Math.min(240 / size.width, 150 / size.height, 1))),
  });
}
async function refreshLibrary() {
  const generation = workspaceGeneration,
    request = ++recentRequest;
  const response = await api.list({ limit: 8, offset: 0 });
  if (request !== recentRequest || generation !== workspaceGeneration) return;
  const result = Array.isArray(response)
    ? { items: response.slice(0, 8), total: response.length }
    : response;
  entries = result.items;
  $("recent-count").textContent = result.total + " arquivos";
  $("recent-list").replaceChildren();
  for (const entry of entries) $("recent-list").append(card(entry, false));
  if (!entries.length) {
    const p = document.createElement("span");
    p.className = "muted";
    p.textContent = "Suas capturas aparecerão aqui.";
    $("recent-list").append(p);
  }
  if (view === "library") await renderLibrary();
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
  button.onclick = safe(async () => {
    const generation = workspaceGeneration,
      request = ++documentRequest;
    if (workspaceTransition) return;
    if (entry.kind === "damaged") {
      toast(
        "Metadados danificados. Recuperar mantém o original e guarda uma cópia dos metadados; anotações danificadas podem não ser recuperáveis.",
        true,
      );
      if (
        !confirm(
          "Recuperar o arquivo original? Os metadados danificados serão preservados em uma cópia.",
        )
      )
        return;
      await open(await api.recover(entry.id), generation, request);
    } else await open(await api.read(entry.id), generation, request);
  });
  if (entry.preview || (entry.id === current?.id && current.kind === "image")) {
    const img = new Image();
    img.src =
      entry.id === current?.id && current.kind === "image"
        ? current.preview || entry.preview || editorThumbnail()
        : entry.preview;
    thumb.replaceChildren(img);
  }
  return button;
}
function renderLibrary() {
  return libraryUI.render();
}
async function importResult(operation) {
  if (workspaceTransition) throw new Error("Aguarde a troca de biblioteca antes de importar.");
  const generation = workspaceGeneration,
    request = documentRequest;
  await persist();
  if (generation !== workspaceGeneration || workspaceTransition) return;
  const doc = await operation();
  if (generation !== workspaceGeneration || workspaceTransition) return;
  if (!doc) {
    toast("Importação cancelada.");
    return;
  }
  await refreshLibrary();
  if (documentRequest !== request) {
    toast(
      "Importação salva na biblioteca. O documento aberto mudou; escolha a captura importada na biblioteca.",
    );
    return;
  }
  await open(doc, generation);
}
const capture = safe(async () => {
  await persist();
  await api.capture();
});
window.ediSuite?.onRecovery(async () => {
  await persist();
});
for (const id of ["capture", "empty-capture"]) $(id).onclick = capture;
const importImage = safe(() => importResult(() => api.importImage()));
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
    await persist();
    await quickPanel.export();
  } else $("export-dialog").showModal();
});
$("export-dialog").addEventListener(
  "close",
  safe(async () => {
    if ($("export-dialog").returnValue !== "ok") return;
    await persist();
    const file = await api.export({
      dataUrl: engine.export({
        width: Number($("export-width").value) || undefined,
        format: $("export-format").value === "webp" ? "image/webp" : "image/png",
        background:
          $("export-opaque").checked || $("export-format").value === "jpg"
            ? $("export-background").value
            : undefined,
        quality: Number($("export-quality").value) / 100,
      }),
      format: $("export-format").value,
      quality: Number($("export-quality").value),
      name: current.name,
    });
    if (file) toast("Imagem exportada.");
  }),
);
function renderObjects() {
  const list = $("object-list");
  if (!list) return;
  const focusedId = list.contains(document.activeElement)
    ? document.activeElement.dataset.objectId
    : null;
  list.replaceChildren();
  if (current?.kind !== "image") return;
  engine.annotations.forEach((a, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-item";
    button.dataset.objectId = a.id;
    button.textContent = `${index + 1}. ${a.kind}${a.text ? ` — ${a.text.slice(0, 35)}` : ""}`;
    button.setAttribute("aria-pressed", String(engine.selectionIndices().includes(index)));
    button.onclick = (e) => {
      const previous = engine.selectionIndices();
      setTool("select");
      engine.selectIndices(e.shiftKey ? [...previous, index] : [index]);
    };
    list.append(button);
  });
  if (focusedId) {
    const target = [...list.children].find((button) => button.dataset.objectId === focusedId);
    if (target) target.focus({ preventScroll: true });
    else {
      list.tabIndex = -1;
      list.focus({ preventScroll: true });
    }
  }
}
const extra = document.createElement("div");
extra.className = "editor-extras";
extra.innerHTML = `<details open><summary>Objeto selecionado</summary><div class="object-actions"><button type="button" data-image-action id="edit-object-text">Editar texto</button><button type="button" data-image-action id="duplicate-object">Duplicar</button><button type="button" data-image-action id="group-objects">Agrupar</button><button type="button" data-image-action id="ungroup-objects">Desagrupar</button><button type="button" data-image-action id="object-front">Trazer à frente</button><button type="button" data-image-action id="object-back">Enviar para trás</button></div><label>Girar objeto <input id="object-rotation" type="number" min="-360" max="360" value="0"></label><div class="object-actions"><label>Largura <input id="object-width" type="number" min="1" max="30000" value="100"></label><label>Altura <input id="object-height" type="number" min="1" max="30000" value="100"></label><button type="button" data-image-action id="resize-object">Aplicar tamanho</button></div><label><input id="fill-enabled" type="checkbox"> Preencher forma</label><input id="fill-color" type="color" value="#ffffff" aria-label="Cor do preenchimento"><label><input id="object-shadow" type="checkbox"> Sombra</label><label>Alinhar seleção <select id="align-objects"><option value="">Escolher</option><option value="left">À esquerda</option><option value="right">À direita</option><option value="center">Centro horizontal</option><option value="top">Ao topo</option><option value="bottom">À base</option><option value="middle">Centro vertical</option></select></label></details><details><summary>Imagem e composição</summary><div class="object-actions"><button type="button" data-image-action id="insert-image">Inserir imagem</button><button type="button" data-image-action id="paste-image">Colar imagem</button><button type="button" data-image-action id="rotate-image">Girar 90°</button><button type="button" data-image-action id="flip-image">Espelhar</button></div><label>Escala da imagem (%) <input id="image-scale" type="number" min="1" max="800" value="100"></label><label>Margem (px) <input id="image-padding" type="number" min="0" max="2000" value="0"></label><label>Fundo <input id="image-background" type="color" value="#ffffff"></label><button type="button" data-image-action id="apply-image-settings">Aplicar</button></details><details><summary>Objetos — seleção pelo teclado</summary><p>Shift + clique para selecionar vários. Setas movem a seleção; Shift acelera.</p><div id="object-list" aria-label="Objetos da captura"></div></details><details><summary>Seu espaço e estilo</summary><button type="button" id="compact-view">Alternar modo compacto</button><button type="button" id="toggle-recents">Mostrar/ocultar recentes</button><button type="button" id="save-style">Guardar estilo da ferramenta</button><button type="button" id="use-style">Usar estilo guardado</button></details>`;
document.querySelector(".properties").append(extra);
const outputFields = document.createElement("div");
outputFields.innerHTML = `<label>Largura final (px, vazio mantém tamanho)<input id="export-width" type="number" min="1" max="30000"></label><label>Qualidade <input id="export-quality" type="range" min="10" max="100" value="92"></label><label><input id="export-opaque" type="checkbox"> Fundo opaco</label><input id="export-background" type="color" value="#ffffff" aria-label="Cor de fundo da exportação"><p>A saída contém só a imagem final. Originais e objetos continuam no projeto local.</p>`;
$("export-dialog").querySelector("footer").before(outputFields);
$("export-format").add(new Option("WebP — arquivo compacto", "webp"));
for (const [id, action] of [
  ["duplicate-object", () => engine.duplicateSelection()],
  ["group-objects", () => engine.group()],
  ["ungroup-objects", () => engine.ungroup()],
  ["object-front", () => engine.reorderSelection("front")],
  ["object-back", () => engine.reorderSelection("back")],
  [
    "resize-object",
    () => engine.resizeSelection(Number($("object-width").value), Number($("object-height").value)),
  ],
  ["rotate-image", () => engine.setViewTransform({ turns: (engine.viewTransform.turns + 1) % 4 })],
  ["flip-image", () => engine.setViewTransform({ flipX: !engine.viewTransform.flipX })],
  [
    "apply-image-settings",
    () =>
      engine.setViewTransform({
        scale: Number($("image-scale").value) / 100,
        padding: Number($("image-padding").value),
        background: $("image-background").value,
      }),
  ],
])
  $(id).onclick = safe(action);
$("edit-object-text").onclick = safe(async () => {
  const a = engine.annotations[engine.selected];
  if (a && ["text", "callout"].includes(a.kind)) {
    const id = a.id,
      generation = engine.generation,
      text = await engine.askText(a.text);
    if (text && generation === engine.generation && engine.annotations[engine.selected]?.id === id)
      engine.editText(text);
  }
});
$("object-rotation").onchange = safe(() =>
  engine.updateStyle({ rotation: Number($("object-rotation").value) }),
);
$("fill-enabled").onchange = () =>
  engine.updateStyle({ fill: $("fill-enabled").checked ? $("fill-color").value : null });
$("fill-color").oninput = () => {
  $("fill-enabled").checked = true;
  engine.updateStyle({ fill: $("fill-color").value });
};
$("object-shadow").onchange = () => engine.updateStyle({ shadow: $("object-shadow").checked });
$("align-objects").onchange = () => {
  engine.alignSelection($("align-objects").value);
  $("align-objects").value = "";
};
$("insert-image").onclick = safe(async () => {
  const id = current?.id,
    generation = workspaceGeneration;
  const image = await api.importObject();
  if (current?.id !== id || workspaceTransition || generation !== workspaceGeneration)
    throw new Error(
      "Documento mudou durante a escolha da imagem. Insira novamente na captura desejada.",
    );
  if (image) await engine.addImage(image);
});
$("paste-image").onclick = safe(async () => {
  const id = current?.id,
    generation = workspaceGeneration;
  const image = await api.pasteImage();
  if (current?.id !== id || workspaceTransition || generation !== workspaceGeneration)
    throw new Error(
      "Documento mudou durante a leitura da imagem. Cole novamente na captura desejada.",
    );
  if (image) await engine.addImage(image);
});
$("compact-view").onclick = () => {
  document.body.classList.toggle("compact");
  localStorage.setItem("edicaptura-compact", String(document.body.classList.contains("compact")));
};
$("toggle-recents").onclick = () => {
  document.body.classList.toggle("hide-recents");
  localStorage.setItem(
    "edicaptura-hide-recents",
    String(document.body.classList.contains("hide-recents")),
  );
};
for (const name of ["compact", "hide-recents"])
  document.body.classList.toggle(name, localStorage.getItem(`edicaptura-${name}`) === "true");
$("save-style").onclick = () => {
  localStorage.setItem(
    `edicaptura-style-${engine.tool}`,
    JSON.stringify(engine.annotations[engine.selected] || engine.style),
  );
  toast("Estilo guardado para esta ferramenta.");
};
$("use-style").onclick = safe(async () => {
  const generation = workspaceGeneration;
  const stored = localStorage.getItem(`edicaptura-style-${engine.tool}`);
  if (!stored) return;
  const { annotationSchema } = await import("../domain/document.ts");
  if (workspaceTransition || generation !== workspaceGeneration) return;
  const style = annotationSchema.parse({
    ...JSON.parse(stored),
    kind: "square",
    x: 0,
    y: 0,
    x2: 1,
    y2: 1,
  });
  engine.updateStyle({
    color: style.color,
    stroke: style.stroke,
    opacity: style.opacity,
    fontSize: style.fontSize,
    fill: style.fill,
    shadow: style.shadow,
    arrowHeads: style.arrowHeads,
  });
});
const refinements = document.createElement("details");
refinements.innerHTML = `<summary>Acabamento e marca</summary><label>Pontas da seta<select id="arrow-heads"><option value="end">Uma ponta</option><option value="both">Duas pontas</option><option value="none">Sem ponta</option></select></label><label>Borda (px)<input id="image-border" type="number" min="0" max="100" value="0"></label><label>Cor da borda<input id="border-color" type="color" value="#283142"></label><button type="button" data-image-action id="apply-border">Aplicar borda</button><label>Carimbo<select id="stamp-value"><option value="✓">Aprovado ✓</option><option value="✕">Revisar ✕</option><option value="!">Atenção !</option><option value="★">Destaque ★</option></select></label><button type="button" data-image-action id="insert-stamp">Inserir carimbo</button><label>Faixa interna<select id="cutout-axis"><option value="y">Horizontal</option><option value="x">Vertical</option></select></label><label>Início (px)<input id="cutout-start" type="number" min="0" value="20"></label><label>Espessura (px)<input id="cutout-length" type="number" min="1" value="20"></label><button type="button" data-image-action id="cutout-copy">Criar cópia sem faixa</button><p>A cópia reúne os pixels. O projeto editável original continua na biblioteca.</p><label>Cor principal da sua marca<input id="theme-primary" type="color" value="#0062ff"></label><label>Cor de texto da sua marca<input id="theme-text" type="color" value="#ffffff"></label><output id="theme-contrast" aria-live="polite"></output><button type="button" id="save-theme">Guardar e usar tema</button>`;
extra.append(refinements);
$("arrow-heads").onchange = () => engine.updateStyle({ arrowHeads: $("arrow-heads").value });
$("apply-border").onclick = safe(() =>
  engine.setViewTransform({
    borderWidth: Number($("image-border").value),
    borderColor: $("border-color").value,
  }),
);
$("insert-stamp").onclick = safe(() =>
  engine.addAnnotation("text", {
    x: engine.bounds().x + 30,
    y: engine.bounds().y + 30,
    text: $("stamp-value").value,
    fontSize: 48,
  }),
);
$("cutout-copy").onclick = safe(async () => {
  const generation = workspaceGeneration,
    request = ++documentRequest;
  await persist();
  if (workspaceTransition || generation !== workspaceGeneration) return;
  const dataUrl = engine.cutout(
    $("cutout-axis").value,
    Number($("cutout-start").value),
    Number($("cutout-length").value),
  );
  const entry = await api.save({
    name: `${current.name} — sem faixa`,
    annotations: [],
    crop: null,
    dataUrl,
  });
  if (workspaceTransition || generation !== workspaceGeneration) return;
  await open(await api.read(entry.id), generation, request);
});
function themeContrast() {
  const luminance = (color) => {
    const channels = [1, 3, 5]
      .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance($("theme-primary").value),
    b = luminance($("theme-text").value);
  $("theme-contrast").textContent =
    `Contraste entre cores: ${((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)}:1`;
}
$("theme-primary").oninput = themeContrast;
$("theme-text").oninput = themeContrast;
themeContrast();
$("save-theme").onclick = () => {
  localStorage.setItem(
    "edicaptura-theme",
    JSON.stringify({ primary: $("theme-primary").value, text: $("theme-text").value }),
  );
  engine.updateStyle({ color: $("theme-primary").value });
  toast("Tema guardado. Escolha preenchimento e cor conforme o contraste mostrado.");
};
try {
  const saved = JSON.parse(localStorage.getItem("edicaptura-theme") || "null");
  if (saved && /^#[a-f0-9]{6}$/i.test(saved.primary) && /^#[a-f0-9]{6}$/i.test(saved.text)) {
    $("theme-primary").value = saved.primary;
    $("theme-text").value = saved.text;
    themeContrast();
  }
} catch {
  toast("Não foi possível ler o tema guardado.", true);
}
const exportPreset = document.createElement("label");
exportPreset.innerHTML = `Destino <select id="export-preset"><option value="custom">Personalizado</option><option value="message">Mensagem — JPEG até 1280 px</option><option value="document">Documento — PNG original</option><option value="compact">Arquivo leve — WebP até 1600 px</option></select><output id="export-estimate" aria-live="polite"></output>`;
$("export-dialog").querySelector("footer").before(exportPreset);
function estimateExport() {
  if (current?.kind !== "image") return;
  const format = $("export-format").value;
  const url = engine.export({
    width: Number($("export-width").value) || undefined,
    format: format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png",
    quality: Number($("export-quality").value) / 100,
    background:
      $("export-opaque").checked || format === "jpg" ? $("export-background").value : undefined,
  });
  $("export-estimate").textContent =
    `Tamanho aproximado: ${Math.round((url.slice(url.indexOf(",") + 1).length * 0.75) / 1024)} KB`;
  localStorage.setItem(
    "edicaptura-export-options",
    JSON.stringify({
      format,
      width: $("export-width").value,
      quality: $("export-quality").value,
      opaque: $("export-opaque").checked,
      background: $("export-background").value,
    }),
  );
}
$("export-preset").onchange = safe(() => {
  const preset = $("export-preset").value;
  if (preset === "message") {
    $("export-format").value = "jpg";
    $("export-width").value = Math.min(1280, engine.displaySize().width);
    $("export-quality").value = 80;
    $("export-opaque").checked = true;
  }
  if (preset === "document") {
    $("export-format").value = "png";
    $("export-width").value = "";
    $("export-quality").value = 100;
  }
  if (preset === "compact") {
    $("export-format").value = "webp";
    $("export-width").value = Math.min(1600, engine.displaySize().width);
    $("export-quality").value = 80;
  }
  estimateExport();
});
for (const id of [
  "export-width",
  "export-quality",
  "export-format",
  "export-opaque",
  "export-background",
])
  $(id).addEventListener("change", safe(estimateExport));
$("export").addEventListener("click", () => {
  if (current?.kind === "image") void safe(estimateExport)();
});
try {
  const saved = JSON.parse(localStorage.getItem("edicaptura-export-options") || "null");
  if (saved && ["png", "jpg", "webp"].includes(saved.format)) {
    $("export-format").value = saved.format;
    $("export-width").value =
      Number(saved.width) > 0 && Number(saved.width) <= 30000 ? saved.width : "";
    $("export-quality").value =
      Number(saved.quality) >= 10 && Number(saved.quality) <= 100 ? saved.quality : 92;
    $("export-opaque").checked = !!saved.opaque;
    if (/^#[a-f0-9]{6}$/i.test(saved.background)) $("export-background").value = saved.background;
  }
} catch {
  toast("Não foi possível ler as opções guardadas de exportação.", true);
}
let pan = null,
  spaceHeld = false;
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea,select") || document.querySelector("dialog[open]")) return;
  if (view !== "editor" || workspaceTransition) return;
  if (e.code === "Space" && !e.target.closest("button,summary,a")) {
    spaceHeld = true;
    e.preventDefault();
  }
  if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "0"].includes(e.key)) {
    e.preventDefault();
    if (e.key === "0") fit = true;
    else {
      fit = false;
      zoom *= e.key === "-" ? 0.8 : 1.25;
    }
    resize();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
});
$("canvas-viewport").addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    fit = false;
    zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    resize();
  },
  { passive: false },
);
$("canvas-viewport").addEventListener(
  "pointerdown",
  (e) => {
    if (spaceHeld || e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      const viewport = $("canvas-viewport");
      pan = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(e.pointerId);
    }
  },
  { capture: true },
);
$("canvas-viewport").addEventListener(
  "pointermove",
  (e) => {
    if (!pan) return;
    e.preventDefault();
    e.stopPropagation();
    $("canvas-viewport").scrollLeft = pan.left + pan.x - e.clientX;
    $("canvas-viewport").scrollTop = pan.top + pan.y - e.clientY;
  },
  { capture: true },
);
$("canvas-viewport").addEventListener(
  "pointerup",
  (e) => {
    if (pan) {
      e.stopPropagation();
      pan = null;
    }
  },
  { capture: true },
);
$("canvas-viewport").addEventListener("pointercancel", () => {
  pan = null;
});
// During "Capturar passos" a new capture becomes a guide step instead of opening.
api.onDocument(
  safe(async (doc) => {
    try {
      if (await guidePanel?.capture(doc)) return;
    } catch (error) {
      toast(`Não entrou no guia: ${error.message} A captura foi aberta.`, true);
    }
    await open(doc);
  }),
);
api.onNotice(({ message, error }) => toast(message, error));
api.onMonitors(renderMonitors);
api.onBeforeClose(
  safe(async () => {
    // Recovery permits saving/closing after expiry; browsing the library remains restricted.
    await persist(false, false);
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
  if (view !== "editor" || workspaceTransition || current?.kind !== "image") return;
  if (mod && e.key.toLowerCase() === "d") {
    e.preventDefault();
    engine.duplicateSelection();
  }
  if (mod && e.key.toLowerCase() === "a") {
    e.preventDefault();
    engine.selectIndices(engine.annotations.map((_a, i) => i));
  }
  if (mod && e.key.toLowerCase() === "v") {
    e.preventDefault();
    $("paste-image").click();
  }
  const directions = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (directions[e.key] && engine.selected >= 0) {
    e.preventDefault();
    const [x, y] = directions[e.key];
    engine.moveSelection(x * (e.shiftKey ? 10 : 1), y * (e.shiftKey ? 10 : 1));
  }
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? engine.redo() : engine.undo();
  }
  if (e.key === "Delete") engine.remove();
});
function clearDocument() {
  clearTimeout(saveTimer);
  workspaceGeneration++;
  openChain = Promise.resolve();
  recentRequest++;
  documentRequest++;
  current = null;
  revision = savedRevision = visualRevision = savedVisualRevision = 0;
  engine.clear();
  textPanel?.activate(null);
  assistantPanel?.activate(null);
  $("document-name").value = "Nenhuma captura aberta";
  $("save-status").textContent = "";
  $("video-preview").pause();
  $("video-preview").removeAttribute("src");
  updateState();
  renderObjects();
  showView("library");
}
async function transitionWorkspace(action) {
  if (workspaceTransition) throw new Error("Uma troca de biblioteca já está em andamento.");
  workspaceTransition = true;
  workspaceGeneration++;
  openChain = Promise.resolve();
  documentRequest++;
  recentRequest++;
  clearTimeout(saveTimer);
  engine.cancelInteraction();
  const surfaces = [...document.body.children].filter(
      (element) => element.id !== "library-settings",
    ),
    inertStates = surfaces.map((element) => [element, element.inert]),
    controlStates = surfaces.flatMap((element) =>
      [...element.querySelectorAll("button,input,select,textarea")].map((control) => [
        control,
        control.disabled,
      ]),
    );
  for (const [element] of inertStates) element.inert = true;
  for (const [control] of controlStates) control.disabled = true;
  $("save-status").textContent = workspaceProgress;
  try {
    // Drain in-flight saves against the old root, then save its latest snapshot.
    // Pending opens/reads carry the previous generation and cannot activate.
    await persist(true);
    const result = await api.libraryWorkflow(action);
    if (result) clearDocument();
    return result;
  } finally {
    workspaceTransition = false;
    for (const [element, inert] of inertStates) element.inert = inert;
    for (const [control, disabled] of controlStates) control.disabled = disabled;
    updateState();
    if (current && $("save-status").textContent === workspaceProgress)
      $("save-status").textContent =
        savedRevision === revision ? "Todas as alterações salvas" : "Alterações pendentes…";
  }
}
for (const type of [
  "click",
  "input",
  "change",
  "keydown",
  "pointerdown",
  "pointermove",
  "pointerup",
  "dblclick",
])
  document.addEventListener(
    type,
    (event) => {
      if (
        workspaceTransition &&
        (!(event.target instanceof Element) || !event.target.closest("#library-settings"))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
libraryUI = mountLibrary({
  api,
  card,
  toast,
  safe,
  persist,
  current: () => current,
  importResult,
  clearDocument,
  transitionWorkspace,
  refreshRecents: refreshLibrary,
});
const quickEntry = document.createElement("div");
quickEntry.className = "quick-entry";
quickEntry.innerHTML = `<button type="button" id="new-blank">Novo projeto</button><button type="button" id="new-clipboard">Novo da área de transferência</button><button type="button" id="copy-export-file">Copiar arquivo exportado</button><button type="button" id="copy-export-path">Copiar caminho exportado</button><button type="button" id="settings-top">Preferências</button>`;
$("import-top").after(quickEntry);
$("import-top").textContent = "Importar imagem/vídeo";
$("copy").lastChild.textContent = "Copiar imagem";
$("new-blank").onclick = safe(() =>
  importResult(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    canvas.getContext("2d").fillStyle = "#ffffff";
    canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
    return api.importMedia({ name: "Novo projeto.png", bytes: dataUrlBytes(canvas.toDataURL()) });
  }),
);
function dataUrlBytes(url) {
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (letter) => letter.charCodeAt(0));
}
$("new-clipboard").onclick = safe(() =>
  importResult(async () => {
    const url = await api.pasteImage();
    return api.importMedia({ name: "Área de transferência.png", bytes: dataUrlBytes(url) });
  }),
);
$("copy-export-path").onclick = safe(async () => {
  await api.copyPath();
  toast("Caminho do arquivo final copiado.");
});
$("copy-export-file").onclick = safe(async () => {
  await api.copyFile();
  toast("Arquivo final copiado. Cole em um aplicativo que aceite arquivos.");
});
$("settings-top").onclick = libraryUI.settingsOpen;
document.addEventListener("dragover", (event) => {
  if (event.dataTransfer.types.includes("Files")) event.preventDefault();
});
document.addEventListener(
  "drop",
  safe(async (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    if (event.dataTransfer.files.length !== 1)
      throw new Error("Arraste um arquivo de cada vez. Use a biblioteca para ações em lote.");
    const file = event.dataTransfer.files[0];
    if (file.size > 400_000_000) throw new Error("Arquivo maior que 400 MB.");
    await importResult(async () =>
      api.importMedia({
        name: file.name.slice(0, 120),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
    );
  }),
);
await safe(async () => {
  const status = await api.status();
  $("shortcut").textContent = status.captureShortcut;
  $("status-text").textContent = `EdiCaptura ${status.version} · Salvo neste computador`;
  renderMonitors(await api.monitors());
  await refreshLibrary();
  updateState();
})();

// Image modes share the editor's persistence barrier and the main-owned source authority.
const photoDialog = $("photo-dialog");
let photoIntent = 0;
async function preparePhoto() {
  const intent = ++photoIntent,
    generation = workspaceGeneration;
  if (workspaceTransition) throw new Error("Aguarde a troca de biblioteca.");
  await persist();
  if (intent !== photoIntent || workspaceTransition || generation !== workspaceGeneration)
    throw new Error("Solicitação de captura encerrada.");
  return () => intent === photoIntent && !workspaceTransition && generation === workspaceGeneration;
}
const photoPresets = installPhotoPresets({ api, persist: preparePhoto, dialog: photoDialog, safe });
$("photo-options").onclick = safe(async () => {
  await persist();
  await photoPresets.load();
  photoDialog.showModal();
});
$("photo-close").onclick = () => {
  photoIntent++;
  photoDialog.close();
};
$("photo-cancel").onclick = safe(() => {
  photoIntent++;
  return api.photoCancel();
});
photoDialog.addEventListener("cancel", () => {
  photoIntent++;
});
$("photo-retry").onclick = safe(() => api.photoRetry());
$("photo-discard").onclick = safe(() => api.photoDiscard());
const photoStart = safe(async (mode, source, control) => {
  await preparePhoto();
  await api.photoStart({
    ...photoOptions(),
    mode,
    ...(source ? { source } : {}),
    ...(control ? { control } : {}),
    delay: Number($("photo-delay").value),
    cursor: $("photo-cursor").checked,
    timing: mode.startsWith("region") ? $("photo-timing").value : "fresh",
    destination: $("photo-destination").value,
  });
});
photoDialog.querySelectorAll("[data-photo]").forEach((button) => {
  button.onclick = () => photoStart(button.dataset.photo);
});
$("photo-refresh").onclick = safe(async () => {
  $("photo-refresh").disabled = true;
  $("photo-status").textContent = "Preparando fontes…";
  try {
    const sources = await api.photoSources();
    $("photo-sources").replaceChildren();
    $("photo-controls").replaceChildren();
    for (const source of sources) {
      const row = document.createElement("div"),
        image = document.createElement("img"),
        captureButton = document.createElement("button"),
        controlsButton = document.createElement("button");
      const preview = document.createElement("div"),
        outline = document.createElement("span");
      preview.className = "photo-preview";
      outline.className = "photo-outline";
      outline.hidden = true;
      preview.append(image, outline);
      image.src = source.preview;
      image.alt = "Prévia da janela";
      captureButton.type = controlsButton.type = "button";
      captureButton.textContent = source.name;
      controlsButton.textContent = "Controles HWND";
      captureButton.onclick = () => photoStart("window", source.token);
      controlsButton.onclick = safe(async () => {
        const controls = await api.photoControls(source.token);
        $("photo-controls").replaceChildren();
        $("photo-status").textContent = controls.length
          ? "Controles nativos visíveis. A captura recorta o bitmap da janela escolhida."
          : "Esta janela não expõe controles HWND selecionáveis.";
        for (const control of controls) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = `${control.name} · ${control.bounds.width} × ${control.bounds.height} px`;
          if (control.previewRect) {
            const highlight = () => {
              const r = control.previewRect;
              Object.assign(outline.style, {
                left: r.x * 100 + "%",
                top: r.y * 100 + "%",
                width: r.width * 100 + "%",
                height: r.height * 100 + "%",
              });
              outline.hidden = false;
            };
            button.onpointerenter = button.onfocus = highlight;
            button.onpointerleave = button.onblur = () => {
              outline.hidden = true;
            };
          }
          button.onclick = () => photoStart("control", source.token, control.token);
          $("photo-controls").append(button);
        }
      });
      row.append(preview, captureButton, controlsButton);
      $("photo-sources").append(row);
    }
    $("photo-status").textContent = `${sources.length} janela(s). Clique no nome para capturar.`;
  } finally {
    $("photo-refresh").disabled = false;
  }
});
api.onPhotoState?.((state) => {
  $("photo-status").textContent =
    state.error ||
    ({
      preparing: "Preparando captura…",
      selecting: "Selecione na imagem. Esc cancela.",
      countdown: `Captura em ${state.remaining} s`,
      acquiring: "Adquirindo imagem nova…",
      composing: "Compondo a imagem…",
      saving: "Salvando na biblioteca…",
      done: "Imagem salva.",
      cancelled: "Captura cancelada.",
    }[state.phase] ??
      state.phase);
  const retained = state.phase === "retained";
  $("photo-retry").hidden = $("photo-discard").hidden = !retained;
  const busy = [
    "preparing",
    "selecting",
    "countdown",
    "acquiring",
    "composing",
    "saving",
    "retained",
  ].includes(state.phase);
  photoDialog
    .querySelectorAll(
      "[data-photo],#photo-refresh,#photo-sources button,#photo-controls button,#photo-preset-tools button,#photo-repeat,#photo-defaults-save",
    )
    .forEach((button) => {
      button.disabled = busy;
    });
  if (retained && !photoDialog.open) photoDialog.showModal();
  if (state.phase === "done") {
    photoDialog.close();
    void refreshLibrary().catch((error) => toast(error.message, true));
  }
  if (["done", "cancelled", "error"].includes(state.phase)) {
    $("photo-sources").replaceChildren();
    $("photo-controls").replaceChildren();
  }
});
void mountRecordingRecovery(
  api,
  () => {
    const generation = workspaceGeneration,
      request = ++documentRequest,
      id = current?.id,
      originalRevision = revision;
    return (document) =>
      open(
        document,
        generation,
        request,
        () => current?.id === id && revision === originalRevision,
      );
  },
  toast,
).catch((error) => toast(error.message, true));

quickPanel = mountQuickVideo({
  api,
  current: () => current,
  changed: scheduleSave,
  persist,
  toast,
  refreshed: refreshLibrary,
});

quickPanel.activate(current);
quickPanel.show(view === "editor");
textPanel = mountTextPanel({ api, engine, current: () => current, toast });
textPanel.activate(current);
const assistant = createAssistant({ api });
guidePanel = mountGuides({ api, engine, current: () => current, toast, assistant });
assistantPanel = mountCaptureAssistant({
  assistant,
  engine,
  current: () => current,
  visibleText: () => textPanel.shareableText(),
  toast,
  // Name and tags go through the same metadata update as the library; undo uses it too.
  apply: async ({ name, tags }) => {
    const target = current;
    await api.update({ id: target.id, name, tags });
    if (current !== target) return;
    target.name = name;
    target.tags = tags;
    $("document-name").value = name;
    await refreshLibrary();
  },
});
assistantPanel.activate(current);
// Steps (A04): renumbering is always explicit and previewed; repeated numbers from older
// projects change only here. A number given to a step that another uses swaps the two.
const stepTools = document.createElement("details");
stepTools.innerHTML = `<summary>Passos numerados</summary><p id="steps-preview" role="status"></p><div class="object-actions"><button type="button" data-image-action id="steps-reading">Renumerar pela posição na imagem</button><button type="button" data-image-action id="steps-current">Renumerar mantendo a ordem atual</button></div><label>Número do passo selecionado <input id="step-number" type="number" min="1" max="1000"></label><button type="button" data-image-action id="step-number-apply">Aplicar número</button>`;
document.querySelector(".editor-extras").append(stepTools);
const describePlan = (plan) =>
  plan.length
    ? plan.map(([, from, to]) => `${from}→${to}`).join(", ")
    : "Os passos já estão em sequência.";
stepTools.addEventListener("toggle", () => {
  if (!stepTools.open) return;
  $("steps-preview").textContent =
    `Pela posição: ${describePlan(engine.renumberPlan("reading"))}. Ordem atual: ${describePlan(engine.renumberPlan("current"))}.`;
});
for (const [id, order] of [
  ["steps-reading", "reading"],
  ["steps-current", "current"],
])
  $(id).onclick = safe(async () => {
    const changed = engine.renumberSteps(order);
    $("steps-preview").textContent = changed
      ? `${changed} passo(s) renumerado(s). Desfazer volta os números anteriores.`
      : "Os passos já estão em sequência.";
    updateState();
  });
$("step-number-apply").onclick = safe(async () => {
  engine.setStepNumber(engine.selected, Number($("step-number").value));
  updateState();
});
