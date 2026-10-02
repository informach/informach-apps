import { cn } from "@informach/ui/lib/utils";
import { responseLabel } from "../response";
import type { SessionView } from "../service";
import { ItemFigure } from "./item-figure";

/** A resposta pode ser relida mesmo quando o percurso não chegou ao fim. */
export function SessionResponses({ view }: { view: Pick<SessionView, "lesson" | "saved"> }) {
  if (!view.saved.length) return null;
  return (
    <>
      <h2 className="mt-9 mb-3 text-left font-display text-2xl font-semibold text-tinta">
        Revisite seu raciocínio
      </h2>
      <div className="grid gap-2.5 text-left">
        {view.saved.map((saved) => (
          <details
            key={saved.itemId}
            className="rounded-card border-2 border-sombra bg-creme p-4 shadow-chapa"
          >
            <summary className="flex cursor-pointer items-start gap-2.5 font-semibold text-tinta">
              {saved.feedback && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs",
                    saved.feedback.correct === null
                      ? "bg-uva-solido text-sobre-uva"
                      : saved.feedback.correct
                        ? "bg-verde-solido text-sobre-verde"
                        : "bg-coral-solido text-sobre-coral",
                  )}
                >
                  {saved.feedback.correct === null ? "✎" : saved.feedback.correct ? "✓" : "↗"}
                </span>
              )}
              {view.lesson.items.find((item) => item.id === saved.itemId)?.prompt}
            </summary>
            <ItemFigure
              figure={view.lesson.items.find((item) => item.id === saved.itemId)?.figure}
            />
            <p className="mt-3 text-sm whitespace-pre-wrap wrap-anywhere text-tinta-suave">
              Sua resposta:{" "}
              {responseLabel(
                view.lesson.items.find((item) => item.id === saved.itemId),
                saved.chosen,
              )}{" "}
              · {saved.helpCount ? "Com pistas" : "Sem pistas nesta tentativa"}
            </p>
            {saved.feedback && (
              <p className="mt-1.5 text-sm text-tinta">{saved.feedback.explanation}</p>
            )}
            {saved.feedback?.rubric && (
              <ul className="mt-2 grid gap-1 pl-5 text-sm text-tinta-suave [&>li]:list-disc">
                {saved.feedback.rubric.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            )}
            {saved.feedback?.solution && saved.feedback.correct === null && (
              <p className="mt-2 text-sm text-tinta">
                <strong>Uma resposta possível:</strong> {saved.feedback.solution}
              </p>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
