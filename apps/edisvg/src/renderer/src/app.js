import packageInfo from "../../../package.json";
import { startPathEditing, synchronizePathEditing } from "./pathEditor.js";
import "./pathEditor.css";
import {
  applyArtboardView,
  bindCanvasTools,
  bindViewport,
  disposeCanvasTools,
} from "./canvasTools.js";
import {
  activateTool,
  bindToolbar,
  TOOLS,
  toolAvailability,
  toolbar,
  toolShortcut,
} from "./toolbar.js";
import "./toolbar.css";
import { flattenScene } from "../../shared/scene.js";
import { bindScene, sceneCanvas, sceneInspector, sceneSidebar } from "./sceneEditor.js";
import { importSvg } from "./svgImport.js";
import "./sceneEditor.css";
import "./resourceControls.css";
import "./paint-controls.css";
import {
  drawOrderScopes,
  emptyMotion,
  evaluatePlaybackFrame,
  evaluatePlaybackStaticFrame,
  frameAtSeconds,
  transformAttribute,
} from "@informach/edi-motion";
import { geometryPath } from "@informach/edi-motion/geometry";
import {
  evaluateVectorEffects,
  paintLayerCopies,
  paintLayerPaths,
  writeShapePath,
} from "@informach/edi-motion/graphics";
import {
  createDrawOrderBinding,
  createImageMeshBinding,
  createVectorEffectBinding,
  renderedImageMesh,
} from "@informach/edi-motion/graphics/dom";
import { rigParameterKey } from "@informach/edi-motion/rig";
import { inspectAppearance, inspectAppearanceValue } from "../../shared/appearanceInspection";
import { inspectAssetNotice, inspectAssets } from "../../shared/assetInspection";
import { inspectAudio, inspectAudioValue } from "../../shared/audioInspection";
import { inspectBehavior, inspectBehaviorValue } from "../../shared/behaviorInspection";
import { executeDocumentTransaction } from "../../shared/documentCommands.ts";
import { inspectFontCoverage } from "../../shared/fontInspection";
import { createHistory } from "../../shared/history.js";
import { compileInteractiveArtboard } from "../../shared/interactive";
import {
  hasInteractiveFeatures,
  requiresInteractiveExport,
} from "../../shared/interactiveCapabilities";
import { inspectLayout, inspectLayoutValue } from "../../shared/layoutInspection";
import {
  contentSnapshot,
  newProject,
  parseProject,
  snapshot,
  validateTransform,
} from "../../shared/project.js";
import { inspectRig, inspectRigValue } from "../../shared/rigInspection";
import { mountAppearancePanel } from "./appearance-panel";
import { mountArtboardInspector } from "./artboard-inspector.tsx";
import { mountArtboardPanel } from "./artboard-panel.tsx";
import { bindActiveArtboard, replaceActiveScene } from "./artboardWorkspace.ts";
import { mountAssetPanel } from "./asset-panel";
import { setupAssistant } from "./assistant.js";
import { mountBehaviorTest } from "./behavior/test-panel";
import { mountBehaviorWorkbench } from "./behavior/workbench";
import { activeClip, clipTimeline, objectPose, openClipDialog } from "./clipEditor.js";
import { mountCommandPalette } from "./command-palette";
import { editorCommands } from "./commandCatalog";
import { inspectComponent, inspectOverrideValue } from "./componentInspection.ts";
import { createCompositionPreview } from "./compositionPreview";
import { runDocumentTask } from "./documentTaskRunner";
import { mountDrawOrderPanel } from "./draw-order-panel";
import { createGestureEffectPreview } from "./effectGesturePreview";
import { mountEffectsPanel } from "./effects-panel";
import { createFontCatalogOwner } from "./fontCatalog";
import { formatInput } from "./form-values";
import { mountImagePanel } from "./image-panel";
import { mountInstanceInspector } from "./instance-inspector.tsx";
import {
  bindKeyEditing,
  disposeKeyGesture,
  openKeyDialog,
  openRetimeDialog,
  selectedKeyIds,
  selectedKeyReferences,
} from "./keyEditor.js";
import { mountLayoutPanel } from "./layout-panel";
import { mountLayoutPreview } from "./layout-preview";
import { paintOnionSkin } from "./onionSkin";
import { bindPanelResize } from "./panelResize";
import { mountPathActions } from "./path-actions";
import { mountRigOverlay } from "./rig/rig-overlay";
import { mountRigPanel } from "./rig/rig-panel";
import { mountSkinOverlay } from "./rig/skin-overlay";
import { bindRulers, boardGuides, disposeRulers } from "./rulers.ts";
import { chooseObject, selectionIds } from "./selection.ts";
import { mountSemanticsPanel } from "./semantics-panel";
import { bindSvgIngress, readSvgFile } from "./svg-import-input";
import { mountSvgImport } from "./svg-import-panel";
import { mountTextPanel } from "./text-panel";
import { mountTimelinePanel } from "./timeline-panel";
import { activeTimelineClip } from "./timelineState";
import { mountTransformActions } from "./transform-actions";
import { paintDesignTrims } from "./trim-preview";
import { mountVectorActions } from "./vector-actions";
import {
  defaultArtboardView,
  encodeWorkspace,
  parseWorkspace,
  resolvePreviewRange,
} from "./workspace.ts";
import "./assistant.css";
import { animations, poseAt, transition } from "../../shared/animation.js";
import { RASTER_FORMATS } from "../../shared/raster/profile";
import { exportProject } from "./export.js";
import { createLottieExportControls } from "./lottie-export-panel";
import { runLottieTask } from "./lottieTaskRunner";
import { createRasterExportControls } from "./raster-export-panel";

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
  artboardViews: {},
  view: "animate",
  animation: "Acenar",
  frame: 18,
  playing: false,
  selected: "Braço Direito",
  bones: true,
  clean: false,
  zoom: 75,
  auto: false,
  curve: false,
  easing: "Suave",
  machine: "Parado",
  waving: false,
  humor: 0.6,
  name: "Zezé",
  transforms: { x: 0, y: 0, rotation: 0, opacity: 100, sx: 1, sy: 1 },
  keys: [0, 18, 36, 54, 72],
  activeClipId: null,
  selectedKey: null,
  sessionId: crypto.randomUUID(),
  revision: 0,
};
state.keysByAnimation = { Parado: [], Acenar: [], Pular: [] };
state.modes = Object.fromEntries(Object.entries(animations).map(([name, a]) => [name, a.mode]));
let localSaveStatus = "Cópia local pronta";
let workspaceWarning = "";
let reportedWorkspaceWarning = "";
let fileStatus = { name: "Sem arquivo", path: null, dirty: true };
applyProject(newProject());
const projectHistory = createHistory(contentSnapshot(snapshot(state)));
const compositionPreview = createCompositionPreview();
function currentAnimation() {
  return activeClip(state) ?? { ...animations[state.animation], fps: 60 };
}
function transact(commands, request) {
  const result = executeDocumentTransaction(
    { project: snapshot(state), sessionId: state.sessionId, revision: state.revision },
    request ?? {
      projectId: state.id,
      sessionId: state.sessionId,
      revision: state.revision,
      artboardId: state.activeArtboardId,
      commands,
    },
  );
  return acceptDocumentResult(result);
}
function acceptDocumentResult(result) {
  if (!result.changed) return result;
  Object.assign(state, result.project);
  bindActiveArtboard(state, result.selectedArtboard ?? state.activeArtboardId);
  const existingIds = new Set(flattenScene(state.scene).map(({ node }) => node.id));
  if (result.selected !== undefined)
    state.selected = result.selected && existingIds.has(result.selected) ? result.selected : null;
  state.selectedIds =
    result.selectedIds !== undefined
      ? result.selectedIds.filter((id) => existingIds.has(id))
      : result.selected !== undefined
        ? state.selected
          ? [state.selected]
          : []
        : selectionIds(state).filter((id) => existingIds.has(id));
  if (!activeClip(state)) state.activeClipId = null;
  if (
    state.selectedKey &&
    activeTimelineClip(state)?.keyIndex.get(state.selectedKey.keyId)?.track.id !==
      state.selectedKey.trackId
  )
    state.selectedKey = null;
  if (!state.selectedKey) state.selectedKeys = [];
  save();
  return result;
}
async function transactHeavy(commands, request, signal) {
  const context = {
    project: snapshot(state),
    sessionId: state.sessionId,
    revision: state.revision,
  };
  const input = request ?? {
    projectId: state.id,
    sessionId: state.sessionId,
    revision: state.revision,
    artboardId: state.activeArtboardId,
    commands,
  };
  const result = await runDocumentTask(context, input, signal);
  if (
    state.id !== context.project.id ||
    state.sessionId !== context.sessionId ||
    state.revision !== context.revision
  )
    throw new Error("O projeto mudou durante o cálculo; nenhuma alteração foi aplicada.");
  if (
    result.project.id !== context.project.id ||
    result.revision !== context.revision + (result.changed ? 1 : 0)
  )
    throw new Error("Resposta de cálculo incompatível com a sessão.");
  return acceptDocumentResult(result);
}
/** Records the edited path as a vertex key of the open animation at the current frame. */
function setVertexKey(targetId, geometry) {
  const animationId = state.pathEdit?.animationId;
  if (!animationId) throw new Error("Abra uma animação para gravar chaves de vértices.");
  transact([
    {
      type: "vertex-keys",
      command: {
        operation: "set",
        animationId,
        targetId,
        frame: Math.round(state.frame),
        geometry,
      },
    },
  ]);
}
function changeScene(operation, value, targetId = state.selected) {
  if (
    ["delete", "duplicate", "front", "back"].includes(operation) &&
    targetId === state.selected &&
    selectionIds(state).length > 1
  )
    return transact([{ type: "scene-batch", operation, targetIds: selectionIds(state) }]);
  transact([
    {
      type: "scene",
      targetId: operation === "add" ? null : targetId,
      operation,
      ...(value === undefined ? {} : { value }),
    },
  ]);
}
function keyCommands(values, targetId = state.selected) {
  const clip = activeClip(state);
  if (!clip || !targetId) throw new Error("Selecione uma animação e um objeto.");
  return Object.entries(values).map(([property, value]) => ({
    type: "motion",
    command: {
      type: "set-key",
      animationId: clip.id,
      targetId,
      property,
      frame: Math.round(state.frame),
      value,
    },
  }));
}
function changeObjectTransforms(values, targetId = state.selected) {
  changeObjectTransformsBatch([{ targetId, transform: values }]);
}
function changeObjectTransformsBatch(updates) {
  const clip = state.view === "animate" ? activeClip(state) : null;
  if (clip)
    transact([
      {
        type: "motion",
        command: {
          type: "set-poses",
          animationId: clip.id,
          frame: Math.round(state.frame),
          createKeys: state.auto,
          poses: updates,
        },
      },
    ]);
  else transact([{ type: "scene-transforms", updates }]);
}
let started = 0,
  offset = 0,
  toastTimer;
let scheduledFrame = null;
let sceneElements = new Map();
let sceneBases = new Map();
let sceneDisplays = new Map();
let disposeArtboardPanel;
let disposeArtboardInspector;
let disposeExportPanel;
let disposeAssetPanel;
let disposeInstanceInspector;
let disposeTimelinePanel;
let disposeTransformActions;
let disposePathActions;
let disposeSvgImport;
let disposePalette;
let disposePanelResize;
let disposeVectorActions;
let disposeAppearancePanel;
let disposeTextPanel;
let disposeImagePanel;
let disposeEffectsPanel;
let disposeSemanticsPanel;
let effectPreview;
let drawOrderPreview;
let drawOrderPanel;
let meshPreviews = new Map();
let gestureEffects;
let effectPreviewFrame;
let disposeBehaviorWorkbench;
let disposeBehaviorTest;
let disposeLayoutPanel;
let disposeLayoutPreview;
let disposeRigPanel;
let disposeJoystickPreview;
let joystickPreview;
let rigOverlay;
let skinOverlay;
const fontCatalog = createFontCatalogOwner(() => render());
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) fontCatalog.destroy();
});
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
  document.body.classList.toggle("edisvg-design-mode", Boolean(state.scene && state.view === "design"));
  disposeJoystickPreview?.();
  disposeJoystickPreview = null;
  disposeExportPanel?.();
  disposeExportPanel = null;
  const fontStatus = fontCatalog.synchronize(state.assets, state.sessionId);
  disposeCanvasTools();
  effectPreview?.destroy();
  effectPreview = null;
  drawOrderPreview?.destroy();
  drawOrderPreview = null;
  gestureEffects = null;
  effectPreviewFrame = undefined;
  disposeLayoutPreview?.destroy();
  disposeLayoutPreview = null;
  disposeRigPanel?.();
  disposeRigPanel = null;
  rigOverlay?.destroy();
  rigOverlay = null;
  skinOverlay?.destroy();
  skinOverlay = null;
  disposeLayoutPanel?.();
  disposeLayoutPanel = null;
  const current = activeClip(state);
  if (
    state.workRange &&
    (!current || state.workRange.clipId !== current.id || state.workRange.end > current.frames)
  )
    state.workRange = null;
  const preview = compositionPreview(
    { sessionId: state.sessionId, revision: state.revision, artboardId: state.activeArtboardId },
    () => snapshot(state),
  );
  state.previewComposition = preview?.compiled ?? null;
  state.previewMarkup = preview?.markup ?? null;
  state.previewPlaybackContext = preview?.playbackContext ?? null;
  state.previewEffectContext = preview?.effectContext ?? null;
  try {
    localStorage.setItem("edisvg-workspace", encodeWorkspace(state.id, state));
  } catch {
    workspaceWarning =
      "Não foi possível gravar preferências da área de trabalho. O projeto continua editável; salve seu conteúdo em arquivo.";
  }
  disposeArtboardPanel?.();
  disposeArtboardInspector?.();
  disposeArtboardInspector = null;
  disposeAssetPanel?.();
  disposeAssetPanel = null;
  disposeTransformActions?.();
  disposePathActions?.();
  disposeSvgImport?.();
  disposePalette?.();
  disposePalette = null;
  disposePanelResize?.();
  disposePanelResize = null;
  disposeVectorActions?.();
  disposeVectorActions = null;
  disposeAppearancePanel?.();
  disposeAppearancePanel = null;
  disposeTextPanel?.();
  disposeTextPanel = null;
  disposeImagePanel?.();
  disposeImagePanel = null;
  disposeEffectsPanel?.();
  disposeEffectsPanel = null;
  disposeSemanticsPanel?.();
  drawOrderPanel?.dispose();
  drawOrderPanel = null;
  disposeSemanticsPanel = null;
  disposeBehaviorWorkbench?.();
  disposeBehaviorWorkbench = null;
  disposeBehaviorTest?.();
  disposeBehaviorTest = null;
  disposeSvgImport = null;
  disposePathActions = null;
  disposeTransformActions = null;
  disposeInstanceInspector?.();
  disposeInstanceInspector = null;
  disposeArtboardPanel = null;
  disposeKeyGesture();
  disposeTimelinePanel?.();
  disposeTimelinePanel = null;
  disposeCanvasTools();
  disposeRulers();
  synchronizePathEditing(state);
  const authoredMachine = Boolean(state.scene && state.view === "machine");
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark">⌁</span>EdiSVG <small class="app-version">${packageInfo.version}</small></div><nav class="menus">${button("file", "Arquivo")}${button("undo", "↶ Desfazer")}${button("redo", "↷ Refazer")}${button("object", "Objeto")}${button("animation", "Animação")}${button("view", "Exibir")}${button("help", "Ajuda")}</nav><div class="modes">${button("design", "◇ Design", state.view === "design" ? "active" : "")}${button("animate", "◷ Animar", state.view === "animate" ? "active" : "")}${state.scene ? button("machine", "◈ Estados", authoredMachine ? "active" : "") : ""}</div><span class="project">${state.scene ? "Projeto" : "Mascote"} ${escapeHtml(state.name)} <span title="${escapeHtml(fileStatus.path || "Projeto ainda sem arquivo")}">/ ${escapeHtml(fileStatus.name)}${fileStatus.dirty ? " •" : ""}</span><i class="saved" title="${escapeHtml(localSaveStatus)}"></i></span><div class="top-actions">${button("test", "▷ <span>Testar</span>")}${button("assistant", "✧ <span>Assistente</span>")}${button("export", "↗ Exportar", "primary")}</div></header><main class="workspace ${state.view === "machine" ? "machine-workspace" : ""}">${toolbar(state)}${authoredMachine ? '<aside class="sidebar" data-behavior-sidebar></aside>' : state.scene ? sceneSidebar(state) : state.view === "machine" ? machineSidebar() : hierarchy()}<section class="center">${authoredMachine ? '<div data-behavior-canvas style="height:100%"></div>' : state.scene ? sceneCanvas(state) : state.view === "machine" ? machineCanvas() : canvas()}</section><aside class="inspector">${authoredMachine ? "<div data-behavior-inspector></div>" : state.scene ? sceneInspector(state) : state.view === "machine" ? machineInspector() : inspector()}</aside></main>${authoredMachine ? '<footer class="statusbar"><span class="live-dot"></span> Lógica editável da prancheta <span class="push">Estados · Dados · Eventos</span></footer>' : state.view === "machine" ? '<footer class="statusbar"><span class="live-dot"></span> Máquina de estados · Interação <span class="push">3 estados · 4 listeners</span></footer>' : timeline()}<dialog id="export-dialog"></dialog><dialog id="help-dialog"></dialog><dialog id="clip-dialog"></dialog>`;
  bind();
  for (const action of ["test", "export"]) {
    const control = document.querySelector(`[data-action="${action}"]`);
    if (control) control.disabled = !fontStatus.ready;
  }
  if (!fontStatus.ready) {
    const artwork = document.querySelector(".scene-artwork"),
      message = document.createElement("p");
    if (artwork) artwork.style.visibility = "hidden";
    message.setAttribute("role", fontStatus.error ? "alert" : "status");
    message.textContent = fontStatus.error
      ? `Fonte indisponível: ${fontStatus.error} Remova ou substitua o recurso; o documento foi preservado.`
      : "Carregando fontes incorporadas…";
    document.querySelector(".stage")?.append(message);
  }
  if (authoredMachine) {
    const host = document.querySelector("[data-behavior-canvas]"),
      sidebar = document.querySelector("[data-behavior-sidebar]"),
      inspector = document.querySelector("[data-behavior-inspector]"),
      board = state.artboards.find((board) => board.id === state.activeArtboardId);
    if (host && sidebar && inspector && board)
      disposeBehaviorWorkbench = mountBehaviorWorkbench(host, {
        rig: board.rig,
        behavior: board.behavior,
        clips: state.motion.animations,
        objects: flattenScene(board.scene).map(({ node }) => ({
          id: node.id,
          name: node.name,
          tag: node.tag,
        })),
        sidebar,
        inspector,
        focus: state.behaviorFocus?.artboardId === board.id ? state.behaviorFocus : undefined,
        focusChanged(value) {
          state.behaviorFocus = { ...value, artboardId: board.id };
          try {
            localStorage.setItem("edisvg-workspace", encodeWorkspace(state.id, state));
          } catch {
            notify(
              "Não foi possível gravar a navegação do grafo. O documento continua preservado.",
            );
          }
        },
        execute(value) {
          transact([{ type: "behavior", operation: "replace", value }]);
          render();
        },
        test: openBehaviorTest,
      });
  }
  const artboardPanel = document.querySelector("[data-artboard-panel]");
  const assetPanel = document.querySelector("[data-asset-panel]");
  if (assetPanel)
    disposeAssetPanel = mountAssetPanel(assetPanel, {
      board: state.artboards.find((board) => board.id === state.activeArtboardId),
      assets: state.assets,
      selectedTextId: flattenScene(state.scene).find(
        ({ node }) => node.id === state.selected && node.tag === "text",
      )?.node.id,
      importNative: window.desktop ? () => window.desktop.importAsset() : undefined,
      execute(commands) {
        transact(commands);
        render();
      },
    });
  if (artboardPanel)
    disposeArtboardPanel = mountArtboardPanel(artboardPanel, {
      boards: state.artboards,
      activeId: state.activeArtboardId,
      defaultId: state.defaultArtboardId,
      clips: state.motion.animations.map(({ id, name }) => ({ id, name })),
      select: selectArtboard,
      execute(command) {
        transact([command]);
        if (command.type === "component") state.sidebarTab = "hierarchy";
        render();
      },
      report: notify,
    });
  const artboardInspectorHost = document.querySelector("[data-artboard-inspector]");
  const activeInspectorBoard = state.artboards.find((board) => board.id === state.activeArtboardId);
  if (artboardInspectorHost && activeInspectorBoard)
    disposeArtboardInspector = mountArtboardInspector(artboardInspectorHost, {
      board: activeInspectorBoard,
      view: state.artboardViews?.[activeInspectorBoard.id] ?? defaultArtboardView(),
      updateView(patch, preview) {
        state.artboardViews ??= {};
        state.artboardViews[activeInspectorBoard.id] = {
          ...(state.artboardViews[activeInspectorBoard.id] ?? defaultArtboardView()),
          ...patch,
        };
        // A scrub preview only moves the frame; the release renders and persists once.
        if (preview) applyArtboardView(state);
        else render();
      },
      execute(command) {
        transact([command]);
        render();
      },
    });
  const instanceHost = document.querySelector("[data-instance-inspector]");
  const layoutHost = document.querySelector("[data-layout-panel]"),
    layoutBoard = state.artboards.find((board) => board.id === state.activeArtboardId);
  if (layoutHost && layoutBoard)
    disposeLayoutPanel = mountLayoutPanel(layoutHost, {
      board: layoutBoard,
      selectedId: state.selected,
      execute(command) {
        transact([command]);
        render();
      },
      test: () => openBehaviorTest(),
    });
  const instanceEntry = flattenScene(state.scene).find(({ node }) => node.id === state.selected);
  const rigHost = document.querySelector("[data-rig-panel]");
  if (rigHost && layoutBoard) {
    const previewIdentity = [state.sessionId, state.revision, state.activeArtboardId];
    let baseline;
    let disposed = false;
    const currentPreview = () =>
      previewIdentity[0] === state.sessionId &&
      previewIdentity[1] === state.revision &&
      previewIdentity[2] === state.activeArtboardId;
    const restore = () => {
      joystickPreview = undefined;
      if (baseline && currentPreview()) {
        for (const [element, attributes] of baseline)
          for (const [name, value] of attributes)
            if (value === null) element.removeAttribute(name);
            else element.setAttribute(name, value);
        effectPreviewFrame = undefined;
        skinOverlay?.refresh();
        if (state.view === "animate") updatePose();
        else if (state.previewEffectContext)
          effectPreview?.paint(evaluateVectorEffects(state.previewEffectContext, new Map()));
        rigOverlay?.refresh();
      }
      baseline = undefined;
    };
    disposeJoystickPreview = () => {
      restore();
      disposed = true;
    };
    disposeRigPanel = mountRigPanel(rigHost, {
      previewJoystick(value) {
        if (disposed) return;
        if (!currentPreview()) {
          restore();
          return;
        }
        if (!value) {
          restore();
          return;
        }
        if (!baseline) {
          baseline = [];
          for (const element of sceneElements.values()) {
            baseline.push([
              element,
              ["transform", "opacity", "display"].map((name) => [name, element.getAttribute(name)]),
            ]);
            if (element.firstElementChild?.localName === "path") {
              const shape = element.firstElementChild;
              for (const path of [shape, ...paintLayerCopies(shape)])
                baseline.push([path, [["d", path.getAttribute("d")]]]);
            }
          }
        }
        joystickPreview = new Map([
          [rigParameterKey([], value.id, "x"), value.x],
          [rigParameterKey([], value.id, "y"), value.y],
        ]);
        try {
          updatePose();
        } catch (error) {
          restore();
          throw error;
        }
      },
      selectVertex(index) {
        state.rigFocus = {
          ...state.rigFocus,
          artboardId: layoutBoard.id,
          open: true,
          skinVertex: index,
        };
        render();
      },
      animations: state.motion.animations,
      activeAnimationId: activeClip(state)?.id,
      frame: state.frame,
      board: layoutBoard,
      selectedId: state.selected,
      selectedIds: selectionIds(state),
      showBones: state.bones,
      showBonesChanged(value) {
        state.bones = value;
        render();
      },
      focus: state.rigFocus?.artboardId === layoutBoard.id ? state.rigFocus : undefined,
      focusChanged(value) {
        state.rigFocus = { ...state.rigFocus, ...value, artboardId: layoutBoard.id };
        try {
          localStorage.setItem("edisvg-workspace", encodeWorkspace(state.id, state));
        } catch {
          notify(
            "Não foi possível gravar a navegação do painel de rig; o projeto está preservado.",
          );
        }
      },
      execute(command, focus) {
        transact([command]);
        if (focus) state.rigFocus = { ...state.rigFocus, ...focus, artboardId: layoutBoard.id };
        render();
      },
      select(id) {
        chooseObject(state, id);
        render();
      },
      test: () => openBehaviorTest(),
    });
  }
  const instanceNode = instanceEntry?.node;
  const appearanceHost = document.querySelector("[data-appearance-panel]"),
    textHost = document.querySelector("[data-text-panel]"),
    imageHost = document.querySelector("[data-image-panel]"),
    effectsHost = document.querySelector("[data-effects-panel]"),
    semanticsHost = document.querySelector("[data-semantics-panel]");
  if (instanceNode && instanceEntry) {
    const props = {
      assets: state.assets,
      scene: state.scene,
      node: instanceNode,
      locked: instanceEntry.locked,
      execute(commands) {
        transact(commands);
        render();
      },
      // Path effects live in each paint row's options, as in Rive.
      effects:
        layoutBoard && !instanceNode.instance
          ? {
              rig: layoutBoard.rig,
              previewTrims(trims) {
                if (state.view !== "design") return;
                paintDesignTrims(
                  sceneElements.get(instanceNode.id),
                  instanceNode,
                  trims ??
                    (layoutBoard.rig?.trims ?? []).filter(
                      (item) => item.targetId === instanceNode.id,
                    ),
                );
              },
            }
          : undefined,
    };
    if (appearanceHost) disposeAppearancePanel = mountAppearancePanel(appearanceHost, props);
    if (textHost) disposeTextPanel = mountTextPanel(textHost, props);
    if (imageHost) disposeImagePanel = mountImagePanel(imageHost, props);
    if (effectsHost) disposeEffectsPanel = mountEffectsPanel(effectsHost, props);
    if (semanticsHost) disposeSemanticsPanel = mountSemanticsPanel(semanticsHost, props);
  }
  const drawOrderHost = document.querySelector("[data-draw-order-panel]"),
    orderClip = state.view === "animate" ? activeClip(state) : null;
  if (drawOrderHost && orderClip && instanceEntry)
    drawOrderPanel = mountDrawOrderPanel(drawOrderHost, {
      clip: orderClip,
      scene: state.scene,
      selectedId: instanceEntry.node.id,
      frame: state.frame,
      locked: instanceEntry.locked,
      execute(commands) {
        try {
          transact(commands);
        } catch (error) {
          notify(error instanceof Error ? error.message : "Ordem de desenho recusada.");
        }
        render();
      },
    });
  if (instanceHost && instanceNode?.instance)
    disposeInstanceInspector = mountInstanceInspector(instanceHost, {
      targetId: instanceNode.id,
      access: instanceEntry.locked ? "locked" : "editable",
      value: instanceNode.instance,
      boards: state.artboards.filter((board) => board.id !== state.activeArtboardId),
      clips: state.motion.animations.map(({ id, name }) => ({ id, name })),
      execute(command) {
        transact([command]);
        render();
      },
      report: notify,
    });
  const timelineView = activeTimelineClip(state);
  if (timelineView) {
    const host = document.querySelector("[data-timeline-panel]");
    if (host)
      disposeTimelinePanel = mountTimelinePanel(host, {
        clip: timelineView,
        state,
        seek,
        updatePose,
      });
    bindKeyEditing(state, { transact, render, notify, seek });
    for (const input of document.querySelectorAll("[data-work-range]"))
      input.onchange = () => {
        const start = Number(document.querySelector('[data-work-range="start"]').value),
          end = Number(document.querySelector('[data-work-range="end"]').value),
          clip = activeClip(state);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end > clip.frames ||
          start >= end
        ) {
          notify("Área de trabalho inválida: use início < fim dentro da duração.");
          render();
          return;
        }
        state.workRange = { clipId: clip.id, start, end };
        state.playing = false;
        render();
      };
  }
  sceneElements = new Map(
    [...document.querySelectorAll("[data-object],[data-edi-object]")].map((element) => [
      element.dataset.object ?? element.dataset.ediObject,
      element,
    ]),
  );
  sceneBases = new Map(
    flattenScene(state.previewComposition?.scene ?? state.scene).map(({ node }) => [
      node.id,
      node.transform,
    ]),
  );
  sceneDisplays = new Map(
    [...sceneElements].map(([id, element]) => [id, element.getAttribute("display")]),
  );
  if (state.view === "design" && !state.pathEdit) {
    const nodes = new Map(flattenScene(state.scene).map(({ node }) => [node.id, node]));
    const trims = layoutBoard?.rig?.trims ?? [];
    for (const id of new Set(trims.map((trim) => trim.targetId)))
      paintDesignTrims(
        sceneElements.get(id),
        nodes.get(id),
        trims.filter((trim) => trim.targetId === id),
      );
  }
  const stackedScopes = drawOrderScopes([
    ...(state.previewComposition?.playback.motion.animations ?? []),
    ...(state.previewComposition?.playback.drivers.map((driver) => driver.animation) ?? []),
  ]);
  if (stackedScopes.size) drawOrderPreview = createDrawOrderBinding(sceneElements, stackedScopes);
  // Meshed images follow their deformed grid; the rest vertices come from the compiled playback.
  meshPreviews = new Map();
  for (const object of state.previewComposition?.playback.objects ?? []) {
    const shape = sceneElements.get(object.id)?.firstElementChild,
      mesh = shape ? renderedImageMesh(shape) : undefined,
      asset = state.assets.find((item) => item.id === shape?.getAttribute("data-edi-image"));
    if (shape && mesh && object.geometry && asset?.kind === "image")
      meshPreviews.set(object.id, createImageMeshBinding(shape, mesh, asset, object.geometry));
  }
  bindToolbar();
  const rigSvg = document.querySelector(".scene-artwork>svg");
  if (rigSvg && state.previewEffectContext?.references.length)
    effectPreview = createVectorEffectBinding(
      rigSvg,
      sceneElements,
      evaluateVectorEffects(state.previewEffectContext, new Map()),
    );
  if (effectPreview) {
    const binding = effectPreview;
    gestureEffects = createGestureEffectPreview(
      state.previewEffectContext,
      sceneElements,
      binding.paint,
      () => effectPreviewFrame,
      () => disposeLayoutPreview?.transforms(),
    );
  }
  if (rigSvg && layoutBoard?.rig && state.bones && !state.clean)
    rigOverlay = mountRigOverlay(rigSvg, layoutBoard, state.selected, (id) => {
      chooseObject(state, id);
      render();
    });
  if (rigSvg && layoutBoard?.rig && state.bones && !state.clean)
    skinOverlay = mountSkinOverlay(
      rigSvg,
      layoutBoard,
      state.selected,
      state.rigFocus?.skinVertex ?? 0,
      (index) => {
        state.rigFocus = {
          ...state.rigFocus,
          artboardId: layoutBoard.id,
          open: true,
          skinVertex: index,
        };
        render();
      },
    );
  const workspace = document.querySelector(".workspace");
  if (workspace) disposePanelResize = bindPanelResize(workspace, state, render);
  bindViewport(state, { render });
  if (state.scene && state.view !== "machine")
    bindRulers(state, {
      execute(guides) {
        transact([{ type: "guides", guides }]);
        render();
      },
      notify,
    });
  updatePose();
  if (state.scene)
    bindScene(state, {
      render,
      commit: save,
      notify,
      changeScene,
      setVertexKey,
      changePath: (command) => transact([command]),
      changeTransform: changeObjectTransforms,
      changeTransforms: changeObjectTransformsBatch,
      previewChanged: () => gestureEffects?.(),
      transact,
    });
  const transformHost = document.querySelector("[data-transform-actions]"),
    transformSvg = document.querySelector(".scene-artwork>svg");
  if (transformSvg && layoutBoard && state.artboards.some((board) => board.layout))
    disposeLayoutPreview = mountLayoutPreview(
      transformSvg,
      snapshot(state),
      layoutBoard.id,
      () => {
        updatePose();
        bindCanvasTools(state, {
          transact,
          render,
          commit: save,
          notify,
          changeScene,
          setVertexKey,
          changePath: (command) => transact([command]),
          changeTransforms: changeObjectTransformsBatch,
          previewChanged: () => gestureEffects?.(),
        });
        if (transformHost) {
          disposeTransformActions?.();
          disposeTransformActions = mountTransformActions(transformHost, {
            svg: transformSvg,
            state,
            ids: selectionIds(state),
            execute: changeObjectTransformsBatch,
            render,
            report: notify,
          });
        }
      },
      notify,
    );
  if (transformHost && transformSvg)
    disposeTransformActions = mountTransformActions(transformHost, {
      svg: transformSvg,
      state,
      ids: selectionIds(state),
      execute: changeObjectTransformsBatch,
      render,
      report: notify,
    });
  const pathHost = document.querySelector("[data-path-actions]"),
    pathEntry = flattenScene(state.scene).find(({ node }) => node.id === state.pathEdit?.id);
  if (pathHost && pathEntry && state.pathEdit)
    disposePathActions = mountPathActions(pathHost, {
      targetId: pathEntry.node.id,
      pathData: pathEntry.node.attrs.d ?? "",
      vertices: state.pathEdit.vertices ?? [
        { contour: state.pathEdit.contour, index: state.pathEdit.index },
      ],
      locked: pathEntry.locked,
      report: notify,
      execute(command) {
        transact([command]);
        startPathEditing(
          state,
          { render, commit: save, notify, changeScene, setVertexKey },
          command.targetId,
        );
      },
    });
  const vectorHost = document.querySelector("[data-vector-actions]"),
    vectorIds = selectionIds(state),
    vectorEntries = vectorIds.map((id) =>
      flattenScene(state.scene).find((entry) => entry.node.id === id),
    );
  if (vectorHost)
    disposeVectorActions = mountVectorActions(vectorHost, {
      ids: vectorIds,
      firstName: vectorEntries[0]?.node.name ?? "primeiro objeto",
      available:
        state.view === "design" &&
        vectorIds.length >= 2 &&
        vectorIds.length <= 16 &&
        vectorEntries.every(
          (entry) =>
            entry &&
            !entry.locked &&
            entry.visible &&
            entry.node.tag !== "g" &&
            entry.node.tag !== "text",
        ),
      report: notify,
      async execute(command, signal) {
        await transactHeavy([command], undefined, signal);
        state.pathEdit = null;
        render();
        notify("Operação booleana aplicada como uma edição. Desfazer restaura a seleção original.");
      },
    });
  for (const el of document.querySelectorAll(
    '[data-action="auto"], [data-easing], [data-action="curves"]',
  )) {
    el.disabled = el.dataset.action !== "auto" || !activeClip(state);
    el.title = el.disabled
      ? "Use uma animação por objeto e abra Editar chave para mudar curvas. Presets usam apenas marcadores."
      : "Grava chaves ao editar a transformação do objeto no quadro atual.";
  }
  const deleteKey = document.querySelector('[data-action="delete-key"]');
  if (deleteKey) deleteKey.disabled = !state.selectedKey;
  const editKey = document.querySelector('[data-action="edit-key"]');
  if (editKey) editKey.disabled = !state.selectedKey;
  if (state.scene) {
    const test = document.querySelector('[data-action="test"]');
    if (test) {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      test.disabled = !fontStatus.ready || !board || !hasInteractiveFeatures(state, board.id);
      test.title = test.disabled
        ? "Crie lógica, dados, layout ou semântica antes de testar."
        : "Executa lógica e dados em sessão isolada, sem modificar a arte.";
    }
  }
  updatePose();
  refreshHistoryControls();
  scheduleTick();
  if (workspaceWarning && workspaceWarning !== reportedWorkspaceWarning) {
    reportedWorkspaceWarning = workspaceWarning;
    notify(workspaceWarning);
  }
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
  return `<div class="canvas-toolbar"><span>▣ &nbsp; Zezé <small>1080×1080</small></span><span class="fps">60 quadros/s · base</span><div class="canvas-options">${button("edit-demo", "Editar formas")}${button("bones", "♧ <span>Mostrar ossos</span>", state.bones ? "selected" : "")}${button("clean", "◉ <span>Prévia limpa</span>", state.clean ? "selected" : "")}<select id="zoom" aria-label="Zoom">${[25, 50, 75, 100, 125, 150, 200, 300].map((v) => `<option ${state.zoom === v ? "selected" : ""}>${v}%</option>`).join("")}</select></div></div><div class="stage"><span class="stage-caption">Zezé</span><div class="artboard" style="--zoom:${state.zoom / 75}"><div class="ground"></div><img class="mascot" src="assets/zeze.svg" alt="Zezé, mascote turquesa sorridente"><svg class="rig ${!state.bones || state.clean ? "hidden" : ""}" viewBox="0 0 440 440" aria-hidden="true"><g stroke="#ff7ad9" stroke-width="1.5" fill="none"><path d="M220 300L220 262L220 205M220 262L174 240L152 214L134 190"/><path d="M220 262L214 278L220 300L226 278Z M174 240L157 224L152 214L166 222Z" fill="#ff7ad944"/><circle cx="220" cy="300" r="4"/><circle cx="220" cy="262" r="4"/><circle cx="220" cy="205" r="4"/><circle cx="174" cy="240" r="4"/><circle cx="152" cy="214" r="4"/><circle cx="123" cy="179" r="11"/><path d="M116 179h14m-7-7v14"/></g><g stroke="#4fe3c1" fill="none"><rect x="122" y="182" width="60" height="66" stroke-dasharray="3 3"/><path d="M119 179h6v6h-6zM179 179h6v6h-6zM119 245h6v6h-6zM179 245h6v6h-6z" fill="#4fe3c1"/></g><rect x="40" y="140" width="79" height="19" rx="3" fill="#ff7ad9"/><text x="46" y="153" font-size="10" fill="#32172c">◎ Alvo Mão</text></svg></div><span class="canvas-hint">${state.view === "design" ? "Selecione uma camada para ajustar suas propriedades" : "Espaço para reproduzir · ← → para navegar nos quadros"}</span></div>`;
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
  if (activeTimelineClip(state)) return clipTimeline(state, button);
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
    )}</select><div class="transport">${button("start", "|◁")}${button("previous", "‹")}${button("play", state.playing ? "Ⅱ" : "▶", "play")}${button("next", "›")}${button("end", "▷|")}</div><span id="timecode" class="timecode"></span><span class="push"></span>${button("add-key", "◇ Adicionar marcador")}${button("auto", '<span class="key">◆</span> Chave automática', state.auto ? "selected" : "")}${button("curves", state.curve ? "⌁ Curvas" : "◇ Chaves", "view-toggle")}</div><div class="timeline-body"><div class="ruler-label">PROPRIEDADES</div><div class="ruler">${Array.from({ length: 7 }, (_, i) => `<span>${Math.round((a.frames * i) / 6)}</span>`).join("")}</div>${rows.map((name, i) => `<div class="track-label ${[1, 2, 4, 6, 8, 10].includes(i) ? "indent" : ""}">${[0, 3, 5, 7, 9].includes(i) ? "⌄ &nbsp; " : ""}${name}<span>${i === 10 ? "⚑" : "◇"}</span></div><div class="track ${i % 2 ? "alternate" : ""}" data-track="${i}">${(i === 0 || i === 3 || i === 5 ? [] : state.keys.filter((k, j) => i !== 8 || j % 2 === 0)).map((k) => `<button class="keyframe ${i === 8 ? "violet" : ""}" aria-label="Quadro ${k}, ${name}" data-frame="${k}" style="left:${(k / a.frames) * 100}%">◆</button>`).join("")}${state.curve && i === 1 ? '<svg class="timeline-curve" viewBox="0 0 600 24" preserveAspectRatio="none"><path d="M0 22Q150 22 300 2T600 22"/></svg>' : ""}</div>`).join("")}<div id="playhead"><span></span></div></div><footer class="statusbar"><span class="live-dot"></span> <span data-local-save>${localSaveStatus}</span> <span class="push">EdiSVG · Prévia funcional <span class="mint">60 quadros/s · base</span></span></footer></section>`;
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
  document.querySelectorAll("[data-clip]").forEach((el) => {
    el.onclick = () => selectClip(el.dataset.clip);
  });
  if ($("#clip-select")) $("#clip-select").onchange = (event) => selectClip(event.target.value);
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
      const clip = activeClip(state);
      if (clip) {
        transact([
          {
            type: "motion",
            command: {
              type: "update-animation",
              animationId: clip.id,
              name: clip.name,
              fps: clip.fps,
              frames: clip.frames,
              mode: e.target.value,
            },
          },
        ]);
        render();
        return;
      }
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
      seek(Math.round(((e.clientX - r.left) / r.width) * currentAnimation().frames));
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
/** Opens on the default artboard unless it is empty and another one has the
 * work: a file then shows its drawing, not a blank board. */
function openingArtboardId(project) {
  const boards = project.artboards,
    fallback = boards.find((board) => board.id === project.defaultArtboardId);
  if (!fallback || fallback.scene.nodes.length) return project.defaultArtboardId;
  return boards.find((board) => board.scene.nodes.length)?.id ?? project.defaultArtboardId;
}
function applyProject(value, resetSession = true) {
  const project = parseProject(value);
  state.tool = "select";
  if (project.artboards.length) {
    state.view = "design";
    if (
      !project.artboards
        .flatMap((board) => flattenScene(board.scene))
        .some((e) => e.node.id === state.selected)
    )
      state.selected = null;
  }
  Object.assign(state, project, {
    humor: project.inputs.humor,
    waving: project.inputs.acenando,
    frame: 0,
    playing: false,
  });
  bindActiveArtboard(state, resetSession ? openingArtboardId(project) : state.activeArtboardId);
  if (resetSession) {
    Object.assign(state, {
      selectedKeys: [],
      workRange: null,
      timelineZoom: 1,
      timelineScroll: { left: 0, top: 0 },
      onion: false,
      snapGrid: 0,
      panelWidths: undefined,
      behaviorFocus: undefined,
      zoom: 75,
      pan: { x: 0, y: 0 },
      artboardViews: {},
      sidebarTab: "hierarchy",
    });
    chooseObject(state, state.selected);
    state.sessionId = crypto.randomUUID();
    state.revision = 0;
    state.activeClipId = project.motion.animations[0]?.id ?? null;
    state.selectedKey = null;
    state.selectedKeys = [];
    try {
      const preferences = localStorage.getItem("edisvg-workspace");
      const workspace = preferences === null ? null : parseWorkspace(preferences, project);
      if (workspace) {
        Object.assign(state, workspace);
        bindActiveArtboard(state, workspace.activeArtboardId);
      }
    } catch {
      workspaceWarning =
        "Preferências locais incompatíveis ou inacessíveis. O projeto foi preservado e o contexto padrão será usado.";
    }
  }
  for (const [name, mode] of Object.entries(project.modes)) animations[name].mode = mode;
}
function save(record = true) {
  const project = snapshot(state);
  if (record && projectHistory.commit(contentSnapshot(project))) state.revision++;
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
      if (projectHistory.evictedCount)
        el.title +=
          " · Histórico antigo reduzido pelo limite de snapshots (32 MB serializados/100 edições).";
    }
  }
  const indicator = document.querySelector("[data-local-save]");
  if (indicator) indicator.textContent = localSaveStatus;
}
function travelHistory(direction) {
  const project = projectHistory[direction]();
  if (!project) return false;
  const context = {
    view: state.view,
    animation: state.animation,
    frame: state.frame,
    selected: state.selected,
    activeClipId: state.activeClipId,
  };
  applyProject(project, false);
  state.revision++;
  state.view = context.view;
  state.animation = context.animation;
  state.keys = [...state.keysByAnimation[state.animation]];
  state.activeClipId = state.motion.animations.some((clip) => clip.id === context.activeClipId)
    ? context.activeClipId
    : (state.motion.animations[0]?.id ?? null);
  state.selectedKey = null;
  state.selectedKeys = [];
  state.frame = Math.min(context.frame, currentAnimation().frames);
  if (state.scene && flattenScene(state.scene).some(({ node }) => node.id === context.selected))
    state.selected = context.selected;
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
  state.activeClipId = null;
  state.selectedKey = null;
  state.selectedKeys = [];
  state.keysByAnimation[state.animation] = [...state.keys];
  state.animation = name;
  state.frame = 0;
  state.playing = false;
  state.keys = [...state.keysByAnimation[name]];
  save(false);
  render();
}
function selectClip(id) {
  if (!state.motion.animations.some((clip) => clip.id === id))
    throw new Error("Animação não encontrada.");
  state.activeClipId = id;
  state.selectedKey = null;
  state.selectedKeys = [];
  state.frame = 0;
  state.playing = false;
  state.view = "animate";
  render();
}
function selectArtboard(id) {
  if (!state.artboards.some((board) => board.id === id))
    throw new Error("Prancheta não encontrada.");
  bindActiveArtboard(state, id);
  chooseObject(state, null);
  state.selectedKey = null;
  state.selectedKeys = [];
  state.playing = false;
  state.pathEdit = null;
  render();
}
function seek(frame) {
  state.playing = false;
  state.frame = Math.max(0, Math.min(currentAnimation().frames, frame));
  render();
}
function play() {
  if (state.playing) state.playing = false;
  else {
    const range = previewRange();
    if (state.frame < range.start || state.frame >= range.end) state.frame = range.start;
    state.playing = true;
    started = performance.now();
    offset = state.frame / currentAnimation().fps;
  }
  render();
}
function previewRange() {
  return resolvePreviewRange(currentAnimation(), state.workRange);
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
  scheduleTick();
}
function updatePose() {
  const previewError = document.querySelector("[data-preview-error]");
  if (previewError) {
    previewError.hidden = true;
    previewError.textContent = "";
  }
  const name = state.view === "machine" ? state.machine : state.animation,
    a = state.view === "machine" ? { ...animations[name], fps: 60 } : currentAnimation(),
    p = activeClip(state) ? { y: 0, rotation: 0, scale: 1 } : poseAt(name, state.frame, a.frames),
    t = state.transforms;
  document.querySelectorAll(".mascot,.scene-artwork>svg>[data-scene-motion]").forEach((img) => {
    img.style.transform =
      state.scene && state.view === "design"
        ? "none"
        : `translate(${t.x}px,${t.y + p.y}px) rotate(${t.rotation + p.rotation}deg) scale(${t.sx * p.scale},${t.sy * p.scale})`;
    img.style.opacity = t.opacity / 100;
  });
  const clip = state.view === "animate" ? activeClip(state) : null;
  if (
    (state.view === "animate" || joystickPreview) &&
    state.scene &&
    (clip ||
      state.previewComposition?.playback.drivers.length ||
      state.previewComposition?.playback.rigScopes?.length)
  ) {
    const clock = state.previewComposition?.playback.motion.animations.find(
      (item) => item.id === clip?.id,
    ) ??
      clip ?? { ...a, id: "animation-preview", name: "Prévia", tracks: [] };
    if (!state.previewPlaybackContext) throw new Error("Contexto de prévia indisponível.");
    let evaluated, preparedEffects;
    try {
      evaluated =
        state.view === "design" && joystickPreview
          ? evaluatePlaybackStaticFrame(
              state.previewPlaybackContext,
              disposeLayoutPreview?.transforms(),
              undefined,
              joystickPreview,
            )
          : evaluatePlaybackFrame(
              state.previewPlaybackContext,
              clock,
              state.frame,
              disposeLayoutPreview?.transforms(),
              undefined,
              joystickPreview,
            );
      preparedEffects = state.previewEffectContext
        ? evaluateVectorEffects(
            state.previewEffectContext,
            evaluated.poses,
            evaluated.geometry,
            disposeLayoutPreview?.transforms(),
          )
        : [];
    } catch (error) {
      state.playing = false;
      if (previewError) {
        previewError.hidden = false;
        previewError.textContent = `Prévia interrompida no quadro ${state.frame}: ${error instanceof Error ? error.message : "Falha na avaliação."} O documento permanece preservado; use Design/Desfazer para corrigir.`;
      }
      if (joystickPreview) throw error;
      return;
    }
    const poses = evaluated.poses;
    effectPreviewFrame = evaluated;
    skinOverlay?.refresh(evaluated.geometry);
    for (const [id, patch] of poses) {
      const element = sceneElements.get(id);
      if (!element) continue;
      const pose = { ...sceneBases.get(id), ...patch };
      const value = transformAttribute(pose);
      if (element.getAttribute("transform") !== value) element.setAttribute("transform", value);
      const opacity = String(pose.opacity / 100);
      if (element.getAttribute("opacity") !== opacity) element.setAttribute("opacity", opacity);
      const geometry = evaluated.geometry.get(id);
      meshPreviews.get(id)?.paint(geometry);
      const shape = element.firstElementChild;
      if (shape?.localName === "path")
        writeShapePath(
          shape,
          geometry ? geometryPath(geometry) : shape.getAttribute("d"),
          paintLayerPaths(evaluated.geometry, id),
        );
      const display = evaluated.visibility.get(id) === false ? "none" : sceneDisplays.get(id);
      if (display === null || display === undefined) element.removeAttribute("display");
      else element.setAttribute("display", display);
    }
    // Design edits the authored stacking; only Animate shows the animated one.
    drawOrderPreview?.paint(state.view === "animate" ? evaluated.orders : new Map());
    drawOrderPanel?.update(state.frame);
    const selectedPose = { ...sceneBases.get(state.selected), ...poses.get(state.selected) };
    effectPreview?.paint(preparedEffects);
    const root = document.querySelector(".scene-artwork>svg");
    if (root && state.previewComposition)
      paintOnionSkin(
        root,
        state.previewComposition.playback,
        clock,
        state.frame,
        !!state.onion && !state.playing && !state.clean && !joystickPreview,
        disposeLayoutPreview?.transforms(),
        sceneDisplays,
      );
    for (const input of document.querySelectorAll("[data-scene-transform]"))
      if (
        !joystickPreview &&
        input !== document.activeElement &&
        selectedPose[input.dataset.sceneTransform] !== undefined
      )
        input.value = formatInput(selectedPose[input.dataset.sceneTransform]);
  }
  if ($("#timecode"))
    $("#timecode").innerHTML =
      `<strong>${Math.floor(state.frame / a.fps)}:${String(Math.floor(state.frame % a.fps)).padStart(2, "0")}</strong> <small>/ ${(a.frames / a.fps).toFixed(2)}s · quadro ${Math.floor(state.frame)} de ${a.frames}</small>`;
  rigOverlay?.refresh();
  if ($("#playhead"))
    $("#playhead").style.left = $("#playhead").dataset.timelineWidth
      ? `calc(var(--track-label) + ${(Number($("#playhead").dataset.timelineWidth) * state.frame) / a.frames}px)`
      : `calc(var(--track-label) + (100% - var(--track-label) - 20px) * ${state.frame / a.frames})`;
}
function action(id) {
  if (["commands", "object", "animation", "view"].includes(id))
    return openCommands({ object: "Objeto", animation: "Animação", view: "Exibir" }[id]);
  if (state.scene && (id === "rulers" || id === "guides")) {
    state[id] = state[id] === false;
    render();
    return;
  }
  if (state.scene && id === "guides-clear") {
    try {
      transact([{ type: "guides", guides: [] }]);
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (id === "viewport-reset") {
    state.zoom = 75;
    state.pan = { x: 0, y: 0 };
    render();
    return;
  }
  if (id.startsWith("object-")) {
    const operation = id.slice(7);
    try {
      if (operation === "group" || operation === "ungroup")
        transact([
          {
            type: "composition",
            operation,
            ...(operation === "group"
              ? { targetIds: selectionIds(state), name: "Grupo" }
              : { targetId: state.selected }),
          },
        ]);
      else changeScene(operation);
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (id === "onion") {
    state.onion = !state.onion;
    render();
    return;
  }
  if (id === "retime-keys") return openRetimeDialog(state, { transact, render, notify });
  if (id === "timeline-zoom-in" || id === "timeline-zoom-out") {
    state.timelineZoom = Math.max(
      1,
      Math.min(64, (state.timelineZoom ?? 1) * (id === "timeline-zoom-in" ? 2 : 0.5)),
    );
    render();
    return;
  }
  if (id === "edit-key") return openKeyDialog(state, { transact, render, notify });
  if (id === "clip-duplicate") {
    const clip = activeClip(state);
    if (!clip) return;
    try {
      const newId = `animation-${crypto.randomUUID()}`;
      transact([
        {
          type: "motion",
          command: {
            type: "duplicate-animation",
            animationId: clip.id,
            id: newId,
            name: `${clip.name} (cópia)`.slice(0, 120),
          },
        },
      ]);
      selectClip(newId);
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (id === "clip-new" || id === "clip-settings")
    return openClipDialog(state, { transact, render, notify }, id === "clip-new");
  if (id === "delete-key") {
    try {
      if (!state.selectedKey || !activeClip(state))
        throw new Error("Selecione uma chave na timeline.");
      transact([
        {
          type: "animation-keys",
          command: {
            operation: "delete",
            animationId: state.activeClipId,
            references: selectedKeyReferences(state),
          },
        },
      ]);
      state.selectedKey = null;
      state.selectedKeys = [];
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (id === "design" && !state.scene) return editDemo();
  if (id.startsWith("tool-")) {
    const result = activateTool(state, id.slice(5));
    if (!result.ok) {
      notify(result.reason);
      return;
    }
    if (id === "tool-constraints" || id === "tool-mesh") {
      state.tool = "select";
      state.rigFocus = { ...state.rigFocus, artboardId: state.activeArtboardId, open: true };
      state.bones = true;
      state.clean = false;
    }
    render();
    document.querySelector(`[data-tool="${state.tool}"]`)?.focus();
    return;
  }
  if (id === "edit-demo") return editDemo();
  if (id === "import-svg") return importArtwork();
  if (state.scene && id === "add-shape") {
    try {
      changeScene("add", "rect");
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (state.scene && id === "test") return openBehaviorTest();
  if (id === "assistant") return assistant.toggle();
  if (id === "file") return assistant.fileMenu();
  if (["animate", "design", "machine"].includes(id)) {
    state.view = id;
    if (id === "machine") state.pathEdit = null;
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
  if (id === "end") return seek(currentAnimation().frames);
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
    if (activeClip(state)) {
      try {
        const entry = flattenScene(state.scene).find(({ node }) => node.id === state.selected);
        if (!entry) throw new Error("Selecione um objeto para gravar sua pose.");
        transact(keyCommands(objectPose(state, entry.node)));
        render();
        notify(`Pose gravada no quadro ${Math.round(state.frame)}.`);
      } catch (error) {
        notify(error.message);
      }
      return;
    }
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
  if (id === "animation")
    return state.scene
      ? openClipDialog(state, { transact, render, notify }, !activeClip(state))
      : play();
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
    state.sidebarTab = "artboards";
    render();
    return;
  }
  if (id === "assets") {
    state.sidebarTab = "assets";
    render();
    return;
  }
  if (id === "hierarchy") {
    state.sidebarTab = "hierarchy";
    render();
    return;
  }
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
    replaceActiveScene(state, scene);
    state.motion = emptyMotion();
    state.activeClipId = null;
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
function importArtwork(initial) {
  const dialog = document.querySelector("#clip-dialog");
  if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
  disposeSvgImport?.();
  disposeSvgImport = mountSvgImport(dialog, {
    initial,
    native: window.desktop ? () => window.desktop.importSvg() : undefined,
    report: notify,
    apply(scene, name) {
      transact([
        {
          type: "artboard",
          operation: "import",
          id: `artboard-${crypto.randomUUID()}`,
          name,
          scene,
        },
      ]);
      chooseObject(state, flattenScene(state.scene)[0]?.node.id ?? null);
      state.view = "design";
      state.playing = false;
      state.frame = 0;
      render();
      notify("SVG importado em nova prancheta; as anteriores e suas animações foram preservadas.");
    },
  });
}
bindSvgIngress(
  (source, name) => importArtwork({ source, name }),
  (file) => {
    const session = state.sessionId;
    void readSvgFile(file)
      .then((value) => {
        if (state.sessionId !== session) {
          notify("O projeto foi substituído; nenhuma importação foi aplicada.");
          return;
        }
        importArtwork(value);
      })
      .catch((error) =>
        notify(error instanceof Error ? error.message : "Não foi possível ler o SVG."),
      );
  },
  notify,
);
function openCommands(group) {
  if (document.querySelector("dialog[open]")) return;
  state.playing = false;
  render();
  const ids = new Set(selectionIds(state)),
    selection = flattenScene(state.scene).filter(({ node }) => ids.has(node.id));
  const commands = editorCommands(
    {
      scene: !!state.scene,
      selection: state.view !== "machine" && selection.length > 0,
      locked: selection.some((entry) => entry.locked),
      clip: !!activeClip(state),
      key: !!state.selectedKey,
      keys: selectedKeyIds(state).length > 0,
      group: selection.length === 1 && selection[0].node.tag === "g" && !selection[0].node.instance,
      guides: boardGuides(state).length > 0,
      undo: projectHistory.canUndo,
      redo: projectHistory.canRedo,
    },
    TOOLS.map((tool) => ({
      id: `tool-${tool.id}`,
      label: tool.label,
      group: "Ferramentas",
      shortcut: tool.shortcut,
      reason: toolAvailability(tool, state) || undefined,
    })),
  ).filter((command) => !group || command.group === group);
  const dialog = document.querySelector("#clip-dialog");
  disposePalette = mountCommandPalette(dialog, {
    commands,
    title: group ? `Comandos · ${group}` : "Comandos do EdiSVG",
    execute(id) {
      disposePalette?.();
      dialog.close();
      action(id);
    },
  });
}
function openBehaviorTest(machineId) {
  if (!fontCatalog.synchronize(state.assets, state.sessionId).ready) {
    notify("Aguarde ou corrija as fontes incorporadas antes de testar.");
    return;
  }
  state.playing = false;
  render();
  try {
    const board = state.artboards.find((board) => board.id === state.activeArtboardId);
    if (!board) throw new Error("Selecione uma prancheta.");
    const compiled = compileInteractiveArtboard(snapshot(state), board.id, {
      ...(!board.behavior?.machines.length && state.activeClipId
        ? { animationId: state.activeClipId }
        : {}),
    });
    disposeBehaviorTest = mountBehaviorTest(document.querySelector("#clip-dialog"), {
      compiled,
      machineId: machineId ?? board.behavior?.defaultMachineId,
    });
  } catch (error) {
    notify(error.message);
  }
}
document.addEventListener("contextmenu", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest("[data-object],[data-scene-select],.scene-artwork")
      : null;
  if (!target || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  const id = target.getAttribute("data-object") ?? target.getAttribute("data-scene-select");
  if (id && !selectionIds(state).includes(id)) chooseObject(state, id);
  openCommands("Objeto");
});
function openHelp() {
  const d = $("#help-dialog");
  d.innerHTML = `<div class="dialog-heading"><div><h2>Seu estúdio de movimento.</h2><p>Crie uma cena própria ou importe um SVG.</p></div><button id="close-help" aria-label="Fechar">×</button></div><div class="help-content"><p><b>01 · Anime objetos</b><br>Crie uma animação, selecione um objeto e grave uma pose. Ative Autochave, mude de quadro e edite as transformações para criar movimento. FPS e duração são configuráveis.</p><p><b>02 · Explore a timeline</b><br>Clique na régua e pressione Espaço para reproduzir. Selecione uma chave para posicionar o cursor ou excluí-la; Ctrl+Z desfaz edições.</p><p><b>03 · Leve para a web</b><br>O HTML independente usa o mesmo avaliador do editor, sem conta ou conexão. SVG usa amostragem no FPS do documento. Sequência PNG, GIF, MP4 e WebM desenham cada quadro com o mesmo player, sem áudio nem interação. O projeto preserva trilhas e configurações.</p><p><b>04 · Edite as formas</b><br>Em Design, selecione uma forma e pressione Enter. Arraste pontos e alças; use Concluir para sair.</p><p class="micro">Presets globais são legados; seus marcadores não guardam poses. Alças de curvas são editáveis. Estados permite criar máquinas, camadas, transições e dados; Testar executa sessão isolada e HTML interativo conserva a lógica. Layouts responsivos e modelos compostos/listas são editáveis; React exporta componente, tipos, runtime e exemplo Next.js. Componentes mantêm sessões independentes de lógica/dados/layout; Testar permite inspecioná-las sem editar a origem. Rig, malha e recursos avançados continuam em implementação. Não há compatibilidade .riv.</p></div>`;
  $("#close-help").onclick = () => d.close();
  d.showModal();
}
function openExport() {
  disposeExportPanel?.();
  const d = $("#export-dialog");
  const clip = activeClip(state);
  const exportBoard = state.artboards.find((board) => board.id === state.activeArtboardId);
  const behavior = exportBoard?.behavior;
  const machines = behavior?.machines ?? [];
  const interactive = hasInteractiveFeatures(state, exportBoard?.id);
  const losesInteraction = requiresInteractiveExport(state, exportBoard?.id);
  const hasEffects = flattenScene(state.previewComposition?.scene ?? state.scene).some(
    ({ node }) => node.effects,
  );
  const exportSnapshot = snapshot(state);
  const taskController = new AbortController();
  let preparing = false;
  d.innerHTML = `<div class="dialog-heading"><div><h2>Exportar para web</h2><p>${escapeHtml(state.name)} · ${escapeHtml(clip?.name ?? state.animation)} · ${escapeHtml(clip?.mode ?? state.modes[state.animation])}</p></div><button id="close-export" aria-label="Fechar exportação">×</button></div><div class="export-content"><h3>FORMATO</h3>${[
    ...(interactive
      ? [
          [
            "interactive-html",
            "HTML interativo",
            "estados e dados",
            "Máquinas, camadas, inputs, bindings, listeners e eventos; runtime offline compartilhado com Testar.",
          ],
        ]
      : []),
    [
      "html",
      "HTML independente",
      "recomendado",
      clip
        ? "Trilhas por objeto com o mesmo avaliador do editor. Player offline com pausa, seek e troca de animação."
        : "Reprodução da animação selecionada com pausa. Interação fixa somente na demonstração.",
    ],
    [
      "svg",
      "SVG animado",
      "timeline",
      clip
        ? `Trilhas amostradas a ${clip.fps} FPS; aproximação linear entre amostras, sem estados.`
        : "Movimento global amostrado a 60 Hz. Sem máquina de estados.",
    ],
    [
      "json",
      "Projeto completo",
      "preservação",
      "Documento canônico com todas as pranchetas, recursos e lógica.",
    ],
    [
      "lottie",
      "Lottie · JSON",
      "perfil vetorial",
      "Animação vetorial amostrada, com relatório de compatibilidade e conversões confirmadas. Requer uma animação por objeto selecionada.",
    ],
    [
      "react",
      "React · pacote ZIP",
      "componente + runtime",
      "Componente JSX, tipos, runtime local, instruções e licenças. Lógica completa ou clip selecionado quando não há máquina.",
    ],
    [
      "png-sequence",
      "Sequência PNG · ZIP",
      "imagens",
      "Um PNG por quadro, com transparência e manifesto de tempos, desenhado pelo player compartilhado.",
    ],
    [
      "gif",
      "GIF animado",
      "imagens",
      "Até 256 cores por quadro e transparência total ou nenhuma; até 50 FPS.",
    ],
    [
      "mp4",
      "Vídeo MP4 · H.264",
      "vídeo",
      "Vídeo opaco com cor de fundo, sem áudio, codificado neste computador.",
    ],
    [
      "webm",
      "Vídeo WebM · VP9",
      "vídeo",
      "Vídeo opaco com cor de fundo, sem áudio, codificado neste computador.",
    ],
  ]
    .map(([v, n, b, desc], i) => {
      const needsClip = v === "lottie" || RASTER_FORMATS.includes(v);
      const unsupported = (hasEffects && ["html", "svg"].includes(v)) || (needsClip && !clip);
      const reason =
        needsClip && !clip
          ? `Selecione ou crie uma animação por objeto antes de exportar ${v === "lottie" ? "Lottie" : "imagens ou vídeo"}; presets globais legados não entram neste perfil.`
          : "Recortes e máscaras desta composição exigem HTML interativo ou React; não são descartados na exportação.";
      return `<label class="format-option"><input type="radio" name="format" value="${v}" ${i === 0 ? "checked" : ""} ${unsupported ? "disabled" : ""}><div><strong>${n}</strong><span class="badge">${unsupported ? "indisponível neste perfil" : b}</span><p>${unsupported ? reason : desc}</p></div></label>`;
    })
    .join(
      "",
    )}<h3>OPÇÕES</h3><label class="export-field">Texto alternativo<input id="alt-text" value="${escapeHtml(state.name)}" maxlength="200"></label><label class="check-row"><input id="reduced" type="checkbox" checked><span>Respeitar “reduzir movimento”<small>Pausa a animação quando solicitado pelo sistema.</small></span></label><label class="check-row"><input id="offscreen" type="checkbox" checked><span>Pausar fora da tela<small>Economiza recursos quando o personagem não está visível.</small></span></label></div><div class="dialog-footer"><span>Escolha onde salvar o arquivo</span><button id="cancel-export">Cancelar</button><button class="primary" id="download">↗ Exportar arquivo</button></div>`;
  const behaviorSettings = document.createElement("section");
  const currentFormat = () => d.querySelector('input[name="format"]:checked')?.value;
  const updateExportButton = () => {
    d.querySelector("#download").disabled =
      preparing ||
      (currentFormat() === "lottie" && !lottieControls?.read().ready) ||
      (RASTER_FORMATS.includes(currentFormat()) && !rasterControls?.read()?.ready);
  };
  const lottieControls =
    clip && exportBoard
      ? createLottieExportControls(exportSnapshot, exportBoard.id, clip.id, updateExportButton)
      : null;
  if (lottieControls) d.querySelector(".export-content").append(lottieControls.element);
  const rasterControls =
    clip && exportBoard
      ? createRasterExportControls(exportSnapshot, exportBoard.id, clip.id, updateExportButton)
      : null;
  if (rasterControls) d.querySelector(".export-content").append(rasterControls.element);
  behaviorSettings.innerHTML =
    '<label class="export-field">Máquina inicial (HTML interativo / React)<select id="export-machine" aria-label="Máquina inicial"></select></label><label class="export-field">Ajuste (HTML interativo / React)<select id="export-fit" aria-label="Ajuste do HTML interativo"><option value="contain">Conter proporcionalmente</option><option value="cover">Cobrir com recorte</option><option value="stretch">Esticar</option></select></label><label class="check-row" data-animation-confirm><input id="export-animation-only" type="checkbox"><span>Confirmo exportar apenas a animação, sem lógica, dados, eventos, áudio e layout responsivo<small>Obrigatório ao converter um projeto interativo em HTML de timeline ou SVG.</small></span></label>';
  for (const machine of machines) {
    const option = document.createElement("option");
    option.value = machine.id;
    option.textContent = machine.name;
    option.selected = machine.id === behavior.defaultMachineId;
    behaviorSettings.querySelector("#export-machine").append(option);
  }
  const syncBehaviorSettings = () => {
    const format = d.querySelector('input[name="format"]:checked').value;
    const raster = RASTER_FORMATS.includes(format);
    behaviorSettings.hidden = format === "lottie" || format === "json" || raster;
    behaviorSettings.querySelector("#export-machine").disabled = ![
      "interactive-html",
      "react",
    ].includes(format);
    behaviorSettings.querySelector("#export-fit").disabled = ![
      "interactive-html",
      "react",
    ].includes(format);
    behaviorSettings.querySelector("[data-animation-confirm]").hidden =
      !losesInteraction || ["interactive-html", "react", "json", "lottie"].includes(format);
    lottieControls?.setEnabled(format === "lottie");
    rasterControls?.setFormat(raster ? format : null);
    d.querySelector("#reduced").disabled = format === "lottie" || raster;
    d.querySelector("#offscreen").disabled = format === "lottie" || raster;
    d.querySelector("#reduced").closest("label").hidden = format === "lottie" || raster;
    d.querySelector("#offscreen").closest("label").hidden = format === "lottie" || raster;
    d.querySelector("#alt-text").closest("label").hidden = raster;
    d.querySelector("#alt-text").closest("label").firstChild.textContent =
      format === "lottie" ? "Nome da composição" : "Texto alternativo";
    updateExportButton();
  };
  d.querySelector(".export-content").append(behaviorSettings);
  for (const radio of d.querySelectorAll('input[name="format"]'))
    radio.addEventListener("change", syncBehaviorSettings);
  syncBehaviorSettings();
  const cancel = () => {
    taskController.abort();
    lottieControls?.dispose();
    rasterControls?.dispose();
    if (disposeExportPanel === cancel) disposeExportPanel = null;
  };
  disposeExportPanel = cancel;
  d.addEventListener("cancel", cancel, { once: true });
  d.addEventListener(
    "close",
    () => {
      cancel();
      d.removeEventListener("cancel", cancel);
    },
    { once: true },
  );
  $("#close-export").onclick = $("#cancel-export").onclick = () => {
    cancel();
    d.close();
  };
  $("#download").onclick = async () => {
    const b = $("#download");
    preparing = true;
    lottieControls?.suspend();
    for (const control of d.querySelectorAll(".export-content input,.export-content select"))
      control.disabled = true;
    b.disabled = true;
    b.textContent = "Preparando…";
    try {
      const lottieSettings = lottieControls?.read();
      const rasterSettings = RASTER_FORMATS.includes(currentFormat())
        ? rasterControls?.read()
        : null;
      const exportResult = await exportProject(
        { ...exportSnapshot, activeArtboardId: exportBoard?.id, activeClipId: clip?.id },
        {
          format: $('input[name="format"]:checked').value,
          alt: $("#alt-text").value,
          reduced: $("#reduced").checked,
          offscreen: $("#offscreen").checked,
          machineId: document.querySelector("#export-machine")?.value,
          fit: document.querySelector("#export-fit")?.value ?? "contain",
          confirmAnimationOnly:
            currentFormat() === "lottie"
              ? lottieSettings?.confirmAnimationOnly
              : (document.querySelector("#export-animation-only")?.checked ?? false),
          ...(currentFormat() === "lottie"
            ? {
                confirmSampling: lottieSettings?.confirmSampling ?? false,
                confirmRendererPrecision: lottieSettings?.confirmRendererPrecision ?? false,
                subdivisions: lottieSettings?.subdivisions ?? 1,
              }
            : {}),
          ...(rasterSettings ? { raster: rasterSettings.options } : {}),
        },
        {
          signal: taskController.signal,
          onProgress: (completed, total) => {
            if (!taskController.signal.aborted)
              b.textContent = `Preparando… ${Math.round((completed / total) * 100)}%`;
          },
        },
      );
      if (taskController.signal.aborted) return;
      if (exportResult?.saved === false) {
        notify("Exportação cancelada.");
        return;
      }
      d.close();
      notify(window.desktop ? "Arquivo exportado." : "Arquivo exportado. Confira seus downloads.");
    } catch (error) {
      if (taskController.signal.aborted) return;
      notify(`Não foi possível exportar: ${error.message}`);
    } finally {
      preparing = false;
      if (d.open && !taskController.signal.aborted) {
        for (const control of d.querySelectorAll(".export-content input,.export-content select"))
          control.disabled = false;
        for (const radio of d.querySelectorAll('input[name="format"]')) {
          if (
            (hasEffects && ["html", "svg"].includes(radio.value)) ||
            ((radio.value === "lottie" || RASTER_FORMATS.includes(radio.value)) && !clip)
          )
            radio.disabled = true;
        }
        syncBehaviorSettings();
      }
      b.textContent = "↗ Exportar arquivo";
    }
  };
  d.showModal();
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openCommands();
    return;
  }
  if (e.key === "F1") {
    e.preventDefault();
    if (!document.querySelector("dialog[open]")) openHelp();
    return;
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    state.scene &&
    state.view === "machine" &&
    !((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase()))
  )
    return;
  if (e.key === "Delete" && state.selectedKey && e.target.closest(".timeline")) {
    e.preventDefault();
    action("delete-key");
    return;
  }
  if (state.scene && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    state.selectedIds = flattenScene(state.scene)
      .filter((entry) => entry.visible && !entry.locked)
      .map(({ node }) => node.id);
    state.selected = state.selectedIds.at(-1) ?? null;
    render();
    return;
  }
  if (state.scene && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
    e.preventDefault();
    try {
      if (e.shiftKey && selectionIds(state).length !== 1)
        throw new Error("Selecione um único grupo para desagrupar.");
      transact([
        e.shiftKey
          ? { type: "composition", operation: "ungroup", targetId: state.selected }
          : {
              type: "composition",
              operation: "group",
              targetIds: selectionIds(state),
              name: "Grupo",
            },
      ]);
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    travelHistory(e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
    return;
  }
  if (state.scene && e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    startPathEditing(state, { render, commit: save, notify, changeScene, setVertexKey });
    return;
  }
  if (
    state.scene &&
    (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") || e.key === "Delete")
  ) {
    e.preventDefault();
    try {
      changeScene(e.key === "Delete" ? "delete" : "duplicate");
      render();
    } catch (error) {
      notify(error.message);
    }
    return;
  }
  if (
    state.scene &&
    e.shiftKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.repeat &&
    ["r", "g"].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    action(e.key.toLowerCase() === "r" ? "rulers" : "guides");
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
  scheduledFrame = null;
  if (state.playing && !document.hidden) {
    const a =
      state.view === "machine" ? { ...animations[state.machine], fps: 60 } : currentAnimation();
    const elapsed = (now - started) / 1000 + offset;
    const range = previewRange();
    state.frame =
      range.start +
      frameAtSeconds(Math.max(0, elapsed - range.start / a.fps), {
        ...a,
        frames: range.end - range.start,
      });
    if (a.mode === "once" && state.frame >= range.end) {
      if (state.view === "machine") setMachine(transition(state.machine, "finish", state.waving));
      else {
        state.playing = false;
        render();
      }
    }
    updatePose();
  }
  scheduleTick();
}
function scheduleTick() {
  if (!state.playing || document.hidden) {
    if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
    scheduledFrame = null;
  } else if (scheduledFrame === null) scheduledFrame = requestAnimationFrame(tick);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    offset = state.frame / currentAnimation().fps;
  } else started = performance.now();
  scheduleTick();
});
const assistant = setupAssistant({
  snapshot: () => snapshot(state),
  overview: () => ({
    ...snapshot(state),
    assets: inspectAssets(state.assets, { offset: 0, limit: 20 }),
    projectId: state.id,
    sessionId: state.sessionId,
    revision: state.revision,
    activeClipId: state.activeClipId,
    motion: {
      version: state.motion.version,
      animations: state.motion.animations.map(({ id, name, fps, frames, mode, tracks }) => ({
        id,
        name,
        fps,
        frames,
        mode,
        tracks: tracks.length,
        keys: tracks.reduce((count, track) => count + track.keys.length, 0),
      })),
    },
    activeArtboardId: state.activeArtboardId,
    artboards: state.artboards.map(({ id, name, scene }) => ({
      id,
      name,
      viewBox: scene.viewBox,
      totalObjects: flattenScene(scene).length,
    })),
    scene: state.scene
      ? {
          viewBox: state.scene.viewBox,
          totalObjects: flattenScene(state.scene).length,
          objects: flattenScene(state.scene)
            .slice(0, 100)
            .map(({ node, depth, locked }) => ({
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
      ...(state.scene
        ? [
            "objetos SVG básicos",
            "trilhas por objeto",
            "transações atômicas",
            "player SVG offline",
            "gradientes tipados/herança",
            "nine-slice visual",
            "fontes incorporadas e áudio por eventos",
          ]
        : []),
    ],
    limitations: [
      "IK com perfil de juntas/escala/pivôs explícito; consultar guia e get_rig",
      "skin vetorial implementado; malha raster triangulada ainda não homologada",
      "fontes TTF/OTF incorporadas; cobertura completa de glifos, scripting e render avançado ainda em desenvolvimento",
      "overview limita objetos aos 100 primeiros; use get_objects para os demais",
    ],
  }),
  importSvg: importArtwork,
  fileStatus: updateFileStatus,
  restore(value) {
    applyProject(value);
    projectHistory.reset(contentSnapshot(snapshot(state)));
    save(false);
    render();
  },
  undo: () => travelHistory("undo"),
  redo: () => travelHistory("redo"),
  async execute(name, input) {
    if (name === "get_lottie_report") {
      const context = {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: input.artboardId,
      };
      const result = await runLottieTask(
        snapshot(state),
        {
          ...input,
          confirmSampling: false,
          confirmRendererPrecision: false,
          confirmAnimationOnly: false,
          alt: "",
        },
        "inspect",
      );
      if (result.kind !== "report") throw new Error("Relatório Lottie inesperado.");
      return { ...context, ...result.report };
    }
    if (name === "get_appearance" || name === "get_appearance_value") {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      if (!board) throw new Error("Selecione uma prancheta.");
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: board.id,
        ...(name === "get_appearance"
          ? inspectAppearance(board.scene, input)
          : inspectAppearanceValue(board.scene, input)),
      };
    }
    if (name === "get_audio" || name === "get_audio_value") {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      if (!board) throw new Error("Selecione uma prancheta.");
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: board.id,
        ...(name === "get_audio"
          ? inspectAudio(board.audio, input)
          : inspectAudioValue(board.audio, input)),
      };
    }
    if (name === "get_assets") return inspectAssets(state.assets, input);
    if (name === "get_font_coverage")
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: state.activeArtboardId,
        ...inspectFontCoverage(state.scene, state.assets, input),
      };
    if (name === "get_asset_notice") return inspectAssetNotice(state.assets, input);
    if (name === "get_component" || name === "get_component_value") {
      const node = flattenScene(state.scene).find(({ node }) => node.id === input.id)?.node;
      if (!node?.instance) throw new Error("Instância de componente não encontrada.");
      return name === "get_component"
        ? inspectComponent(node.instance, input.offset, input.limit)
        : inspectOverrideValue(node.instance, input.targetId, input.property, input.offset);
    }
    if (name === "select_artboard") return selectArtboard(input.id);
    if (name === "select_clip") return selectClip(input.id);
    if (name === "get_animation" || name === "get_track") {
      const clip = state.motion.animations.find(
        (item) => item.id === (input.animationId ?? input.id),
      );
      if (!clip) throw new Error("Animação não encontrada.");
      if (name === "get_animation") {
        const tracks = clip.tracks
          .slice(input.offset, input.offset + input.limit)
          .map(({ id, targetId, property, keys }) => ({
            id,
            targetId,
            property,
            totalKeys: keys.length,
          }));
        return {
          ...clip,
          tracks,
          totalTracks: clip.tracks.length,
          offset: input.offset,
          nextOffset:
            input.offset + tracks.length < clip.tracks.length ? input.offset + tracks.length : null,
        };
      }
      const track = clip.tracks.find((item) => item.id === input.trackId);
      if (!track) throw new Error("Trilha não encontrada.");
      const keys = track.keys.slice(input.offset, input.offset + input.limit);
      return {
        ...track,
        keys,
        totalKeys: track.keys.length,
        offset: input.offset,
        nextOffset:
          input.offset + keys.length < track.keys.length ? input.offset + keys.length : null,
      };
    }
    if (name === "edit_document") {
      const result = input.commands.some((command) => command.type === "vector-boolean")
        ? await transactHeavy(null, input)
        : transact(null, input);
      render();
      return {
        changed: result.changed,
        revision: state.revision,
        projectId: state.id,
        sessionId: state.sessionId,
      };
    }
    if (name === "get_rig" || name === "get_rig_value") {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      if (!board) throw new Error("Selecione uma prancheta.");
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: board.id,
        ...(name === "get_rig" ? inspectRig(board.rig, input) : inspectRigValue(board.rig, input)),
      };
    }
    if (name === "get_layout" || name === "get_layout_value") {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      if (!board) throw new Error("Selecione uma prancheta.");
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: board.id,
        ...(name === "get_layout"
          ? inspectLayout(board.layout, input)
          : inspectLayoutValue(board.layout, input)),
      };
    }
    if (name === "get_behavior" || name === "get_behavior_value") {
      const board = state.artboards.find((board) => board.id === state.activeArtboardId);
      if (!board) throw new Error("Selecione uma prancheta.");
      return {
        projectId: state.id,
        sessionId: state.sessionId,
        revision: state.revision,
        artboardId: board.id,
        ...(name === "get_behavior"
          ? inspectBehavior(board.behavior, input)
          : inspectBehaviorValue(board.behavior, input)),
      };
    }
    if (name === "get_objects") {
      const all = flattenScene(state.scene);
      const entries = all
        .slice(input.offset, input.offset + input.limit)
        .map(({ node, depth, locked }) => ({
          id: node.id,
          name: node.name,
          tag: node.tag,
          depth,
          locked,
          visible: node.visible,
        }));
      return {
        total: all.length,
        offset: input.offset,
        objects: entries,
        nextOffset:
          input.offset + entries.length < all.length ? input.offset + entries.length : null,
      };
    }
    if (name === "get_object" || name === "get_attribute") {
      const entry = flattenScene(state.scene).find(({ node }) => node.id === input.id);
      if (!entry) throw new Error("Objeto não encontrado.");
      if (name === "get_attribute") {
        if (!Object.hasOwn(entry.node.attrs, input.attribute))
          throw new Error("Atributo não encontrado.");
        const value = entry.node.attrs[input.attribute];
        return {
          id: input.id,
          attribute: input.attribute,
          totalLength: value.length,
          offset: input.offset,
          value: value.slice(input.offset, input.offset + 20000),
          nextOffset: input.offset + 20000 < value.length ? input.offset + 20000 : null,
        };
      }
      return {
        ...entry,
        node: {
          ...entry.node,
          instance: entry.node.instance ? inspectComponent(entry.node.instance, 0, 10) : undefined,
          children: entry.node.children.map((node) => node.id),
          text: { value: entry.node.text.slice(0, 512), length: entry.node.text.length },
          attrs: Object.fromEntries(
            Object.entries(entry.node.attrs).map(([key, value]) => [
              key,
              { value: value.slice(0, 512), length: value.length, truncated: value.length > 512 },
            ]),
          ),
        },
      };
    }
    if (name === "set_transform") {
      Object.assign(state.transforms, validateTransform(input));
    } else if (name === "rename_project") {
      if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120)
        throw new Error("Nome inválido.");
      state.name = input.name;
    } else if (name === "set_animation") {
      if (!animations[input.name]) throw new Error("Animação inválida.");
      return selectAnimation(input.name);
    } else if (name === "seek_frame" || name === "add_keyframe") {
      if (
        !Number.isInteger(input.frame) ||
        input.frame < 0 ||
        input.frame > currentAnimation().frames
      )
        throw new Error("Quadro fora da animação.");
      if (name === "seek_frame") return seek(input.frame);
      else if (activeClip(state)) {
        const entry = flattenScene(state.scene).find(({ node }) => node.id === state.selected);
        if (!entry) throw new Error("Selecione um objeto.");
        const frame = state.frame;
        state.frame = input.frame;
        try {
          transact(keyCommands(objectPose(state, entry.node)));
        } finally {
          state.frame = frame;
        }
        render();
        return;
      } else if (!state.keys.includes(input.frame)) state.keys.push(input.frame);
    } else throw new Error("Ferramenta desconhecida.");
    save();
    render();
  },
  notify,
});
async function initialize() {
  try {
    const local = localStorage.getItem("edisvg-project");
    if (window.desktop) {
      const result = await window.desktop.projectInitialize(local);
      applyProject(result.project);
      projectHistory.reset(contentSnapshot(snapshot(state)));
      fileStatus = result.status;
      if (result.recovered) localSaveStatus = "Projeto recuperado · salve em arquivo";
    } else if (local !== null) {
      const project = parseProject(JSON.parse(local));
      if (
        window.confirm(
          "Recuperar a cópia local do projeto não salvo? Cancelar descarta somente essa cópia.",
        )
      ) {
        applyProject(project);
        projectHistory.reset(contentSnapshot(snapshot(state)));
      }
    }
    render();
    save(false);
    scheduleTick();
  } catch (error) {
    render();
    document.querySelector("#app").inert = true;
    const dialog = document.querySelector("#help-dialog");
    dialog.innerHTML = `<div class="dialog-heading"><h2>Não foi possível recuperar o trabalho</h2></div><div class="help-content"><p>${escapeHtml(error.message)}</p><p>A cópia foi preservada. A edição está bloqueada para não substituí-la. Verifique o armazenamento e a compatibilidade da cópia antes de tentar novamente.</p><button data-retry-recovery>Tentar novamente</button></div>`;
    dialog.querySelector("[data-retry-recovery]").onclick = () => location.reload();
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    dialog.showModal();
  }
}
void initialize();
