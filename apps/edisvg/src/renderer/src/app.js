import packageInfo from "../../../package.json";
import { startPathEditing, synchronizePathEditing } from "./pathEditor.js";
import "./pathEditor.css";
import { bindViewport, disposeCanvasTools } from "./canvasTools.js";
import { activateTool, bindToolbar, toolbar, toolShortcut } from "./toolbar.js";
import "./toolbar.css";
import { editScene, flattenScene } from "../../shared/scene.js";
import { bindScene, sceneCanvas, sceneInspector, sceneSidebar } from "./sceneEditor.js";
import { importSvg } from "./svgImport.js";
import "./sceneEditor.css";
import { createHistory } from "../../shared/history.js";
import { newProject, parseProject, snapshot, validateTransform } from "../../shared/project.js";
import { setupAssistant } from "./assistant.js";
import "./assistant.css";
import { animations, frameAt, poseAt, transition } from "../../shared/animation.js";
import { exportProject } from "./export.js";

const $ = (s) => document.querySelector(s);
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const state = {
  tool: "select",
  shape: "rect",
  pan: { x: 0, y: 0 },
  view: "animate",
  animation: "Acenar",
  frame: 18,
  playing: false,
  selected: "Braço Direito",
  bones: true,
  clean: false,
  zoom: 75,
  auto: true,
  curve: false,
  easing: "Suave",
  machine: "Parado",
  waving: false,
  humor: 0.6,
  name: "Zezé",
  transforms: { x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 },
  keys: [0, 18, 36, 54, 72],
};
state.keysByAnimation = snapshot(state).keysByAnimation;
state.modes = Object.fromEntries(Object.entries(animations).map(([name, a]) => [name, a.mode]));
let localSaveStatus = "Cópia local pronta";
let fileStatus = { name: "Sem arquivo", path: null, dirty: true };
applyProject(newProject());
const projectHistory = createHistory(snapshot(state));
let started = 0,
  offset = 0,
  toastTimer;
const layers = [
  ["Raiz", 0, "♧"],
  ["Tronco", 1, "♧"],
  ["Braço D", 2, "♧"],
  ["Antebraço D", 3, "♧"],
  ["Cabeça", 2, "♧"],
  ["Corpo", 0, "▱"],
  ["Torso", 1, "◇"],
  ["Braço Direito", 1, "◇"],
  ["Braço Esquerdo", 1, "◇"],
  ["Rosto", 0, "▱"],
  ["Olho E", 1, "○"],
  ["Olho D", 1, "○"],
  ["Boca", 1, "⌁"],
  ["Expressões (solo)", 0, "◈"],
  ["Balão · artboard aninhado", 0, "▣"],
];
const button = (action, label, cls = "") =>
  `<button data-action="${action}" class="${cls}">${label}</button>`;
function render() {
  disposeCanvasTools();
  synchronizePathEditing(state);
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark">⌁</span>EdiSVG <small class="app-version">${packageInfo.version}</small></div><nav class="menus">${button("file", "Arquivo")}${button("undo", "↶ Desfazer")}${button("redo", "↷ Refazer")}${button("object", "Objeto")}${button("animation", "Animação")}${button("view", "Exibir")}${button("help", "Ajuda")}</nav><div class="modes">${button("design", "◇ Design", state.view === "design" ? "active" : "")}${button("animate", "◷ Animar", state.view !== "design" ? "active" : "")}</div><span class="project">${state.scene ? "Projeto" : "Mascote"} ${escapeHtml(state.name)} <span title="${escapeHtml(fileStatus.path || "Projeto ainda sem arquivo")}">/ ${escapeHtml(fileStatus.name)}${fileStatus.dirty ? " •" : ""}</span><i class="saved" title="Salvo neste navegador"></i></span><div class="top-actions">${button("test", "▷ <span>Testar</span>")}${button("assistant", "✧ <span>Assistente</span>")}${button("export", "↗ Exportar", "primary")}</div></header><main class="workspace ${state.view === "machine" ? "machine-workspace" : ""}">${toolbar(state)}${state.scene ? sceneSidebar(state) : state.view === "machine" ? machineSidebar() : hierarchy()}<section class="center">${state.scene ? sceneCanvas(state) : state.view === "machine" ? machineCanvas() : canvas()}</section><aside class="inspector">${state.scene ? sceneInspector(state) : state.view === "machine" ? machineInspector() : inspector()}</aside></main>${state.view === "machine" ? '<footer class="statusbar"><span class="live-dot"></span> Máquina de estados · Interação <span class="push">3 estados · 4 listeners</span></footer>' : timeline()}<dialog id="export-dialog"></dialog><dialog id="help-dialog"></dialog>`;
  bind();
  bindToolbar();
  bindViewport(state, { render });
  if (state.scene) bindScene(state, { render, commit: save, notify });
  updatePose();
  refreshHistoryControls();
}
function hierarchy() {
  return `<aside class="sidebar"><div class="tabs">${button("hierarchy", "Hierarquia", "tab selected")}${button("artboards", "Artboards", "tab")}${button("assets", "Recursos", "tab")}</div><div class="tree"><div class="tree-title">▾ <span>▣</span> Zezé <small>· 1080×1080</small></div>${layers.map(([name, depth, icon]) => `<button class="layer ${name === state.selected ? "selected" : ""}" data-layer="${name}" style="--depth:${depth}"><span class="disclosure">${depth === 0 ? "⌄" : ""}</span><span class="layer-icon ${icon === "♧" ? "pink" : ""}">${icon}</span><span>${name}</span>${["Torso", "Braço Direito", "Braço Esquerdo"].includes(name) ? "<small>malha</small>" : name === "Boca" ? "<small>morph</small>" : ""}<span class="eye">◉</span></button>`).join("")}</div><section class="animations"><h3>ANIMAÇÕES <span>◷</span></h3>${Object.entries(
    animations,
  )
    .map(
      ([name, a]) =>
        `<button data-animation="${name}" class="animation-row ${state.animation === name ? "selected" : ""}"><span>▷</span><strong>${name}</strong><small>${(a.frames / 60).toFixed(1).replace(".", ",")}s · ${a.mode === "once" ? "uma vez" : a.mode}</small></button>`,
    )
    .join(
      "",
    )}${button("machine", '<span class="purple">◈</span> Máquina: Interação <small>3 estados</small>', "machine-link")}</section></aside>`;
}
function canvas() {
  return `<div class="canvas-toolbar"><span>▣ &nbsp; Zezé <small>1080×1080</small></span><span class="fps">60 fps</span><div class="canvas-options">${button("edit-demo", "Editar formas")}${button("bones", "♧ <span>Mostrar ossos</span>", state.bones ? "selected" : "")}${button("clean", "◉ <span>Prévia limpa</span>", state.clean ? "selected" : "")}<select id="zoom" aria-label="Zoom">${[25, 50, 75, 100, 125, 150, 200, 300].map((v) => `<option ${state.zoom === v ? "selected" : ""}>${v}%</option>`).join("")}</select></div></div><div class="stage"><span class="stage-caption">Zezé</span><div class="artboard" style="--zoom:${state.zoom / 75}"><div class="ground"></div><img class="mascot" src="assets/zeze.svg" alt="Zezé, mascote turquesa sorridente"><svg class="rig ${!state.bones || state.clean ? "hidden" : ""}" viewBox="0 0 440 440" aria-hidden="true"><g stroke="#ff7ad9" stroke-width="1.5" fill="none"><path d="M220 300L220 262L220 205M220 262L174 240L152 214L134 190"/><path d="M220 262L214 278L220 300L226 278Z M174 240L157 224L152 214L166 222Z" fill="#ff7ad944"/><circle cx="220" cy="300" r="4"/><circle cx="220" cy="262" r="4"/><circle cx="220" cy="205" r="4"/><circle cx="174" cy="240" r="4"/><circle cx="152" cy="214" r="4"/><circle cx="123" cy="179" r="11"/><path d="M116 179h14m-7-7v14"/></g><g stroke="#4fe3c1" fill="none"><rect x="122" y="182" width="60" height="66" stroke-dasharray="3 3"/><path d="M119 179h6v6h-6zM179 179h6v6h-6zM119 245h6v6h-6zM179 245h6v6h-6z" fill="#4fe3c1"/></g><rect x="40" y="140" width="79" height="19" rx="3" fill="#ff7ad9"/><text x="46" y="153" font-size="10" fill="#32172c">◎ Alvo Mão</text></svg></div><span class="canvas-hint">${state.view === "design" ? "Selecione uma camada para ajustar suas propriedades" : "Espaço para reproduzir · ← → para navegar nos quadros"}</span></div>`;
}
function inspector() {
  return `<div class="inspector-title"><span class="mint">◇</span><strong>${escapeHtml(state.selected)}</strong><small>caminho + malha</small></div><section><h3>TRANSFORMAÇÃO <span>◇</span></h3><div class="property-grid">${[
    ["x", "X", "px"],
    ["y", "Y", "px"],
    ["rotation", "Rotação", "°"],
    ["opacity", "Opac.", "%"],
    ["sx", "Escala X", ""],
    ["sy", "Escala Y", ""],
  ]
    .map(
      ([key, label, unit]) =>
        `<label class="property"><span>${label}</span><input aria-label="${label}" data-transform="${key}" type="number" step="${key === "sx" || key === "sy" ? ".05" : "1"}" value="${state.transforms[key]}" ${key === "opacity" ? 'min="0" max="100"' : ""}><small>${unit}</small></label>`,
    )
    .join(
      "",
    )}</div><p class="micro">Ajustes aplicados ao mascote completo nesta versão.</p></section><section><h3>INTERPOLAÇÃO</h3><div class="segments">${["Linear", "Suave", "Elástico", "Degrau"].map((v) => `<button data-easing="${v}" class="${state.easing === v ? "selected" : ""}">${v}</button>`).join("")}</div><div class="curve-graph"><svg viewBox="0 0 260 130"><path class="graph-grid" d="M0 32H260M0 65H260M0 98H260M65 0V130M130 0V130M195 0V130"/><path id="easing-path" d="${curvePath()}"/><circle cx="4" cy="124" r="3"/><circle cx="256" cy="6" r="3"/></svg></div><code class="micro">${state.easing === "Suave" ? "cubic-bezier(0.36, 0.44, 0.64, 1)" : state.easing.toLowerCase()}</code></section><section><h3>RESTRIÇÕES <span>＋</span></h3><div class="constraint"><span class="pink">♧</span> IK · Antebraço D → Alvo Mão <small>Referência</small></div><p class="micro">Visualização do rig original. Edição IK em desenvolvimento.</p></section><section><h3>DADOS <small>(VIEW MODEL)</small></h3><label class="data-row">humor <span>número</span><input id="humor" aria-label="Humor" type="number" min="0" max="1" step=".1" value="${state.humor}"></label><label class="data-row">acenando <span>booleano</span><input id="waving" type="checkbox" ${state.waving ? "checked" : ""}></label><label class="data-row">nome <span>texto</span><input id="name" aria-label="Nome" value="${escapeHtml(state.name)}"></label></section>`;
}
function curvePath() {
  return {
    Linear: "M4 124L256 6",
    Suave: "M4 124C100 80 166 6 256 6",
    Elástico: "M4 124C100 124 120 -45 170 20S225 0 256 6",
    Degrau: "M4 124H130V6H256",
  }[state.easing];
}
function timeline() {
  const a = animations[state.animation];
  const rows = state.scene
    ? ["Projeto", "Marcadores globais"]
    : [
        "Braço Direito",
        "Rotação",
        "Escala X / Y",
        "Antebraço D",
        "Rotação",
        "Boca",
        "Vértices (morph)",
        "Expressões",
        "Solo ativo",
        "Eventos",
        "acenou → runtime",
      ];
  return `<section class="timeline"><div class="timeline-header"><select id="animation-select" aria-label="Animação">${Object.keys(
    animations,
  )
    .map((n) => `<option ${n === state.animation ? "selected" : ""}>${n}</option>`)
    .join("")}</select><select id="loop-mode" aria-label="Modo de reprodução">${[
    ["loop", "Loop"],
    ["ping-pong", "Ping-pong"],
    ["once", "Uma vez"],
  ]
    .map(([v, n]) => `<option value="${v}" ${a.mode === v ? "selected" : ""}>${n}</option>`)
    .join(
      "",
    )}</select><div class="transport">${button("start", "|◁")}${button("previous", "‹")}${button("play", state.playing ? "Ⅱ" : "▶", "play")}${button("next", "›")}${button("end", "▷|")}</div><span id="timecode" class="timecode"></span><span class="push"></span>${button("add-key", "◇ Adicionar chave")}${button("auto", '<span class="key">◆</span> Chave automática', state.auto ? "selected" : "")}${button("curves", state.curve ? "⌁ Curvas" : "◇ Chaves", "view-toggle")}</div><div class="timeline-body"><div class="ruler-label">PROPRIEDADES</div><div class="ruler">${Array.from({ length: 7 }, (_, i) => `<span>${Math.round((a.frames * i) / 6)}</span>`).join("")}</div>${rows.map((name, i) => `<div class="track-label ${[1, 2, 4, 6, 8, 10].includes(i) ? "indent" : ""}">${[0, 3, 5, 7, 9].includes(i) ? "⌄ &nbsp; " : ""}${name}<span>${i === 10 ? "⚑" : "◇"}</span></div><div class="track ${i % 2 ? "alternate" : ""}" data-track="${i}">${(i === 0 || i === 3 || i === 5 ? [] : state.keys.filter((k, j) => i !== 8 || j % 2 === 0)).map((k) => `<button class="keyframe ${i === 8 ? "violet" : ""}" aria-label="Quadro ${k}, ${name}" data-frame="${k}" style="left:${(k / a.frames) * 100}%">◆</button>`).join("")}${state.curve && i === 1 ? '<svg class="timeline-curve" viewBox="0 0 600 24" preserveAspectRatio="none"><path d="M0 22Q150 22 300 2T600 22"/></svg>' : ""}</div>`).join("")}<div id="playhead"><span></span></div></div><footer class="statusbar"><span class="live-dot"></span> <span data-local-save>${localSaveStatus}</span> <span class="push">EdiSVG · Prévia funcional <span class="mint">60 fps</span></span></footer></section>`;
}
function machineSidebar() {
  return `<aside class="sidebar"><div class="panel-heading">◈ Máquina: Interação</div><section><h3>CAMADAS</h3><div class="machine-layer selected">Corpo<small>Parado · Acenar · Pular</small></div><div class="machine-layer">Rosto<small>Blend 1D por humor · referência</small></div><div class="machine-layer">Piscar<small>Loop independente · referência</small></div></section><section><h3>INPUTS</h3><label class="data-row"><small class="purple">BOOL</small> acenando <input id="waving" type="checkbox" ${state.waving ? "checked" : ""}></label><label class="data-row"><small class="mint">NUM</small> humor <input id="humor" aria-label="Humor" type="number" min="0" max="1" step=".1" value="${state.humor}"></label><div class="data-row"><small class="key">TRIG</small> clicar ${button("trigger", "Disparar")}</div></section><section><h3>LISTENERS</h3>${[
    ["Mouse entra", "acenando = true"],
    ["Mouse sai", "acenando = false"],
    ["Clique", "disparar clicar"],
  ]
    .map(([a, b]) => `<div class="listener">${a}<small>em Corpo</small><span>→ ${b}</span></div>`)
    .join("")}</section>${button("animate", "← Voltar à timeline", "back-link")}</aside>`;
}
function machineCanvas() {
  return `<div class="canvas-toolbar"><span>Corpo <small> / Máquina de estados</small></span><span class="push"></span><span class="live-dot"></span> ao vivo</div><div class="state-graph"><div class="entry">Entry <small>início</small></div><div class="connector">→</div>${["Parado", "Acenar", "Pular"].map((n, i) => `${i ? '<div class="connector">⇄<small>' + (i === 1 ? "acenando" : "clicar") + "</small></div>" : ""}<button class="state-node ${state.machine === n ? "running" : ""}" data-state="${n}"><span>◷ ${n}</span><small>anim. ${n} · ${animations[n].mode}</small><em>${state.machine === n ? "● ativo" : "○ estado"}</em></button>`).join("")}</div><div class="transition-note">Parado → Acenar: acenando = true &nbsp; / &nbsp; Pular → Parado: ao terminar</div><div class="live-preview"><div class="preview-title"><strong>Testar interação</strong><span class="mint">● ao vivo</span></div><div class="preview-body" tabindex="0" role="button" aria-label="Interagir com Zezé"><img class="mascot" src="assets/zeze.svg" alt="Zezé interativo"></div><p>Passe o mouse para acenar. Clique para pular.</p></div>`;
}
function machineInspector() {
  return `<div class="panel-heading">TRANSIÇÃO SELECIONADA</div><section><div class="transition-title">Parado <span class="mint">→</span> Acenar</div><p class="detail">Condição <strong>acenando = true</strong></p><p class="detail">Duração <strong>200 ms · Suave</strong></p><p class="detail">Sair em <strong>imediato</strong></p></section><section><h3>EVENTOS RECEBIDOS</h3><div id="event-log" aria-live="polite"><p><span class="mint">0,00s</span> Entry → Parado</p></div></section><section><h3>USAR NO SITE</h3><p class="micro">Exporte como HTML interativo para testar os estados diretamente no navegador.</p>${button("export", "↗ Exportar para web", "wide")}</section>`;
}
function bind() {
  document.querySelectorAll("[data-action]").forEach((el) => {
    el.onclick = () => action(el.dataset.action);
  });
  document.querySelectorAll("[data-layer]").forEach((el) => {
    el.onclick = () => {
      state.selected = el.dataset.layer;
      render();
    };
  });
  document.querySelectorAll("[data-animation]").forEach((el) => {
    el.onclick = () => selectAnimation(el.dataset.animation);
  });
  document.querySelectorAll("[data-state]").forEach((el) => {
    el.onclick = () => setMachine(el.dataset.state);
  });
  document.querySelectorAll("[data-frame]").forEach((el) => {
    el.onclick = () => seek(Number(el.dataset.frame));
  });
  document.querySelectorAll("[data-easing]").forEach((el) => {
    el.onclick = () => {
      state.easing = el.dataset.easing;
      render();
    };
  });
  document.querySelectorAll("[data-transform]").forEach((el) => {
    el.onchange = () => {
      const key = el.dataset.transform;
      try {
        const value = Number(el.value);
        if (!el.value.trim()) throw new Error("Informe um número.");
        Object.assign(state.transforms, validateTransform({ [key]: value }));
        save();
        updatePose();
      } catch (error) {
        el.value = state.transforms[key];
        notify(error.message);
      }
    };
  });
  if ($("#zoom"))
    $("#zoom").onchange = (e) => {
      state.zoom = parseInt(e.target.value);
      $(".artboard").style.setProperty("--zoom", state.zoom / 75);
    };
  if ($("#animation-select"))
    $("#animation-select").onchange = (e) => selectAnimation(e.target.value);
  if ($("#loop-mode"))
    $("#loop-mode").onchange = (e) => {
      animations[state.animation].mode = e.target.value;
      state.modes[state.animation] = e.target.value;
      save();
    };
  if ($("#waving"))
    $("#waving").onchange = (e) => {
      state.waving = e.target.checked;
      if (state.view === "machine")
        setMachine(transition(state.machine, state.waving ? "enter" : "leave"));
      else selectAnimation(state.waving ? "Acenar" : "Parado");
    };
  if ($("#humor"))
    $("#humor").onchange = (e) => {
      state.humor = Math.max(0, Math.min(1, Number(e.target.value) || 0));
      e.target.value = state.humor;
      save();
    };
  if ($("#name"))
    $("#name").onchange = (e) => {
      state.name = e.target.value.slice(0, 60) || "Zezé";
      save();
      render();
    };
  if ($(".ruler"))
    $(".ruler").onpointerdown = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      seek(Math.round(((e.clientX - r.left) / r.width) * animations[state.animation].frames));
    };
  if ($(".preview-body")) {
    const p = $(".preview-body");
    p.onmouseenter = () => {
      state.waving = true;
      setMachine(transition(state.machine, "enter"));
    };
    p.onmouseleave = () => {
      state.waving = false;
      setMachine(transition(state.machine, "leave"));
    };
    p.onclick = () => setMachine("Pular");
    p.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setMachine("Pular");
      }
    };
  }
}
function applyProject(value) {
  const project = parseProject(value);
  state.tool = "select";
  if (project.scene) {
    state.view = "design";
    if (!flattenScene(project.scene).some((e) => e.node.id === state.selected))
      state.selected = null;
  }
  Object.assign(state, project, {
    humor: project.inputs.humor,
    waving: project.inputs.acenando,
    frame: 0,
    playing: false,
  });
  for (const [name, mode] of Object.entries(project.modes)) animations[name].mode = mode;
}
function save(record = true) {
  const project = snapshot(state);
  if (record) projectHistory.commit(project);
  try {
    localStorage.setItem("edisvg-project", JSON.stringify(project));
    localSaveStatus = "Cópia local atualizada";
  } catch {
    localSaveStatus = "Cópia local indisponível";
    notify("Não foi possível atualizar a cópia local. Salve o projeto em arquivo.");
  }
  refreshHistoryControls();
  if (window.desktop)
    void window.desktop
      .projectChanged(project)
      .then(updateFileStatus)
      .catch((error) => notify(error.message));
}
function updateFileStatus(status) {
  fileStatus = status;
  const el = document.querySelector(".project>span");
  if (el) {
    el.textContent = "/ " + status.name + (status.dirty ? " •" : "");
    el.title = status.path || "Projeto ainda sem arquivo";
  }
  document.title = (status.dirty ? "• " : "") + status.name + " — EdiSVG " + packageInfo.version;
}
function refreshHistoryControls() {
  for (const direction of ["undo", "redo"]) {
    const el = document.querySelector('[data-action="' + direction + '"]');
    if (el) {
      el.disabled = direction === "undo" ? !projectHistory.canUndo : !projectHistory.canRedo;
      el.title =
        direction === "undo" ? "Desfazer edição (Ctrl+Z)" : "Refazer edição (Ctrl+Shift+Z)";
    }
  }
  const indicator = document.querySelector("[data-local-save]");
  if (indicator) indicator.textContent = localSaveStatus;
}
function travelHistory(direction) {
  const project = projectHistory[direction]();
  if (!project) return false;
  applyProject(project);
  save(false);
  render();
  return true;
}
function notify(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function selectAnimation(name) {
  state.keysByAnimation[state.animation] = [...state.keys];
  state.animation = name;
  state.frame = 0;
  state.playing = false;
  state.keys = [...state.keysByAnimation[name]];
  save();
  render();
}
function seek(frame) {
  state.playing = false;
  state.frame = Math.max(0, Math.min(animations[state.animation].frames, frame));
  render();
}
function play() {
  if (state.playing) state.playing = false;
  else {
    if (state.frame >= animations[state.animation].frames) state.frame = 0;
    state.playing = true;
    started = performance.now();
    offset = state.frame / 60;
  }
  render();
}
function setMachine(name) {
  const old = state.machine;
  state.machine = name;
  state.frame = 0;
  state.playing = true;
  started = performance.now();
  offset = 0;
  document.querySelectorAll("[data-state]").forEach((el) => {
    el.classList.toggle("running", el.dataset.state === name);
    el.querySelector("em").textContent = el.dataset.state === name ? "● ativo" : "○ estado";
  });
  if ($("#waving")) $("#waving").checked = state.waving;
  const log = $("#event-log");
  if (log && old !== name) {
    const p = document.createElement("p");
    p.textContent = `${new Date().toLocaleTimeString("pt-BR")}  ${old} → ${name}`;
    log.prepend(p);
    while (log.children.length > 8) log.lastChild.remove();
  }
}
function updatePose() {
  const name = state.view === "machine" ? state.machine : state.animation,
    a = animations[name],
    p = poseAt(name, state.frame, a.frames),
    t = state.transforms;
  document.querySelectorAll(".mascot,.scene-artwork").forEach((img) => {
    img.style.transform =
      state.scene && state.view === "design"
        ? "none"
        : `translate(${t.x}px,${t.y + p.y}px) rotate(${t.rotation + p.rotation}deg) scale(${t.sx * p.scale},${t.sy * p.scale})`;
    img.style.opacity = t.opacity / 100;
  });
  if ($("#timecode"))
    $("#timecode").innerHTML =
      `<strong>${Math.floor(state.frame / 60)}:${String(Math.floor(state.frame % 60)).padStart(2, "0")}</strong> <small>/ ${(a.frames / 60).toFixed(2)}s · quadro ${Math.floor(state.frame)} de ${a.frames}</small>`;
  if ($("#playhead"))
    $("#playhead").style.left =
      `calc(var(--track-label) + (100% - var(--track-label) - 20px) * ${state.frame / a.frames})`;
}
function action(id) {
  if (id === "design" && !state.scene) return editDemo();
  if (id.startsWith("tool-")) {
    const result = activateTool(state, id.slice(5));
    if (!result.ok) {
      notify(result.reason);
      return;
    }
    render();
    document.querySelector(`[data-tool="${state.tool}"]`)?.focus();
    return;
  }
  if (id === "edit-demo") return editDemo();
  if (id === "import-svg") return importArtwork();
  if (state.scene && id === "add-shape") {
    try {
      state.selected = editScene(state.scene, null, "add", id === "tool-text" ? "text" : "rect");
      save();
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (state.scene && ["test", "machine", "trigger"].includes(id)) {
    notify("Estados editáveis para seus SVGs serão adicionados em uma próxima etapa.");
    return;
  }
  if (id === "assistant") return assistant.toggle();
  if (id === "file") return assistant.fileMenu();
  if (["animate", "design", "machine"].includes(id)) {
    state.view = id;
    state.playing = false;
    render();
    return;
  }
  if (id === "test") {
    state.view = "machine";
    render();
    setMachine("Parado");
    return;
  }
  if (id === "play") return play();
  if (id === "start") return seek(0);
  if (id === "end") return seek(animations[state.animation].frames);
  if (id === "previous") return seek(state.frame - 1);
  if (id === "next") return seek(state.frame + 1);
  if (id === "bones") {
    state.bones = !state.bones;
    render();
    return;
  }
  if (id === "clean") {
    state.clean = !state.clean;
    render();
    return;
  }
  if (id === "curves") {
    state.curve = !state.curve;
    render();
    return;
  }
  if (id === "auto") {
    state.auto = !state.auto;
    render();
    return;
  }
  if (id === "add-key") {
    const f = Math.round(state.frame);
    if (!state.keys.includes(f)) state.keys.push(f);
    state.keys.sort((a, b) => a - b);
    save();
    render();
    notify(`Chave adicionada no quadro ${f}`);
    return;
  }
  if (id === "export") return openExport();
  if (id === "help") return openHelp();
  if (id === "trigger") return setMachine("Pular");
  if (id === "file") {
    save();
    notify("Projeto salvo neste navegador. Use Exportar para baixar uma cópia.");
    return;
  }
  if (id === "animation") return play();
  if (id === "view") {
    state.clean = !state.clean;
    render();
    return;
  }
  if (id === "object") {
    notify("Selecione uma camada à esquerda e edite a transformação no painel direito.");
    return;
  }
  if (id === "undo" || id === "redo") {
    travelHistory(id);
    return;
  }
  if (id === "artboards") {
    notify(
      state.scene
        ? `Artboard: ${state.name} · ${state.scene.viewBox[2]} × ${state.scene.viewBox[3]}`
        : "Artboard: Zezé · 1080 × 1080.",
    );
    return;
  }
  if (id === "assets") {
    notify(
      state.scene
        ? "As formas vetoriais do projeto estão na hierarquia."
        : "Recurso do projeto: mascote Zezé em SVG vetorial.",
    );
    return;
  }
  if (id === "hierarchy") return;
  notify("Esta ferramenta faz parte do design e ainda não está implementada.");
}
async function editDemo() {
  if (state.scene) return;
  try {
    const response = await fetch("assets/zeze.svg");
    if (!response.ok) throw new Error("Não foi possível carregar as formas do mascote.");
    const scene = importSvg(await response.text());
    if (state.scene) return;
    let number = 0;
    for (const { node } of flattenScene(scene))
      node.name =
        node.tag === "g"
          ? `Forma ${++number}`
          : node.tag === "path"
            ? "Caminho"
            : node.tag === "ellipse"
              ? "Elipse"
              : node.tag;
    state.scene = scene;
    state.view = "design";
    state.tool = "select";
    state.pathEdit = null;
    state.playing = false;
    state.frame = 0;
    state.selected = flattenScene(scene).find(({ node }) => node.tag === "path")?.node.id ?? null;
    state.transforms = { x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 };
    save();
    render();
    notify(
      "Formas do mascote disponíveis. Selecione uma forma e pressione Enter para editar vértices.",
    );
  } catch (error) {
    notify(error.message);
  }
}
async function importArtwork() {
  if (!window.desktop) {
    notify("Use a versão desktop para importar um SVG.");
    return;
  }
  try {
    const source = await window.desktop.importSvg();
    if (source == null) return;
    const scene = importSvg(source);
    state.scene = scene;
    state.selected = flattenScene(scene)[0]?.node.id ?? null;
    state.view = "design";
    state.playing = false;
    state.frame = 0;
    state.transforms = { x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 };
    save();
    render();
    notify("SVG importado. A arte anterior pode ser recuperada com Desfazer.");
  } catch (error) {
    notify(error.message);
  }
}
function openHelp() {
  const d = $("#help-dialog");
  d.innerHTML = `<div class="dialog-heading"><div><h2>Seu estúdio de movimento.</h2><p>Comece com o mascote Zezé.</p></div><button id="close-help" aria-label="Fechar">×</button></div><div class="help-content"><p><b>01 · Explore a timeline</b><br>Selecione uma animação, clique na régua e pressione Espaço para reproduzir.</p><p><b>02 · Teste a interação</b><br>Abra a máquina de estados. Passe o mouse no mascote para acenar e clique para pular.</p><p><b>03 · Leve para a web</b><br>Exporte um HTML independente, um SVG animado ou os dados do projeto.</p><p><b>04 · Edite as formas</b><br>Clique em Design, selecione uma forma e pressione Enter. Arraste os pontos e alças; use Concluir para sair. Ctrl+Z desfaz a edição.</p><p class="micro">Prévia funcional: movimentos globais do mascote. Deformação de malha, IK, desenho e edição de transições ainda não estão disponíveis.</p></div>`;
  $("#close-help").onclick = () => d.close();
  d.showModal();
}
function openExport() {
  const d = $("#export-dialog");
  d.innerHTML = `<div class="dialog-heading"><div><h2>Exportar para web</h2><p>Zezé · máquina Interação · 3 animações</p></div><button id="close-export" aria-label="Fechar exportação">×</button></div><div class="export-content"><h3>FORMATO</h3>${[
    [
      "html",
      "HTML interativo",
      "recomendado",
      "Arquivo independente com mascote, animações e interação.",
    ],
    ["svg", "SVG animado", "timeline", "Animação atual em CSS. Sem máquina de estados."],
    ["json", "Projeto EdiSVG", "dados", "Transformações, quadros e configurações em JSON."],
  ]
    .map(
      ([v, n, b, desc], i) =>
        `<label class="format-option"><input type="radio" name="format" value="${v}" ${i === 0 ? "checked" : ""}><div><strong>${n}</strong><span class="badge">${b}</span><p>${desc}</p></div></label>`,
    )
    .join(
      "",
    )}<h3>OPÇÕES</h3><label class="export-field">Texto alternativo<input id="alt-text" value="Zezé, o mascote, acenando" maxlength="200"></label><label class="check-row"><input id="reduced" type="checkbox" checked><span>Respeitar “reduzir movimento”<small>Pausa a animação quando solicitado pelo sistema.</small></span></label><label class="check-row"><input id="offscreen" type="checkbox" checked><span>Pausar fora da tela<small>Economiza recursos quando o personagem não está visível.</small></span></label></div><div class="dialog-footer"><span>Escolha onde salvar o arquivo</span><button id="cancel-export">Cancelar</button><button class="primary" id="download">↗ Exportar arquivo</button></div>`;
  $("#close-export").onclick = $("#cancel-export").onclick = () => d.close();
  $("#download").onclick = async () => {
    const b = $("#download");
    b.disabled = true;
    b.textContent = "Preparando…";
    try {
      const exportResult = await exportProject(state, {
        format: $('input[name="format"]:checked').value,
        alt: $("#alt-text").value,
        reduced: $("#reduced").checked,
        offscreen: $("#offscreen").checked,
      });
      if (exportResult?.saved === false) {
        notify("Exportação cancelada.");
        return;
      }
      d.close();
      notify(window.desktop ? "Arquivo exportado." : "Arquivo exportado. Confira seus downloads.");
    } catch {
      notify("Não foi possível exportar. Tente novamente.");
    } finally {
      b.disabled = false;
      b.textContent = "↗ Exportar arquivo";
    }
  };
  d.showModal();
}
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable ||
    document.querySelector("dialog[open]")
  )
    return;
  if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    travelHistory(e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
    return;
  }
  if (state.scene && e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    startPathEditing(state, { render, commit: save, notify });
    return;
  }
  if (
    state.scene &&
    (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") || e.key === "Delete")
  ) {
    e.preventDefault();
    try {
      state.selected = editScene(
        state.scene,
        state.selected,
        e.key === "Delete" ? "delete" : "duplicate",
      );
      save();
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const shortcut = toolShortcut(e);
    if (shortcut) {
      e.preventDefault();
      const result = activateTool(state, shortcut.id);
      if (!result.ok) {
        notify(result.reason);
        return;
      }
      if (shortcut.shape) state.shape = shortcut.shape;
      render();
      return;
    }
    if (e.key === "Escape") {
      state.tool = "select";
      render();
      return;
    }
  }
  if (e.code === "Space") {
    e.preventDefault();
    play();
  }
  if (e.key === "ArrowRight") seek(state.frame + 1);
  if (e.key === "ArrowLeft") seek(state.frame - 1);
});
function tick(now) {
  if (state.playing && !document.hidden) {
    const a = animations[state.view === "machine" ? state.machine : state.animation];
    const elapsed = (now - started) / 1000 + offset;
    state.frame = frameAt(elapsed, a.frames, a.mode);
    if (a.mode === "once" && state.frame >= a.frames) {
      if (state.view === "machine") setMachine(transition(state.machine, "finish", state.waving));
      else {
        state.playing = false;
        render();
      }
    }
    updatePose();
  }
  requestAnimationFrame(tick);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    offset = state.frame / 60;
  } else started = performance.now();
});
const assistant = setupAssistant({
  snapshot: () => snapshot(state),
  overview: () => ({
    ...snapshot(state),
    scene: state.scene
      ? {
          viewBox: state.scene.viewBox,
          objects: flattenScene(state.scene).map(({ node, depth, locked }) => ({
            id: node.id,
            name: node.name,
            tag: node.tag,
            depth,
            locked,
            visible: node.visible,
            transform: node.transform,
          })),
        }
      : null,
    frame: Math.floor(state.frame),
    selected: state.selected,
    capabilities: [
      "transformação global",
      "animações predefinidas",
      "marcadores de chave",
      ...(state.scene ? ["objetos SVG básicos"] : []),
    ],
    limitations: ["sem IK", "sem deformação de malha", "sem keyframes por objeto"],
  }),
  importSvg: importArtwork,
  fileStatus: updateFileStatus,
  restore(value) {
    applyProject(value);
    projectHistory.reset(snapshot(state));
    save(false);
    render();
  },
  undo: () => travelHistory("undo"),
  redo: () => travelHistory("redo"),
  execute(name, input) {
    if (name === "set_transform") {
      Object.assign(state.transforms, validateTransform(input));
    } else if (name === "rename_project") {
      if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120)
        throw new Error("Nome inválido.");
      state.name = input.name;
    } else if (name === "set_animation") {
      if (!animations[input.name]) throw new Error("Animação inválida.");
      selectAnimation(input.name);
    } else if (name === "seek_frame" || name === "add_keyframe") {
      if (
        !Number.isInteger(input.frame) ||
        input.frame < 0 ||
        input.frame > animations[state.animation].frames
      )
        throw new Error("Quadro fora da animação.");
      if (name === "seek_frame") seek(input.frame);
      else if (!state.keys.includes(input.frame)) state.keys.push(input.frame);
    } else throw new Error("Ferramenta desconhecida.");
    save();
    render();
  },
  notify,
});
render();
save(false);
requestAnimationFrame(tick);
