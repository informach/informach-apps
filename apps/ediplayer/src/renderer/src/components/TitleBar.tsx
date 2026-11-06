import { Redo2, Scissors, Undo2 } from "lucide-react";
import { enterEdit, exitEdit, fail, openSave, redo, undo, useStore } from "../state/store";
import { Logo } from "./Logo";

export function TitleBar() {
  const view = useStore((s) => s.view);
  const facts = useStore((s) => s.facts);
  const editing = useStore((s) => s.editing);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return (
    <header className="titlebar">
      <span className="brand">
        <Logo />
        EdiPlayer
      </span>
      {view === "player" && facts && (
        <>
          <span className="sep" />
          <span className="file">{facts.name}</span>
        </>
      )}
      {editing && <span className="chip hide-mini">Editando · o original não muda</span>}
      <span className="spacer" />
      {view === "player" && facts && !editing && (
        <button
          type="button"
          className="btn primary hide-mini"
          onClick={() => void enterEdit().catch(fail)}
        >
          <Scissors size={15} />
          Editar <kbd>E</kbd>
        </button>
      )}
      {editing && (
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label="Desfazer"
            title="Desfazer (Ctrl+Z)"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Refazer"
            title="Refazer (Ctrl+Y)"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <button type="button" className="btn" onClick={exitEdit}>
            Sair da edição
          </button>
          <button type="button" className="btn primary" onClick={() => openSave("export")}>
            Salvar <kbd>Ctrl+S</kbd>
          </button>
        </>
      )}
    </header>
  );
}
