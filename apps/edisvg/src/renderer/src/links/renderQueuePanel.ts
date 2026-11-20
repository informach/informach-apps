import "./renderQueue.css";
import type { QueueView } from "./renderLinks";

/**
 * The render queue in the top bar: one line saying what renders and how many wait, which opens
 * the list of the queue, where a project can be taken out. The line is drawn with the top bar
 * (`queueStatusText`); the list lives outside the editor's markup, so redrawing the editor never
 * closes it.
 */

export const EMPTY_QUEUE: QueueView = { items: [], running: null, progress: null };

const waiting = (view: QueueView) => view.items.length - (view.running ? 1 : 0);

/** The top bar's line: empty when nothing renders or waits. */
export function queueStatusText(view: QueueView): string {
  const rest = waiting(view);
  const more = rest > 0 ? ` · +${rest} na fila` : "";
  const { progress } = view;
  if (progress) {
    const { name, index, count, frame, frames } = progress;
    return `Renderizando para a aula${count > 1 ? ` (${index + 1} de ${count})` : ""} · ${name} · quadro ${frame} de ${frames}${more}`;
  }
  const current = view.items.find((item) => item.id === view.running);
  if (current) return `Preparando o render para a aula · ${current.name}${more}`;
  if (rest > 0) return `${rest} ${rest > 1 ? "projetos" : "projeto"} na fila para a aula`;
  return "";
}

function line(view: QueueView, id: string): string {
  if (view.running !== id) return "Na fila";
  const { progress } = view;
  if (!progress) return "Preparando…";
  return `${progress.count > 1 ? `Animação ${progress.index + 1} de ${progress.count} · ` : ""}${progress.name} · quadro ${progress.frame} de ${progress.frames}`;
}

/** Mounts the list once; `update` follows every change of the queue. */
export function mountRenderQueuePanel(cancel: (id: string) => void) {
  let view = EMPTY_QUEUE;
  const panel = document.createElement("div");
  panel.className = "link-queue";
  panel.id = "link-queue";
  panel.popover = "auto";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Renders para a aula");
  document.body.append(panel);

  /** The rows drawn, by item; the list is rebuilt only when the items or the running one change. */
  let drawn = "";
  const rows = new Map<string, { state: HTMLElement; bar: HTMLProgressElement | null }>();
  const fill = () => {
    for (const [id, row] of rows) {
      row.state.textContent = line(view, id);
      if (row.bar && view.progress) {
        row.bar.max = view.progress.frames;
        row.bar.value = view.progress.frame;
      }
    }
  };
  const draw = () => {
    const key = JSON.stringify([view.items.map((item) => item.id), view.running]);
    if (key === drawn) return fill();
    drawn = key;
    rows.clear();
    panel.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Renders para a aula";
    const hint = document.createElement("p");
    hint.textContent =
      "Cada salvar de um projeto vinculado entra nesta fila. Pode abrir o projeto da próxima aula: os renders continuam aqui, um projeto por vez, e voltam quando o EdiSVG abrir de novo.";
    panel.append(title, hint);
    if (!view.items.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nada na fila.";
      panel.append(empty);
      return;
    }
    const list = document.createElement("ol");
    for (const item of view.items) {
      const running = view.running === item.id;
      const row = document.createElement("li");
      if (running) row.dataset.running = "";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const state = document.createElement("span");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = running ? "Parar" : "Tirar da fila";
      remove.setAttribute("aria-label", `${remove.textContent}: ${item.name}`);
      remove.addEventListener("click", () => cancel(item.id));
      row.append(name, state, remove);
      const bar = running ? document.createElement("progress") : null;
      if (bar) row.append(bar);
      rows.set(item.id, { state, bar });
      list.append(row);
    }
    panel.append(list);
    fill();
  };

  // The line is redrawn with the top bar: one listener for whichever element is there now.
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("[data-link-status]")) return;
    drawn = "";
    draw();
    panel.togglePopover();
  });

  return {
    update(next: QueueView) {
      view = next;
      const status = document.querySelector<HTMLElement>("[data-link-status]");
      if (status) {
        const text = queueStatusText(view);
        status.textContent = text;
        status.hidden = !text;
      }
      if (panel.matches(":popover-open")) draw();
    },
  };
}
