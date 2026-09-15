"use client";

import { cn } from "@informach/ui/lib/utils";
import { Backpack, CalendarDays, CircleCheck, type LucideIcon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { DayClosedIllustration } from "@/components/illustrations";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import {
  type ActivityOverviewItem,
  overviewDueAt,
} from "@/features/unified-activities/overview-types";
import type { RoutineBucketKey, RoutineBuckets } from "@/features/unified-activities/routine-types";
import { applyRoutineStatusChange } from "../routine-optimistic";
import type { TodaySubjectsView } from "../today-subjects-service";
import type { DashboardCounters } from "../types";
import { KpiCards } from "./kpi-cards";
import { TomorrowBackpack } from "./tomorrow-backpack";

type BucketSpec = {
  key: RoutineBucketKey;
  title: string;
  description: string;
  empty: string;
  Icon: LucideIcon;
  color: number;
};

const BUCKETS: BucketSpec[] = [
  {
    key: "attention",
    title: "Para cuidar hoje",
    description: "Atividades de hoje, prazos que passaram e datas a confirmar.",
    empty:
      "Tudo certo por aqui! Nenhuma atividade de hoje ou data a confirmar entre os itens cadastrados.",
    Icon: Sun,
    color: 4,
  },
  {
    key: "tomorrow",
    title: "Preparar para amanhã",
    description: "Uma olhada na mochila, nas tarefas e nos combinados do próximo dia.",
    empty:
      "Amanhã está livre na agenda por enquanto. Vale conferir se chegou alguma atividade nova.",
    Icon: Backpack,
    color: 1,
  },
  {
    key: "week",
    title: "O resto da semana",
    description: "Tempo para se organizar, estudar e pedir uma ajudinha.",
    empty: "Nenhuma atividade cadastrada para os próximos dias. Espaço para o que vem por aí!",
    Icon: CalendarDays,
    color: 3,
  },
];

type Props = {
  todayIso: string;
  buckets: RoutineBuckets;
  initialCounters: DashboardCounters;
  /**
   * Matérias de amanhã por criança. Vazio quando a mochila já subiu para o topo
   * da página — à noite ela é o assunto, e repeti-la aqui seria a segunda lista
   * que esta tela passou a não ter.
   */
  tomorrowSchedule: TodaySubjectsView[];
  /** Quantas a família concluiu hoje — o que distingue fechar de nunca ter tido. */
  doneToday: number;
  currentUserId: string;
  /** A criança filtrada viaja para a lista junto com o recorte dos KPIs. */
  profileFilter: string | null;
};

/**
 * A rotina da família: KPIs e os três buckets, ambos vindos da mesma consulta
 * que alimenta a lista de `/atividades`. Um card só, um jeito só de concluir —
 * antes a mesma atividade aparecia aqui num formato e, logo abaixo, num bloco
 * recolhido, em outro.
 */
export function RoutineView({
  todayIso,
  buckets,
  initialCounters,
  tomorrowSchedule,
  currentUserId,
  profileFilter,
  doneToday: initialDoneToday,
}: Props) {
  const [counters, setCounters] = useState(initialCounters);
  const [doneToday, setDoneToday] = useState(initialDoneToday);

  // O servidor é a verdade: depois do `router.refresh()` disparado pelo card,
  // os contadores reais chegam e substituem o ajuste otimista.
  useEffect(() => setCounters(initialCounters), [initialCounters]);
  useEffect(() => setDoneToday(initialDoneToday), [initialDoneToday]);

  return (
    <div className="space-y-8">
      <KpiCards counters={counters} profileFilter={profileFilter} />
      {BUCKETS.map(({ key, title, description, empty, Icon, color }) => {
        const entries = buckets[key];
        return (
          <section key={key} className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                  getSubjectIconClassByIndex(color),
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                  {entries.length > 0 ? (
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                        getSubjectTintedClassByIndex(color),
                      )}
                    >
                      {entries.length} {entries.length === 1 ? "atividade" : "atividades"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
            {key === "tomorrow" ? <TomorrowBackpack schedule={tomorrowSchedule} /> : null}
            {entries.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((entry) => (
                  <UnifiedActivityCard
                    key={entry.key}
                    entry={entry}
                    currentUserId={currentUserId}
                    optimisticHideWhenDone
                    onStatusSuccess={(changed: ActivityOverviewItem, previous, next) => {
                      setCounters((current) =>
                        applyRoutineStatusChange(
                          current,
                          todayIso,
                          overviewDueAt(changed),
                          previous,
                          next,
                        ),
                      );
                      // Concluir conta pelo DIA da conclusão, não pelo prazo:
                      // uma atividade sem prazo cuidada hoje fecha o dia
                      // igual. Sem isto, marcar a última pendência não trazia
                      // o fecho até o servidor responder.
                      setDoneToday((current) => Math.max(0, current + (next === "done" ? 1 : -1)));
                    }}
                  />
                ))}
              </div>
            ) : key === "attention" && doneToday > 0 ? (
              <DayClosed doneToday={doneToday} tomorrowCount={buckets.tomorrow.length} />
            ) : (
              // Vazio não é objeto: deixou de ser cartão com borda e fundo
              // para não competir em peso com os cartões que têm conteúdo.
              <p className="flex items-center gap-2.5 px-1 py-2 text-sm text-muted-foreground">
                <CircleCheck className="size-4 shrink-0 text-chart-2-ink" aria-hidden />
                {empty}
              </p>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        “Feito em casa” registra a organização da família. Entregas e autorizações à escola
        continuam no canal oficial. As listas consideram os itens cadastrados; novos recados e
        retificações precisam ser importados.
      </p>
    </div>
  );
}

/**
 * O fecho do dia.
 *
 * Concluída a última pendência de hoje, esta seção mostrava "Tudo certo por
 * aqui!" — exatamente a mesma caixa que aparece para quem nunca cadastrou nada.
 * O esforço da família não era reconhecido em lugar nenhum, e o app abria com
 * trabalho e terminava com trabalho.
 *
 * Só aparece quando houve o que cuidar: `doneToday > 0` é o que separa "o dia
 * fechou" de "o dia nunca teve nada". Sem pontos e sem comparação entre
 * crianças — o reconhecimento é da casa.
 */
function DayClosed({ doneToday, tomorrowCount }: { doneToday: number; tomorrowCount: number }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-chart-2/30 bg-card p-6 text-center shadow-solid">
      <DayClosedIllustration className="max-w-[150px]" />
      <div className="space-y-1">
        <p className="text-xl font-bold tracking-tight">Dia fechado</p>
        <p className="text-sm text-muted-foreground">
          {doneToday === 1
            ? "Uma atividade cuidada hoje. Nada mais pendente para o dia."
            : `${doneToday} atividades cuidadas hoje. Nada mais pendente para o dia.`}
        </p>
      </div>
      <p className="text-sm font-medium">
        {tomorrowCount === 0
          ? "Amanhã está livre por enquanto."
          : tomorrowCount === 1
            ? "Amanhã tem 1 atividade — ela está logo abaixo."
            : `Amanhã tem ${tomorrowCount} atividades — elas estão logo abaixo.`}
      </p>
    </div>
  );
}
