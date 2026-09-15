"use client";

import { cn } from "@informach/ui/lib/utils";
import { Backpack, CalendarDays, CircleCheck, type LucideIcon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
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
  /** Matérias de amanhã por criança — alimenta a mochila. */
  tomorrowSchedule: TodaySubjectsView[];
  currentUserId: string;
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
}: Props) {
  const [counters, setCounters] = useState(initialCounters);

  // O servidor é a verdade: depois do `router.refresh()` disparado pelo card,
  // os contadores reais chegam e substituem o ajuste otimista.
  useEffect(() => setCounters(initialCounters), [initialCounters]);

  return (
    <div className="space-y-8">
      <KpiCards counters={counters} />
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
                    onStatusSuccess={(changed: ActivityOverviewItem, previous, next) =>
                      setCounters((current) =>
                        applyRoutineStatusChange(
                          current,
                          todayIso,
                          overviewDueAt(changed),
                          previous,
                          next,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-chart-2/25 bg-chart-2/5 p-5">
                <CircleCheck className="size-5 shrink-0 text-chart-2" aria-hidden />
                <p className="text-sm text-muted-foreground">{empty}</p>
              </div>
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
 * Mochila de amanhã: as matérias que cada criança tem no dia seguinte.
 *
 * É a pergunta concreta das nove da noite — "o que entra na mochila?" — e
 * sai de dado que já existe: o horário cadastrado, com o revezamento
 * quinzenal aplicado. Os materiais pedidos aparecem logo abaixo, como
 * atividades do bucket.
 */
function TomorrowBackpack({ schedule }: { schedule: TodaySubjectsView[] }) {
  const withClasses = schedule.filter((view) => view.subjects.length > 0);
  if (withClasses.length === 0) return null;
  return (
    <div className="rounded-2xl border border-chart-1/25 bg-chart-1/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Backpack className="size-4 shrink-0 text-chart-1" aria-hidden />
        Na mochila de amanhã
      </p>
      <ul className="mt-2 space-y-1">
        {withClasses.map((view) => (
          <li key={view.profileId} className="break-words text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{view.profileName}:</span>{" "}
            {view.subjects.map((subject) => subject.name).join(" · ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
