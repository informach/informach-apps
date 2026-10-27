import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ArtboardCommand } from "../../shared/artboards";
import type { ComponentCommand } from "../../shared/componentContracts";
import type { Artboard } from "../../shared/project";
import { CreateComponentForm } from "./component-create";
import type { ClipChoice } from "./instance-settings";

interface Props {
  boards: Artboard[];
  activeId: string | null;
  defaultId: string | null;
  select(id: string): void;
  execute(command: ArtboardCommand | ComponentCommand): void;
  clips: ClipChoice[];
  report(message: string): void;
}
/** Dense authoring controls retain the existing dark studio surfaces/tokens;
 * mint denotes selection, violet is reserved for animation. 4px spacing grid. */
function ArtboardPanel({ boards, activeId, defaultId, select, execute, report, clips }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = boards.find((board) => board.id === activeId);
  const run = (command: ArtboardCommand) => {
    try {
      execute(command);
    } catch (error) {
      report(error instanceof Error ? error.message : "Falha ao editar prancheta.");
    }
  };
  return (
    <section className="scene-padding" aria-label="Pranchetas">
      <h3>
        PRANCHETAS <small>{boards.length}/100</small>
      </h3>
      <div className="artboard-list">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            data-artboard-select={board.id}
            aria-pressed={board.id === activeId}
            className={board.id === activeId ? "selected" : ""}
            onClick={() => select(board.id)}
          >
            <strong>{board.name}</strong>
            <small>
              {board.scene.viewBox[2]} × {board.scene.viewBox[3]}
              {board.id === defaultId ? " · inicial" : ""}
            </small>
          </button>
        ))}
      </div>
      <button
        type="button"
        data-artboard-create
        onClick={() =>
          run({
            type: "artboard",
            operation: "create",
            id: `artboard-${crypto.randomUUID()}`,
            name: `Prancheta ${boards.length + 1}`,
            width: 1080,
            height: 1080,
          })
        }
      >
        + Nova prancheta
      </button>
      {active ? (
        <>
          <CreateComponentForm
            boards={boards}
            ownerId={active.id}
            clips={clips}
            execute={execute}
            report={report}
          />
          <div className="scene-tools">
            <button
              type="button"
              onClick={() =>
                run({
                  type: "artboard",
                  operation: "duplicate",
                  id: active.id,
                  newId: `artboard-${crypto.randomUUID()}`,
                  name: `${active.name} (cópia)`.slice(0, 120),
                })
              }
            >
              Duplicar prancheta
            </button>
            <button
              type="button"
              disabled={active.id === defaultId}
              onClick={() => run({ type: "artboard", operation: "set-default", id: active.id })}
            >
              Definir inicial
            </button>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              disabled={boards.length < 2}
              onClick={() => setConfirmDelete(true)}
            >
              Excluir prancheta
            </button>
          ) : (
            <fieldset aria-label="Confirmar exclusão">
              <p className="micro">
                Excluir remove as formas e suas trilhas. A ação pode ser desfeita.
              </p>
              <button
                type="button"
                onClick={() => run({ type: "artboard", operation: "delete", id: active.id })}
              >
                Confirmar exclusão da prancheta
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Cancelar exclusão
              </button>
            </fieldset>
          )}
        </>
      ) : (
        <p className="micro">Crie uma prancheta para começar.</p>
      )}
    </section>
  );
}
export function mountArtboardPanel(host: Element, props: Props) {
  const root = createRoot(host, {
    onUncaughtError(error) {
      props.report(error instanceof Error ? error.message : "Falha no painel de pranchetas.");
    },
  });
  root.render(<ArtboardPanel {...props} />);
  return () => root.unmount();
}
