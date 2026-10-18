import { Check, ChevronRight, Layers, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  approveOpenLesson,
  clearBatch,
  nextWaiting,
  openBatchLesson,
  useCourseBatch,
} from "@/lib/courseBatch";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, IconButton } from "@/ui";

/**
 * The approval queue of a batch made by "Dividir por seção": which lesson of the batch is open,
 * how many are approved, and the buttons to approve the open one (it goes into the export queue)
 * and to open the next one waiting.
 */
export function BatchBar(): ReactNode {
  const lessons = useCourseBatch((s) => s.lessons);
  const source = useCourseBatch((s) => s.source);
  const openId = useProject((s) => s.project?.id);
  if (!lessons.length) return null;
  const at = lessons.findIndex((l) => l.project.id === openId);
  const lesson = at >= 0 ? lessons[at] : undefined;
  const approved = lessons.filter((l) => l.state === "approved").length;
  const next = nextWaiting();
  return (
    <section className="batch-bar" aria-label="Lote de aulas">
      <Layers size={14} className="accent" />
      <span className="batch-title">
        Lote de <strong>{source}</strong>:{" "}
        {lesson ? `aula ${at + 1} de ${lessons.length}` : `${lessons.length} aulas`} · {approved}{" "}
        aprovada{approved === 1 ? "" : "s"}
      </span>
      <span className="batch-steps">
        {lessons.map((l, i) => (
          <button
            type="button"
            key={l.path}
            className={`batch-step ${l.state === "approved" ? "is-done" : ""} ${i === at ? "is-open" : ""}`}
            title={`${l.label}${l.state === "approved" ? " · aprovada, na fila de exportação" : " · esperando você"}`}
            onClick={() => void openBatchLesson(l.path)}
          >
            {l.state === "approved" ? <Check size={10} /> : i + 1}
          </button>
        ))}
      </span>
      <span className="spacer" />
      {lesson && lesson.state === "waiting" && (
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          title="Põe esta aula na fila de exportação, como ela está agora"
          onClick={() =>
            void approveOpenLesson().then((ok) => {
              if (ok)
                useApp
                  .getState()
                  .toast(`${lesson.name} aprovada e na fila de exportação.`, "success");
            })
          }
        >
          Aprovar e exportar
        </Button>
      )}
      {next && (
        <Button size="sm" icon={ChevronRight} onClick={() => void openBatchLesson(next.path)}>
          {lesson ? "Próxima aula" : "Abrir a primeira"}
        </Button>
      )}
      <IconButton
        icon={X}
        label="Fechar o lote (as aulas criadas continuam nos projetos)"
        onClick={clearBatch}
      />
    </section>
  );
}
