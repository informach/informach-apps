import { xmlEscape } from "../../shared/scene.js";
import { toolbarIcons } from "./toolbarIcons.js";

// Order, groups and icon names match edisvg.pen / m5eAtQ.
export const TOOLS = Object.freeze(
  [
    { id: "select", label: "Selecionar", icon: "mouse-pointer-2", shortcut: "V", group: "drawing" },
    { id: "pen", label: "Caneta", icon: "pen-tool", shortcut: "P", group: "drawing", scene: true },
    { id: "shapes", label: "Formas", icon: "square", shortcut: "R", group: "drawing", scene: true },
    { id: "text", label: "Texto", icon: "type", shortcut: "T", group: "drawing", scene: true },
    {
      id: "bone",
      label: "Osso",
      icon: "bone",
      group: "rig",
      shortcut: "B",
      scene: true,
    },
    {
      id: "mesh",
      label: "Malha",
      icon: "grid-2x2",
      group: "rig",
      scene: true,
    },
    {
      id: "constraints",
      label: "Restrições",
      icon: "link-2",
      group: "rig",
      scene: true,
    },
    { id: "hand", label: "Mão", icon: "hand", shortcut: "H", group: "navigation" },
    { id: "zoom", label: "Zoom", icon: "zoom-in", shortcut: "Z", group: "navigation" },
  ].map(Object.freeze),
);

export function toolAvailability(tool, state) {
  if (tool.unavailable) return tool.unavailable;
  if (state.view === "machine")
    return "Volte a Design ou Animar para usar as ferramentas do canvas.";
  if (tool.scene && !state.scene) return "Crie um projeto ou importe um SVG para editar objetos.";
  return "";
}

export function activateTool(state, id) {
  const tool = TOOLS.find((tool) => tool.id === id);
  if (!tool) return { ok: false, reason: "Ferramenta desconhecida." };
  const reason = toolAvailability(tool, state);
  if (reason) return { ok: false, reason };
  state.tool = id;
  if (state.scene && (id === "bone" || id === "mesh")) {
    state.bones = true;
    state.clean = false;
    state.rigFocus = { ...state.rigFocus, artboardId: state.activeArtboardId, open: true };
  }
  state.playing = false;
  if (state.scene) state.view = "design";
  return { ok: true };
}

export function toolShortcut(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing)
    return null;
  const key = event.key.toLowerCase();
  if (key === "o" || key === "l") return { id: "shapes", shape: key === "o" ? "circle" : "line" };
  const tool = TOOLS.find((tool) => tool.shortcut?.toLowerCase() === key);
  return tool ? { id: tool.id, ...(key === "r" ? { shape: "rect" } : {}) } : null;
}

export function toolbar(state) {
  let group;
  const buttons = TOOLS.map((tool) => {
    const separator =
      group && group !== tool.group
        ? '<span class="tool-separator" role="separator" aria-orientation="horizontal"></span>'
        : "";
    group = tool.group;
    const reason = toolAvailability(tool, state);
    const title = `${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}${reason ? ` — ${reason}` : ""}`;
    const selected = !reason && state.tool === tool.id;
    return `${separator}<button type="button" class="tool-button${selected ? " chosen" : ""}" data-tool="${tool.id}" data-action="tool-${tool.id}" aria-label="${tool.label}" aria-pressed="${selected}" aria-disabled="${!!reason}" ${tool.shortcut ? `aria-keyshortcuts="${tool.shortcut}"` : ""} title="${xmlEscape(title)}">${toolbarIcons[tool.icon]}<span class="tool-tooltip" role="tooltip">${xmlEscape(title)}</span></button>`;
  }).join("");
  return `<aside class="rail" role="toolbar" aria-label="Ferramentas de edição" aria-orientation="vertical">${buttons}</aside>`;
}

export function bindToolbar(root = document) {
  const rail = root.querySelector(".rail");
  if (!rail) return;
  const buttons = Array.from(rail.querySelectorAll("[data-tool]"));
  const active =
    buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0];
  for (const button of buttons) button.tabIndex = button === active ? 0 : -1;
  rail.onkeydown = (event) => {
    const index = buttons.indexOf(event.target);
    if (index >= 0 && ["Enter", " "].includes(event.key)) {
      event.stopPropagation();
      return;
    }
    if (index < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      button.tabIndex = i === next ? 0 : -1;
    });
    buttons[next].focus();
  };
}
