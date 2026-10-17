import { Bot, FolderOpen, History } from "lucide-react";
import type { ReactNode } from "react";
import { useDoc } from "@/state/doc";

export function HistoryList(): ReactNode {
  const past = useDoc((s) => s.past);
  const future = useDoc((s) => s.future);
  const jump = useDoc((s) => s.jumpTo);
  const undoAll = (): void => {
    while (useDoc.getState().past.length) useDoc.getState().undo();
  };
  return (
    <div className="history">
      <button
        type="button"
        className={`history-item${past.length === 0 ? " is-current" : ""}`}
        onClick={undoAll}
      >
        <FolderOpen size={13} /> Abertura
      </button>
      {past.map((e, i) => (
        <button
          type="button"
          key={e.id}
          className={`history-item${i === past.length - 1 ? " is-current" : ""}${e.byAi ? " by-ai" : ""}`}
          onClick={() => jump(e.id)}
        >
          {e.byAi ? <Bot size={13} /> : <History size={13} />}
          {e.label}
        </button>
      ))}
      {future.map((e) => (
        <button
          type="button"
          key={e.id}
          className={`history-item is-future${e.byAi ? " by-ai" : ""}`}
          onClick={() => jump(e.id)}
        >
          {e.byAi ? <Bot size={13} /> : <History size={13} />}
          {e.label}
        </button>
      ))}
      {past.length + future.length === 0 && (
        <div className="empty-props">
          Cada mudança aparece aqui. Clique num passo para voltar até ele.
        </div>
      )}
    </div>
  );
}
