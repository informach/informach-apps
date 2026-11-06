import { fail, useStore } from "../state/store";

const STATUS: Record<string, string> = {
  waiting: "Na fila",
  working: "Salvando",
  done: "Pronto",
  error: "Falhou",
  cancelled: "Cancelado",
};

/** The save queue in the corner: progress, cancel, and where finished files went. */
export function Queue() {
  const queue = useStore((s) => s.queue);
  if (!queue.length) return null;
  const active = queue.filter((i) => i.status === "waiting" || i.status === "working").length;
  return (
    <section className="queue" role="status" aria-label="Fila de salvamento">
      <div className="row">
        <span className="label" style={{ flex: 1 }}>
          Fila · {active ? `${active} em andamento` : "concluída"}
        </span>
        {!active && (
          <button
            type="button"
            className="link"
            onClick={() => void window.api.clearFinished().catch(fail)}
          >
            Fechar
          </button>
        )}
      </div>
      {queue.map((item) => (
        <div key={item.id} className="queue-item">
          <span className="name">{item.label}</span>
          {(item.status === "working" || item.status === "waiting") && (
            <span className="progress-line" style={{ width: "100%" }}>
              <span style={{ width: `${Math.round(item.ratio * 100)}%` }} />
            </span>
          )}
          <div className="row">
            <span className="mono quiet" style={{ fontSize: 11.5, flex: 1 }}>
              {STATUS[item.status]}
              {item.status === "working" ? ` · ${Math.round(item.ratio * 100)}%` : ""}
            </span>
            {(item.status === "working" || item.status === "waiting") && (
              <button
                type="button"
                className="link"
                onClick={() => void window.api.cancelJob(item.id).catch(fail)}
              >
                Cancelar
              </button>
            )}
            {item.status === "done" && item.outputs[0] && (
              <button
                type="button"
                className="link"
                onClick={() => void window.api.showInFolder(item.outputs[0] ?? "").catch(fail)}
              >
                Mostrar na pasta
              </button>
            )}
          </div>
          {item.status === "error" && <span className="err">{item.message}</span>}
        </div>
      ))}
    </section>
  );
}
