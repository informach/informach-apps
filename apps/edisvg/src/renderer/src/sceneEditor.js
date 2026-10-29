import { objectTransformPatchSchema } from "@informach/edi-motion";
import { animations } from "../../shared/animation.js";
import { renderEditorComposition } from "../../shared/components";
import { PATH_TAGS } from "../../shared/pathGeometry.js";
import { editScene, flattenScene, renderScene, xmlEscape } from "../../shared/scene.js";
import { bindCanvasTools } from "./canvasTools.js";
import { objectPose } from "./clipEditor.js";
import { formatInput, roundTypedInput } from "./form-values.ts";
import { bindPathInspector, pathInspector } from "./pathEditor.js";
import { chooseObject, selectionIds } from "./selection.ts";

const esc = xmlEscape;

export function bindLayerRenaming(state, { render, commit, notify, changeScene }) {
  const begin = (id) => {
    const entry = flattenScene(state.scene).find((item) => item.node.id === id);
    if (!entry) return;
    chooseObject(state, id);
    if (entry.locked) {
      notify("Desbloqueie o objeto e seus grupos para renomear.");
      render();
      return;
    }
    state.renaming = id;
    render();
  };
  document.querySelectorAll("[data-scene-select]").forEach((row) => {
    row.onclick = (event) => {
      chooseObject(
        state,
        row.dataset.sceneSelect,
        Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey),
      );
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
        row.onclick(event);
      }
    };
  });
  document.querySelectorAll("[data-layer-name]").forEach((label) => {
    label.onclick = (event) => {
      event.stopPropagation();
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        chooseObject(state, label.dataset.layerName, true);
        state.renaming = null;
        render();
        return;
      }
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
          if (changeScene) changeScene("rename", name, id);
          else {
            editScene(state.scene, id, "rename", name);
            commit();
          }
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
  if (state.sidebarTab === "assets")
    return `<aside class="sidebar"><div class="tabs"><button class="tab" data-action="hierarchy">Hierarquia</button><button class="tab" data-action="artboards">Artboards</button><button class="tab selected" data-action="assets">Recursos</button></div><div data-asset-panel></div></aside>`;
  if (state.sidebarTab === "artboards")
    return `<aside class="sidebar"><div class="tabs"><button class="tab" data-action="hierarchy">Hierarquia</button><button class="tab selected" data-action="artboards">Artboards</button><button class="tab" data-action="assets">Recursos</button></div><div data-artboard-panel></div></aside>`;
  const selected = new Set(selectionIds(state));
  const layers = flattenScene(state.scene)
    .map(
      ({ node, depth, locked }) =>
        `<div role="button" tabindex="0" data-scene-select="${node.id}" aria-pressed="${selected.has(node.id)}" class="layer ${selected.has(node.id) ? "selected" : ""}" style="--depth:${depth}"><span class="layer-icon">${node.tag === "g" ? "▱" : "◇"}</span><span class="layer-name" data-layer-name="${node.id}" title="Clique para renomear">${state.renaming === node.id ? `<input data-layer-rename="${node.id}" aria-label="Nome do objeto" maxlength="120" value="${esc(node.name)}">` : esc(node.name)}</span><small>${!node.visible ? "oculto" : locked ? "bloqueado" : node.tag === "path" ? "caminho" : node.tag}</small></div>`,
    )
    .join("");
  const clips = state.motion.animations
    .map(
      (clip) =>
        `<button data-clip="${clip.id}" class="animation-row ${state.activeClipId === clip.id ? "selected" : ""}"><span>▷</span><strong>${esc(clip.name)}</strong><small>${(clip.frames / clip.fps).toFixed(2)}s · ${clip.fps} FPS</small></button>`,
    )
    .join("");
  const rows = Object.entries(animations)
    .map(
      ([name, animation]) =>
        `<button data-animation="${name}" class="animation-row ${!state.activeClipId && state.animation === name ? "selected" : ""}"><span>▷</span><strong>${name}</strong><small>${(animation.frames / 60).toFixed(1)}s · ${animation.mode}</small></button>`,
    )
    .join("");
  return `<aside class="sidebar"><div class="tabs"><button class="tab selected" data-action="hierarchy">Hierarquia</button><button class="tab" data-action="artboards">Artboards</button><button class="tab" data-action="assets">Recursos</button></div><div class="scene-tree-heading">${esc(state.name)}<small>${state.scene.viewBox[2]} × ${state.scene.viewBox[3]}</small></div><div class="tree">${layers || '<p class="micro scene-padding">Projeto vazio. Desenhe com a barra de ferramentas ou importe um SVG.</p>'}</div><section class="animations"><h3>ANIMAÇÕES POR OBJETO</h3>${clips}<button data-action="clip-new">+ Nova animação</button><h3>PRESETS GLOBAIS · LEGADO</h3>${rows}<button data-action="import-svg">↥ Importar SVG</button></section></aside>`;
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
  }<button data-viewport-reset title="Centralizar área de trabalho">Centralizar</button><select id="zoom" aria-label="Zoom">${[25, 50, 75, 100, 125, 150, 200, 300].map((v) => `<option ${state.zoom === v ? "selected" : ""}>${v}%</option>`).join("")}</select><button data-action="import-svg">Importar SVG</button></div><div class="stage"><div class="artboard scene-artboard" style="--zoom:${state.zoom / 75};aspect-ratio:${state.scene.viewBox[2]}/${state.scene.viewBox[3]}"><div class="scene-artwork">${state.previewMarkup ?? (state.previewComposition ? renderEditorComposition(state.previewComposition) : renderScene(state.scene, { editor: true }))}</div></div><p data-preview-error role="alert" hidden></p><span class="canvas-hint">${state.pathEdit ? "Arraste os pontos e alças. Duplo clique no segmento adiciona um ponto." : { pen: "Clique para criar pontos; arraste para curvas. Enter conclui; Esc cancela.", select: "Arraste para mover · Esc para cancelar", shapes: "Arraste para desenhar · Shift para proporções iguais", text: "Clique para inserir texto e edite no painel direito", hand: "Arraste para mover a área de trabalho", zoom: "Clique para ampliar · Alt + clique para reduzir" }[state.tool] || "Selecione um objeto"}</span></div>`;
}
function scenePaintInspector(node) {
  if (node.tag === "image") return "<div data-image-panel></div>";
  return "<div data-appearance-panel></div>";
}
const openInspectorSections = new Set();
function inspectorDisclosure(id, label, content) {
  return `<details class="inspector-disclosure" data-inspector-section="${id}" ${openInspectorSections.has(id) ? "open" : ""}><summary>${label}</summary>${content}</details>`;
}
export function sceneInspector(state) {
  const entry = flattenScene(state.scene).find((e) => e.node.id === state.selected);
  if (!entry)
    return `<div data-artboard-inspector></div>${inspectorDisclosure("layout", "Layout avançado", "<div data-layout-panel></div>")}<div data-rig-panel></div>`;
  const { node, locked } = entry;
  const controls = `<div class="scene-tools"><button data-composition="group" ${locked ? "disabled" : ""}>Agrupar (${selectionIds(state).length})</button><button data-composition="ungroup" ${locked || node.tag !== "g" || node.instance ? "disabled" : ""}>Desagrupar</button></div><label class="scene-field">Grupo pai<select data-parent-group aria-label="Grupo pai" ${locked ? "disabled" : ""}><option value="" ${entry.parentId === null ? "selected" : ""}>Raiz</option>${flattenScene(
    state.scene,
  )
    .filter((item) => item.node.tag === "g" && item.node.id !== node.id)
    .map(
      (item) =>
        `<option value="${item.node.id}" ${item.node.id === entry.parentId ? "selected" : ""}>${esc(item.node.name)}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="scene-flags"><button data-scene-visible>${node.visible ? "Ocultar" : "Mostrar"}</button><button data-scene-lock>${node.locked ? "Desbloquear" : "Bloquear"}</button></div><div class="scene-tools">${[
    ["duplicate", "Duplicar"],
    ["delete", "Excluir"],
    ["front", "Trazer à frente"],
    ["back", "Enviar ao fundo"],
  ]
    .map(
      ([op, label]) =>
        `<button data-scene-operation="${op}" ${locked ? "disabled" : ""}>${label}</button>`,
    )
    .join("")}</div>`;
  const transform = `<section class="inspector-transform"><h3>TRANSFORMAÇÃO</h3><div class="property-grid">${Object.entries(
    {
      ...objectPose(state, node),
      px: objectPose(state, node).px ?? 0,
      py: objectPose(state, node).py ?? 0,
      skewX: objectPose(state, node).skewX ?? 0,
    },
  )
    .map(([k, v]) => {
      const label =
        {
          x: "X",
          y: "Y",
          rotation: "Rotação",
          sx: "Escala X",
          sy: "Escala Y",
          opacity: "Opacidade",
          px: "Origem X",
          py: "Origem Y",
          skewX: "Inclinação X",
        }[k] ?? k;
      return `<label class="property">${label}<input data-scene-transform="${k}" aria-label="Objeto ${label}" type="number" step="${k === "sx" || k === "sy" ? ".05" : "1"}" value="${formatInput(v)}" ${locked ? "disabled" : ""}></label>`;
    })
    .join(" ")}</div></section>`;
  return `<div class="panel-heading">${esc(node.name)}</div>${scenePaintInspector(node)}${PATH_TAGS.has(node.tag) && !node.instance ? "<div data-path-effects-panel></div>" : ""}${node.tag === "text" ? "<div data-text-panel></div>" : ""}${transform}${node.instance ? "<div data-instance-inspector></div>" : pathInspector(state)}${inspectorDisclosure("organize", "Organizar", controls)}${inspectorDisclosure("effects", "Efeitos", "<div data-effects-panel></div>")}${inspectorDisclosure("semantics", "Acessibilidade", "<div data-semantics-panel></div>")}${inspectorDisclosure("layout", "Layout", "<div data-layout-panel></div>")}<div data-rig-panel></div>${state.view === "animate" ? "<div data-draw-order-panel></div>" : ""}<div data-transform-actions></div><div data-vector-actions></div>`;
}
export function bindScene(
  state,
  {
    render,
    commit,
    notify,
    changeScene,
    changePath,
    changeTransform,
    changeTransforms,
    transact,
    previewChanged,
  },
) {
  const boundId = state.selected;
  document.querySelectorAll("[data-inspector-section]").forEach((section) => {
    section.ontoggle = () => {
      if (section.open) openInspectorSections.add(section.dataset.inspectorSection);
      else openInspectorSections.delete(section.dataset.inspectorSection);
    };
  });
  for (const element of document.querySelectorAll("[data-composition]"))
    element.onclick = () => {
      try {
        transact([
          {
            type: "composition",
            operation: element.dataset.composition,
            ...(element.dataset.composition === "group"
              ? { targetIds: selectionIds(state), name: "Grupo" }
              : { targetId: boundId }),
          },
        ]);
        render();
      } catch (error) {
        notify(error.message);
      }
    };
  const parentSelect = document.querySelector("[data-parent-group]");
  if (parentSelect)
    parentSelect.onchange = () => {
      try {
        const parentId = parentSelect.value || null;
        const parent = flattenScene(state.scene).find(({ node }) => node.id === parentId)?.node;
        transact([
          {
            type: "composition",
            operation: "reparent",
            targetId: boundId,
            parentId,
            index: parent ? parent.children.length : state.scene.nodes.length,
          },
        ]);
        render();
      } catch (error) {
        notify(error.message);
        render();
      }
    };
  const change = (operation, value) => {
    try {
      if (changeScene) changeScene(operation, value, boundId);
      else {
        state.selected = editScene(state.scene, state.selected, operation, value);
        commit();
      }
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
  for (const [selector, key, min] of [["[data-scene-font]", "font-size", 1]]) {
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
  bindLayerRenaming(state, { render, commit, notify, changeScene });
  bindCanvasTools(state, {
    render,
    commit,
    notify,
    changeTransform,
    changeTransforms,
    changeScene,
    changePath,
    transact,
    previewChanged,
  });
  bindPathInspector(state, { render, commit, notify, changeScene, changePath });
  const shape = document.querySelector("[data-shape]");
  if (shape)
    shape.onchange = () => {
      state.shape = shape.value;
    };
  const entry = () => flattenScene(state.scene).find((e) => e.node.id === boundId);
  document.querySelectorAll("[data-scene-transform]").forEach((el) => {
    el.onchange = () => {
      const item = entry();
      if (!item || item.locked) return;
      try {
        if (!el.value.trim()) throw new Error("Informe um número.");
        const values = objectTransformPatchSchema.parse({
          [el.dataset.sceneTransform]: roundTypedInput(Number(el.value)),
        });
        if (changeTransform) changeTransform(values, item.node.id);
        else {
          Object.assign(item.node.transform, values);
          commit();
        }
        render();
      } catch (error) {
        el.value = formatInput(item.node.transform[el.dataset.sceneTransform] ?? 0);
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
      change("visibility", !item.node.visible);
    };
  const lock = document.querySelector("[data-scene-lock]");
  if (lock)
    lock.onclick = () => {
      const item = entry();
      change("lock", !item.node.locked);
    };
}
