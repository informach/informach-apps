import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { joinPhrases } from "../logic";
import { inProduct } from "../phrases";
import type { AiSummary } from "../service";

function Big({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid">
      <strong className="tabular font-mono text-[26px] leading-tight font-semibold">{value}</strong>
      <span className="text-[13px] text-ink-muted">{label}</span>
    </span>
  );
}

/** "Custo de IA na semana". Só entra o custo que o provedor informa; o resto aparece à parte, nunca como zero. */
export function AiWeek({ ai }: { ai: AiSummary }) {
  const withoutCost = ai.runsWithoutCost.reduce((sum, row) => sum + row.total, 0);
  return (
    <section
      aria-labelledby="ia"
      className="flex flex-wrap items-center gap-5 rounded-[18px] border border-line-warm bg-surface p-5"
    >
      <div className="grid flex-[1_1_260px] gap-1">
        <h2 id="ia" className="m-0 text-lg font-extrabold">
          Custo de IA na semana
        </h2>
        <p className="m-0 text-sm text-ink-muted">
          Só entra o custo que o provedor informa. A parte sem custo informado aparece separada,
          nunca como zero.
        </p>
      </div>
      {ai.runs === 0 && ai.tasks === 0 ? (
        <p className="m-0 flex-[2_1_420px] text-sm text-ink-soft">
          Nenhuma tarefa de IA nos últimos 7 dias.
        </p>
      ) : (
        <div className="grid flex-[2_1_420px] grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Big
            value={ai.runsWithCost > 0 ? formatUSD(ai.costUsd) : "não informado"}
            label="custo informado"
          />
          <Big
            value={ai.runs > 0 ? formatPercent(ai.runsWithCost / ai.runs) : "sem execuções"}
            label="das execuções com custo informado"
          />
          <Big value={formatNumber(ai.tasks)} label="tarefas no Cozya e na Agenda" />
          <Big
            value={
              ai.failureRate !== null
                ? formatPercent(ai.failureRate)
                : ai.tasks > 0
                  ? "em andamento"
                  : "nenhuma"
            }
            label="das encerradas falharam e devolveram o crédito"
          />
        </div>
      )}
      {withoutCost > 0 ? (
        <p className="m-0 basis-full text-[13px] text-ink-muted">
          Sem custo informado:{" "}
          {joinPhrases(
            ai.runsWithoutCost.map(
              (row) =>
                `${formatNumber(row.total)} ${row.total === 1 ? "execução" : "execuções"} ${inProduct(row.app)}`,
            ),
          )}
          .
        </p>
      ) : null}
    </section>
  );
}
