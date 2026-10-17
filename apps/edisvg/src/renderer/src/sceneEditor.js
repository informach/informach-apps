import { animations } from "../../shared/animation.js";
import { validateTransform } from "../../shared/project.js";
import { editScene, flattenScene, renderScene, xmlEscape } from "../../shared/scene.js";
import { bindCanvasTools } from "./canvasTools.js";
import { bindPathInspector, pathInspector } from "./pathEditor.js";

const esc = xmlEscape;

export function bindLayerRenaming(state, { render, commit, notify }) {
  const begin = (id) => {
    const entry = flattenScene(state.scene).find((item) => item.node.id === id);
    if (!entry) return;
    state.selected = id;
    if (entry.locked) {
      notify("Desbloqueie o objeto e seus grupos para renomear.");
      render();
      return;
    }
    state.renaming = id;
    render();
  };
  document.querySelectorAll("[data-scene-select]").forEach((row) => {
    row.onclick = () => {
      state.selected = row.dataset.sceneSelect;
      state.renaming = null;
      render();
    };
    row.onkeydown = (event) => {
      if (event.target !== row) return;
      if (event.key === "F2") {
        event.preventDefault();
        event.stopPropagation();
        begin(row.dataset.sceneSelect);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        row.onclick();
      }
    };
  });
  document.querySelectorAll("[data-layer-name]").forEach((label) => {
    label.onclick = (event) => {
      event.stopPropagation();
      if (!label.querySelector("input")) begin(label.dataset.layerName);
    };
  });
  const input = document.querySelector("[data-layer-rename]");
  if (!input) return;
  const id = input.dataset.layerRename;
  let finished = false;
  const finish = (cancel, refresh = true) => {
    if (finished) return;
    finished = true;
    state.renaming = null;
    if (!cancel) {
      const entry = flattenScene(state.scene).find((item) => item.node.id === id),
        name = input.value.trim();
      if (entry && name && name !== entry.node.name) {
        try {
          editScene(state.scene, id, "rename", name);
          commit();
        } catch (error) {
          notify(error.message);
        }
      }
    }
    if (refresh) render();
    else {
      const entry = flattenScene(state.scene).find((item) => item.node.id === id);
      if (input.parentElement) input.parentElement.textContent = entry?.node.name ?? "";
      const heading = document.querySelector(".inspector>.panel-heading");
      if (heading && state.selected === id) heading.textContent = entry?.node.name ?? "";
    }
  };
  input.onblur = () => finish(false, false);
  input.onkeydown = (event) => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      finish(event.key === "Escape");
    }
  };
  input.focus();
  input.select();
}

export function sceneSidebar(state) {
  const layers = flattenScene(state.scene)
    .map(
      ({ node, depth, locked }) =>
        `<div role="button" tabindex="0" data-scene-select="${node.id}" class="layer ${state.selected === node.id ? "selected" : ""}" style="--depth:${depth}"><span class="layer-icon">${node.tag === "g" ? "▱" : "◇"}</span><span class="layer-name" data-layer-name="${node.id}" title="Clique para renomear">${state.renaming === node.id ? `<input data-layer-rename="${node.id}" aria-label="Nome do objeto" maxlength="120" value="${esc(node.name)}">` : esc(node.name)}</span><small>${!node.visible ? "oculto" : locked ? "bloqueado" : node.tag === "path" ? "caminho" : node.tag}</small></div>`,
    )
    .join("");
  const rows = Object.entries(animations)
    .map(
      ([name, animation]) =>
        `<button data-animation="${name}" class="animation-row ${state.animation === name ? "selected" : ""}"><span>▷</span><strong>${name}</strong><small>${(animation.frames / 60).toFixed(1)}s · ${animation.mode}</small></button>`,
    )
    .join("");
  return `<aside class="sidebar"><div class="tabs"><button class="tab selected" data-action="hierarchy">Hierarquia</button><button class="tab" data-action="artboards">Artboards</button><button class="tab" data-action="assets">Recursos</button></div><div class="scene-tree-heading">${esc(state.name)}<small>${state.scene.viewBox[2]} × ${state.scene.viewBox[3]}</small></div><div class="tree">${layers || '<p class="micro scene-padding">Projeto vazio. Desenhe com a barra de ferramentas ou importe um SVG.</p>'}</div><section class="animations"><h3>ANIMAÇÕES GLOBAIS</h3>${rows}<button data-action="import-svg">↥ Importar SVG</button></section></aside>`;
}
export function sceneCanvas(state) {
  return `<div class="canvas-toolbar"><strong>${esc(state.name)}</strong><small>${state.scene.viewBox[2]} × ${state.scene.viewBox[3]}</small><span class="push"></span>${state.pathEdit ? '<span class="vertex-editing-label">Editar vértices</span>' : ""}${
    state.tool === "shapes"
      ? `<select data-shape aria-label="Forma">${[
          ["rect", "Retângulo"],
          ["circle", "Círculo"],
          ["line", "Linha"],
        ]
          .map(
            ([v, n]) => `<option value="${v}" ${state.shape === v ? "selected" : ""}>${n}</option>`,
          )
          .join("")}</select>`
      : ""
  }<button data-viewport-reset title="Centralizar área de trabalho">Centralizar</button><select id="zoom" aria-label="Zoom">${[25, 50, 75, 100, 125, 150, 200, 300].map((v) => `<option ${state.zoom === v ? "selected" : ""}>${v}%</option>`).join("")}</select><button data-action="import-svg">Importar SVG</button></div><div class="stage"><div class="artboard scene-artboard" style="--zoom:${state.zoom / 75};aspect-ratio:${state.scene.viewBox[2]}/${state.scene.viewBox[3]}"><div class="scene-artwork">${renderScene(state.scene, { editor: true })}</div></div><span class="canvas-hint">${state.pathEdit ? "Arraste os pontos e alças. Duplo clique no segmento adiciona um ponto." : { pen: "Clique para criar pontos; arraste para curvas. Enter conclui; Esc cancela.", select: "Arraste para mover · Esc para cancelar", shapes: "Arraste para desenhar · Shift para proporções iguais", text: "Clique para inserir texto e edite no painel direito", hand: "Arraste para mover a área de trabalho", zoom: "Clique para ampliar · Alt + clique para reduzir" }[state.tool] || "Selecione um objeto"}</span></div>`;
}
export function sceneInspector(state) {
  const entry = flattenScene(state.scene).find((e) => e.node.id === state.selected);
  if (!entry)
    return '<div class="panel-heading">Propriedades</div><p class="micro scene-padding">Selecione uma camada para editar.</p>';
  const { node, locked } = entry;
  return `<div class="panel-heading">${esc(node.name)}</div>${pathInspector(state)}<section><div class="scene-flags"><button data-scene-visible>${node.visible ? "Ocultar" : "Mostrar"}</button><button data-scene-lock>${node.locked ? "Desbloquear" : "Bloquear"}</button></div><div class="scene-tools">${[
    ["duplicate", "Duplicar"],
    ["delete", "Excluir"],
    ["front", "Trazer à frente"],
    ["back", "Enviar ao fundo"],
  ]
    .map(
      ([op, label]) =>
        `<button data-scene-operation="${op}" ${locked ? "disabled" : ""}>${label}</button>`,
    )
    .join(
      "",
    )}</div><h3>APARÊNCIA</h3><label class="scene-field">Preenchimento<input data-scene-paint="fill" value="${esc(node.attrs.fill ?? "")}" placeholder="Herdado · #hex ou none" ${locked ? "disabled" : ""}></label><label class="scene-field">Contorno<input data-scene-paint="stroke" value="${esc(node.attrs.stroke ?? "")}" placeholder="Herdado · #hex ou none" ${locked ? "disabled" : ""}></label><label class="scene-field">Espessura<input type="number" min="0" max="10000" step="0.5" data-scene-stroke value="${esc(node.attrs["stroke-width"] ?? "1")}" ${locked ? "disabled" : ""}></label>${node.tag === "text" ? `<label class="scene-field">Texto<input data-scene-text maxlength="10000" value="${esc(node.text ?? "")}" ${locked ? "disabled" : ""}></label><label class="scene-field">Tamanho<input type="number" min="1" max="10000" data-scene-font value="${esc(node.attrs["font-size"] ?? "16")}" ${locked ? "disabled" : ""}></label>` : ""}<h3>TRANSFORMAÇÃO DO OBJETO</h3><div class="property-grid">${Object.entries(
    node.transform,
  )
    .map(
      ([k, v]) =>
        `<label class="property">${k}<input data-scene-transform="${k}" aria-label="Objeto ${k}" type="number" step="${k === "sx" || k === "sy" ? ".05" : "1"}" value="${v}" ${locked ? "disabled" : ""}></label>`,
    )
    .join(
      "",
    )}</div><p class="micro">Valores adicionais à transformação original do SVG. Rotação em torno da origem local. ${locked ? "Camada ou grupo pai bloqueado." : ""}</p></section>`;
}
export function bindScene(state, { render, commit, notify }) {
  const change = (operation, value) => {
    try {
      state.selected = editScene(state.scene, state.selected, operation, value);
      commit();
      render();
    } catch (error) {
      notify(error.message);
      render();
    }
  };
  document.querySelectorAll("[data-scene-add]").forEach((el) => {
    el.onclick = () => change("add", el.dataset.sceneAdd);
  });
  document.querySelectorAll("[data-scene-operation]").forEach((el) => {
    el.onclick = () => change(el.dataset.sceneOperation);
  });
  document.querySelectorAll("[data-scene-paint]").forEach((el) => {
    el.onchange = () => {
      const value = el.value.trim();
      if (!/^(#[0-9a-f]{3}|#[0-9a-f]{6}|none)$/i.test(value)) {
        notify("Use uma cor hexadecimal (#4fe3c1) ou none para remover a pintura.");
        render();
        return;
      }
      change("attrs", { [el.dataset.scenePaint]: value });
    };
  });
  for (const [selector, key, min] of [
    ["[data-scene-stroke]", "stroke-width", 0],
    ["[data-scene-font]", "font-size", 1],
  ]) {
    const el = document.querySelector(selector);
    if (el)
      el.onchange = () => {
        const value = Number(el.value);
        if (!el.value.trim() || !Number.isFinite(value) || value < min || value > 10000) {
          notify("Informe um tamanho válido.");
          render();
          return;
        }
        change("attrs", { [key]: String(value) });
      };
  }
  const text = document.querySelector("[data-scene-text]");
  if (text) text.onchange = () => change("text", text.value);
  bindLayerRenaming(state, { render, commit, notify });
  bindCanvasTools(state, { render, commit, notify });
  bindPathInspector(state, { render, commit, notify });
  const shape = document.querySelector("[data-shape]");
  if (shape)
    shape.onchange = () => {
      state.shape = shape.value;
    };
  const entry = () => flattenScene(state.scene).find((e) => e.node.id === state.selected);
  document.querySelectorAll("[data-scene-transform]").forEach((el) => {
    el.onchange = () => {
      const item = entry();
      if (!item || item.locked) return;
      try {
        if (!el.value.trim()) throw new Error("Informe um número.");
        Object.assign(
          item.node.transform,
          validateTransform({ [el.dataset.sceneTransform]: Number(el.value) }),
        );
        commit();
        render();
      } catch (error) {
        el.value = item.node.transform[el.dataset.sceneTransform];
        notify(error.message);
      }
    };
  });

  const visible = document.querySelector("[data-scene-visible]");
  if (visible)
    visible.onclick = () => {
      const item = entry();
      if (item.locked) {
        notify("Desbloqueie a camada e seus grupos antes de alterar.");
        return;
      }
      item.node.visible = !item.node.visible;
      commit();
      render();
    };
  const lock = document.querySelector("[data-scene-lock]");
  if (lock)
    lock.onclick = () => {
      const item = entry();
      item.node.locked = !item.node.locked;
      commit();
      render();
    };
}
