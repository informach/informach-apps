/**
 * The window with no project open ("Fechar projeto"): EdiSVG stays open, waiting for another.
 * It is not a dialog, so a request of another tool (EdiAula's "Nova animação do EdiSVG", "Editar
 * no EdiSVG") is still taken while it shows, and opens its project in place of this screen.
 * @param {{ version: string, actions: Record<"new" | "open" | "import", () => void> }} options
 */
export function createClosedScreen({ version, actions }) {
  /** @type {HTMLElement | null} */
  let screen = null;
  const items = [
    ["new", "＋", "Novo projeto", "Comece com uma tela em branco.", "Ctrl+N"],
    ["open", "↗", "Abrir projeto…", "Continue editando um arquivo .edisvg.", "Ctrl+O"],
    ["import", "↓", "Importar SVG…", "Comece de uma arte pronta.", "Ctrl+I"],
  ];
  return {
    isOpen: () => screen !== null,
    show() {
      if (!screen) {
        screen = document.createElement("section");
        screen.className = "closed-screen";
        screen.setAttribute("aria-labelledby", "closed-screen-title");
        screen.innerHTML = `<div class="closed-screen-card"><header><div class="closed-screen-brand"><span class="mark" aria-hidden="true">⌁</span>EdiSVG <small>${version}</small></div><h1 id="closed-screen-title">Nenhum projeto aberto</h1><p>Crie ou abra um projeto. Uma animação pedida pelo EdiAula também abre aqui.</p></header><div class="file-dialog-actions">${items.map(([id, icon, title, description, shortcut]) => `<button class="file-dialog-action" data-closed-${id}><span class="file-action-icon" aria-hidden="true">${icon}</span><span class="file-action-copy"><strong>${title}</strong><span>${description}</span></span><kbd>${shortcut}</kbd></button>`).join("")}</div></div>`;
        for (const [id] of items)
          screen.querySelector(`[data-closed-${id}]`).onclick = () => actions[id]();
        document.body.append(screen);
      }
      document.title = `EdiSVG ${version}`;
      screen.querySelector("[data-closed-new]").focus();
    },
    hide() {
      screen?.remove();
      screen = null;
    },
  };
}
