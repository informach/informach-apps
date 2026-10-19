import {
  FileText,
  FolderOpen,
  Home,
  ListTodo,
  Plus,
  Printer,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { closeDoc, openDialog, printDoc, saveDoc } from "../lib/actions";
import { isDirty, useApp } from "../state/store";
import { useLocalTasks } from "../state/tasks";

export function TopBar(): React.ReactElement {
  const docs = useApp((s) => s.docs);
  const activeId = useApp((s) => s.activeId);
  const active = docs.find((d) => d.id === activeId);
  const taskCount = useLocalTasks((state) => Object.keys(state.active).length);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <FileText size={15} strokeWidth={2.4} />
        </span>
        <span className="brand-name">EdiPDF</span>
      </div>
      <nav className="tabs">
        {docs.length > 0 && (
          <button
            type="button"
            className={`tab home-tab${activeId === null ? " active" : ""}`}
            title="Início"
            onClick={() => useApp.setState({ activeId: null })}
          >
            <Home size={14} />
          </button>
        )}
        {docs.map((d) => (
          <fieldset
            key={d.id}
            className={`tab${d.id === activeId ? " active" : ""}`}
            aria-label={d.name}
            title={d.path ?? d.name}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeDoc(d.id);
              }
            }}
          >
            {isDirty(d) && <span className="dirty-dot" title="Alterações não salvas" />}
            <button
              type="button"
              className="tab-name"
              onClick={() => useApp.setState({ activeId: d.id })}
            >
              {d.name}
            </button>
            <button
              type="button"
              className="tab-close"
              title="Fechar (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                void closeDoc(d.id);
              }}
            >
              <X size={13} />
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="tab-add"
          title="Abrir arquivo (Ctrl+O)"
          onClick={() => void openDialog()}
        >
          <Plus size={15} />
        </button>
      </nav>
      <div className="topbar-actions">
        <button
          type="button"
          className="btn ghost"
          title="Tarefas e resultados preparados"
          onClick={() => useApp.setState({ dialog: { kind: "tasks" } })}
        >
          <ListTodo size={14} /> Tarefas{taskCount ? ` (${taskCount})` : ""}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Preferências"
          title="Preferências"
          onClick={() => useApp.setState({ dialog: { kind: "preferences" } })}
        >
          <Settings2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Encontrar uma ação"
          title="Encontrar uma ação (Ctrl+K)"
          onClick={() => useApp.setState({ dialog: { kind: "commands" } })}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void openDialog()}
          title="Abrir (Ctrl+O)"
        >
          <FolderOpen size={14} /> Abrir
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={!active}
          onClick={() => active && void printDoc(active.id)}
          title="Imprimir (Ctrl+P)"
        >
          <Printer size={14} /> Imprimir
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!active}
          onClick={() => active && void saveDoc(active.id)}
          title="Salvar (Ctrl+S) · Salvar como (Ctrl+Shift+S)"
        >
          <Save size={14} /> Salvar
        </button>
      </div>
    </header>
  );
}
