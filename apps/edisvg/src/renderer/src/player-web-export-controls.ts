import type { Project } from "../../shared/project";
import { flattenScene } from "../../shared/scene.js";

/** Every choice is explicit in the export dialog, including imported artboards named alike. */
export function createPlayerWebExportControls(
  project: Project,
  activeArtboardId: string | undefined,
  activeClipId: string | undefined,
) {
  const element = document.createElement("section");
  const title = document.createElement("h3");
  title.textContent = "ARTE DO PLAYER WEB";
  element.append(title);
  const listeners = new AbortController();
  let disposed = false;

  function field(text: string) {
    const label = document.createElement("label");
    label.className = "export-field";
    label.append(document.createTextNode(text));
    const select = document.createElement("select");
    select.setAttribute("aria-label", text);
    label.append(select);
    element.append(label);
    return select;
  }
  function option(select: HTMLSelectElement, value: string, text: string, disabled = false) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = text;
    node.disabled = disabled;
    select.append(node);
  }
  const artboard = field("Prancheta");
  const entry = field("Começar com");
  const populated = project.artboards.filter((board) => flattenScene(board.scene).length > 0);
  for (const [index, board] of project.artboards.entries())
    option(
      artboard,
      board.id,
      `${board.name} (${index + 1})${populated.includes(board) ? "" : " · vazia"}`,
      !populated.includes(board),
    );
  artboard.value =
    populated.find((board) => board.id === activeArtboardId)?.id ?? populated[0]?.id ?? "";

  function syncEntry() {
    entry.replaceChildren();
    const board = project.artboards.find((value) => value.id === artboard.value);
    const machines = board?.behavior?.machines ?? [];
    if (machines.length) {
      for (const machine of machines)
        option(entry, `machine:${machine.id}`, `Máquina · ${machine.name}`);
      const initial = board?.behavior?.defaultMachineId;
      if (initial) entry.value = `machine:${initial}`;
    } else {
      for (const clip of project.motion.animations)
        option(entry, `animation:${clip.id}`, `Animação · ${clip.name}`);
      option(entry, "static", "Pose estática");
      if (activeClipId && project.motion.animations.some((clip) => clip.id === activeClipId))
        entry.value = `animation:${activeClipId}`;
      else if (!project.motion.animations.length) entry.value = "static";
    }
  }
  artboard.addEventListener("change", syncEntry, { signal: listeners.signal });
  syncEntry();
  return {
    element,
    read() {
      if (disposed) throw new Error("A exportação foi fechada.");
      if (!populated.some((board) => board.id === artboard.value))
        throw new Error("Escolha uma prancheta com o desenho.");
      return {
        artboardId: artboard.value,
        machineId: entry.value.startsWith("machine:") ? entry.value.slice(8) : null,
        animationId: entry.value.startsWith("animation:") ? entry.value.slice(10) : null,
      };
    },
    setEnabled(enabled: boolean) {
      element.hidden = !enabled;
      for (const select of [artboard, entry]) select.disabled = !enabled;
    },
    dispose() {
      disposed = true;
      listeners.abort();
      element.remove();
    },
  };
}
