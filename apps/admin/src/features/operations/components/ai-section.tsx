import { Empty, Mono, Note, Panel, SectionTitle } from "@/components/blocks";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import type { AiRow } from "../service";

export function AiSection({ rows }: { rows: AiRow[] }) {
  return (
    <Panel labelledBy="ia">
      <SectionTitle id="ia" aside="últimos 7 dias">
        IA na semana
      </SectionTitle>
      {rows.length === 0 ? (
        <Empty>Nenhuma tarefa de IA nos últimos 7 dias.</Empty>
      ) : (
        <ul className="m-0 grid list-none p-0">
          {rows.map((row) => (
            <li
              key={row.app}
              className="grid gap-1 border-t border-line-soft py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
            >
              <strong>{row.appName}</strong>
              <span className="text-[13px] text-ink-soft sm:text-right">
                <Mono>{formatNumber(row.tasks)}</Mono> tarefas
                {row.active ? `, ${formatNumber(row.active)} em andamento` : ""}
                {row.failureRate !== null ? (
                  <>
                    {" · "}
                    <Mono>{formatPercent(row.failureRate)}</Mono> devolveram o crédito
                  </>
                ) : null}
                <span className="block">
                  {row.costCoverage !== null && row.costCoverage > 0 ? (
                    <>
                      <Mono>{formatUSD(row.reportedUsd)}</Mono> informados em{" "}
                      <Mono>{formatPercent(row.costCoverage)}</Mono> das execuções
                    </>
                  ) : (
                    "Custo não informado pelo provedor."
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Note>
        Tarefas vêm das reservas de crédito; o custo, das execuções em que o provedor informou o
        valor. O que o provedor não informa nunca vira zero.
      </Note>
    </Panel>
  );
}
