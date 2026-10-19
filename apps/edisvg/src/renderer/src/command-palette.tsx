import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
export interface EditorCommand {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  reason?: string;
}
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
interface Props {
  commands: EditorCommand[];
  title: string;
  execute(id: string): void;
  cancel(): void;
}
function CommandPalette({ commands, title, execute, cancel }: Props) {
  const id = useId(),
    [query, setQuery] = useState("");
  const visible = commands.filter((command) =>
    normalized(`${command.label} ${command.group} ${command.shortcut ?? ""}`).includes(
      normalized(query),
    ),
  );
  const focusFirst = () =>
    document.querySelector<HTMLButtonElement>("[data-command]:not(:disabled)")?.focus();
  return (
    <>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button type="button" aria-label="Fechar comandos" onClick={cancel}>
          ×
        </button>
      </div>
      <div className="help-content">
        <label className="scene-field" htmlFor={id}>
          Buscar comando
          <input
            id={id}
            name="command-search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Buscar comando"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusFirst();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const first = visible.find((command) => !command.reason);
                if (first) execute(first.id);
              }
            }}
          />
        </label>
        <div className="command-results">
          {visible.map((command) => (
            <button
              type="button"
              data-command={command.id}
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                const target = event.currentTarget,
                  container = target.parentElement;
                if (!container) return;
                event.preventDefault();
                const buttons = [
                    ...container.querySelectorAll<HTMLButtonElement>(
                      "[data-command]:not(:disabled)",
                    ),
                  ],
                  index = buttons.indexOf(target),
                  next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                          buttons.length;
                buttons[next]?.focus();
              }}
              key={command.id}
              disabled={!!command.reason}
              title={command.reason}
              onClick={() => execute(command.id)}
            >
              <span>
                <small>{command.group}</small>
                <strong>{command.label}</strong>
                {command.reason && <small>{command.reason}</small>}
              </span>
              <kbd>{command.shortcut ?? ""}</kbd>
            </button>
          ))}
        </div>
        {!visible.length && <p role="status">Nenhum comando encontrado.</p>}
        <p className="micro">
          Ctrl/Cmd+K abre os comandos. Setas navegam; Enter executa; Escape fecha. Comandos
          indisponíveis mostram o motivo.
        </p>
      </div>
    </>
  );
}
export function mountCommandPalette(dialog: HTMLDialogElement, props: Omit<Props, "cancel">) {
  let live = true;
  const root = createRoot(dialog);
  dialog.setAttribute("aria-label", props.title);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeAttribute("aria-label");
    root.unmount();
  };
  const cancel = () => {
    dispose();
    dialog.close();
  };
  const onCancel = (event: Event) => {
    event.preventDefault();
    cancel();
  };
  dialog.addEventListener("cancel", onCancel);
  flushSync(() => root.render(<CommandPalette {...props} cancel={cancel} />));
  dialog.showModal();
  return dispose;
}
