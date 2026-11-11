import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ImportableArtboard } from "../../shared/projectImport";

interface Props {
  /** The other project's file name. */
  name: string;
  boards: ImportableArtboard[];
  /** How many more artboards fit in this project. */
  room: number;
  apply(ids: string[]): void;
}

/** The artboards that come: the chosen ones and their components, each once. */
const coming = (boards: ImportableArtboard[], chosen: Set<string>): number =>
  new Set(boards.filter((board) => chosen.has(board.id)).flatMap((b) => [b.id, ...b.componentIds]))
    .size;

function BoardsPanel({ name, boards, room, apply, cancel }: Props & { cancel(): void }) {
  // An artboard with an animation is what one usually comes for (the empty main one is not).
  const [chosen, setChosen] = useState(
    () => new Set(boards.filter((board) => board.animations.length).map((board) => board.id)),
  );
  const total = coming(boards, chosen);
  const over = total > room;
  return (
    <>
      <div className="dialog-heading">
        <h2>Importar pranchetas de outro projeto</h2>
        <button type="button" aria-label="Fechar importação de pranchetas" onClick={cancel}>
          ×
        </button>
      </div>
      <div className="help-content">
        <p>
          As pranchetas de <strong>{name}</strong> entram neste projeto com as animações, o rig, a
          lógica e os recursos delas. O outro arquivo não muda. Depois, use uma delas como
          componente (Artboards › Reutilizar outra prancheta como componente) para ela entrar
          animada numa cena.
        </p>
        <fieldset className="kit-folders">
          <legend>Pranchetas de {name}</legend>
          {boards.map((board) => (
            <label key={board.id}>
              <input
                type="checkbox"
                name="import-board"
                value={board.id}
                checked={chosen.has(board.id)}
                onChange={(event) => {
                  const next = new Set(chosen);
                  if (event.target.checked) next.add(board.id);
                  else next.delete(board.id);
                  setChosen(next);
                }}
              />
              <span>
                <strong>{board.name}</strong> · {board.width} × {board.height}
                <small>
                  {board.animations.length
                    ? `Animações: ${board.animations.join(", ")}`
                    : "Sem animação"}
                  {board.components.length ? ` · traz junto: ${board.components.join(", ")}` : ""}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <p role="status" className={over ? "kit-over" : undefined}>
          {total} {total === 1 ? "prancheta entra" : "pranchetas entram"}; cabem {room} neste
          projeto (um projeto tem até 100).
          {over ? " Desmarque pranchetas." : ""}
        </p>
        <p className="micro">
          Nomes que já existem aqui ganham um número ("Acenar 2"), e os identificadores repetidos
          ganham outros, sem mudar nada do que já está neste projeto. Ctrl+Z desfaz a importação
          inteira.
        </p>
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={cancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          disabled={over || chosen.size === 0}
          onClick={() => apply(boards.filter((b) => chosen.has(b.id)).map((b) => b.id))}
        >
          Importar {total} {total === 1 ? "prancheta" : "pranchetas"}
        </button>
      </div>
    </>
  );
}

/** Opens the dialog; `apply` runs after it closes. Returns a dispose for a dialog left open. */
export function mountBoardsImport(dialog: HTMLDialogElement, props: Props) {
  dialog.setAttribute("aria-label", "Importar pranchetas de outro projeto");
  dialog.classList.add("kit-dialog");
  let live = true;
  const root = createRoot(dialog);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeAttribute("aria-label");
    dialog.classList.remove("kit-dialog");
    dialog.removeEventListener("cancel", cancelEvent);
    root.unmount();
    dialog.close();
  };
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    dispose();
  };
  dialog.addEventListener("cancel", cancelEvent);
  flushSync(() =>
    root.render(
      <BoardsPanel
        {...props}
        cancel={dispose}
        apply={(ids) => {
          dispose();
          props.apply(ids);
        }}
      />,
    ),
  );
  dialog.showModal();
  return dispose;
}
