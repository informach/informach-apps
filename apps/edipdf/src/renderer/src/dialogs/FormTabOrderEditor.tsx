import type { WidgetTabEntry } from "@shared/form-tab-order";
import { useEffect, useState } from "react";

export function FormTabOrderEditor({
  entries,
  page,
  running,
  onApply,
}: {
  entries: WidgetTabEntry[];
  page: number;
  running: boolean;
  onApply(ids: string[]): void;
}): React.ReactElement {
  const [ordered, setOrdered] = useState(entries);
  useEffect(() => setOrdered(entries), [entries]);
  const move = (index: number, delta: number) => {
    setOrdered((previous) => {
      const next = [...previous],
        a = next[index],
        b = next[index + delta];
      if (!a || !b) return previous;
      next[index] = b;
      next[index + delta] = a;
      return next;
    });
  };
  return (
    <details>
      <summary>Ordem manual de tabulação — página {page + 1}</summary>
      <p className="muted small">
        Mova os controles e aplique a ordem. A tecla Tab seguirá esta sequência dentro da página. O
        PDF usa ordem de widgets (PDF 1.7, extensão Adobe 3); leitores antigos podem variar. Isso
        não cria tags de acessibilidade.
      </p>
      <ol
        className="navigation-list"
        aria-label="Ordem de tabulação dos controles"
        style={{ maxHeight: 320, overflow: "auto" }}
      >
        {ordered.map((entry, index) => (
          <li key={entry.id}>
            <span>
              {index + 1}. {entry.label}
            </span>
            <div className="preferences-actions">
              <button
                type="button"
                className="btn ghost sm"
                disabled={running || index === 0}
                aria-label={`Mover ${entry.label} para cima`}
                onClick={() => move(index, -1)}
              >
                Subir
              </button>
              <button
                type="button"
                className="btn ghost sm"
                disabled={running || index === ordered.length - 1}
                aria-label={`Mover ${entry.label} para baixo`}
                onClick={() => move(index, 1)}
              >
                Descer
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!ordered.length && <p className="muted">Esta página não tem controles de formulário.</p>}
      <button
        type="button"
        className="btn"
        disabled={
          running ||
          !ordered.length ||
          ordered.every((entry, index) => entries[index]?.id === entry.id)
        }
        onClick={() => onApply(ordered.map((entry) => entry.id))}
      >
        Aplicar ordem de tabulação
      </button>
    </details>
  );
}
