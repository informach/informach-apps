import { Mono, Note, Panel, SectionTitle } from "@/components/blocks";
import { StatusPill } from "@/components/status";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ROUTINE_STATE, runDuration } from "../labels";
import { failureText, summaryText } from "../routines";
import type { RoutineRow } from "../service";

function resultText(row: RoutineRow): string {
  if (row.state === "paused") return row.pausedNote ?? "parada";
  if (!row.last) return "nenhuma execução registrada ainda";
  if (row.last.ok === false) return failureText(row.last.errorName);
  if (row.last.ok === null) return "ainda sem resultado";
  return summaryText(row.last.summary);
}

export function RoutinesSection({ routines, now }: { routines: RoutineRow[]; now: Date }) {
  const attention = routines.filter((row) =>
    ["failed", "interrupted", "late"].includes(row.state),
  ).length;
  return (
    <Panel labelledBy="rotinas">
      <SectionTitle
        id="rotinas"
        aside={
          attention === 0
            ? "nenhuma atrasada ou com falha"
            : attention === 1
              ? "1 precisa de atenção"
              : `${attention} precisam de atenção`
        }
      >
        Rotinas agendadas
      </SectionTitle>
      <ul className="m-0 grid list-none p-0">
        {routines.map((row) => {
          const state = ROUTINE_STATE[row.state];
          const duration = row.last ? runDuration(row.last.startedAt, row.last.finishedAt) : null;
          return (
            <li
              key={`${row.app}/${row.job}`}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-t border-line-soft py-3 first:border-t-0"
            >
              <span className="grid min-w-0 flex-[1_1_260px] gap-0.5">
                <strong className="text-[15px]">{row.label}</strong>
                <span className="text-[13px] text-ink-muted">
                  {row.appName} · {row.schedule} · <Mono>{row.job}</Mono>
                </span>
              </span>
              <span className="grid min-w-0 flex-[1_1_240px] justify-items-start gap-1 sm:justify-items-end sm:text-right">
                <StatusPill tone={state.tone}>{state.label}</StatusPill>
                <span className="text-[13px] text-ink-soft">
                  {row.last ? (
                    <>
                      {formatDateTime(row.last.startedAt)} (
                      {formatRelative(row.last.startedAt, now)}){duration ? ` · ${duration}` : ""}
                    </>
                  ) : null}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {resultText(row)}
                  {row.failures24h > 0
                    ? ` · ${row.failures24h} de ${row.runs24h} com falha em 24 horas`
                    : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Note>
        Cada rotina grava a execução em ops.job_runs, só com números e o nome da classe de erro.
        Atrasada quer dizer que a última execução passou do prazo da rotina: duas vezes e meia a
        frequência nas de até uma hora, a frequência mais duas horas nas de seis em seis horas e nas
        diárias, e oito dias nas semanais. Sem fim registrado depois de 30 minutos (60 no resumo
        semanal das famílias), a execução conta como parada no meio.
      </Note>
    </Panel>
  );
}
