"use client";

import { cn } from "@informach/ui/lib/utils";
import {
  Backpack,
  CalendarDays,
  CircleCheck,
  Flame,
  type LucideIcon,
  Sun,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DayClosedIllustration } from "@/components/illustrations";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import { formatBucketEstimate } from "@/features/unified-activities/estimate";
import { formatDayLoad, summarizeDayLoad } from "@/features/unified-activities/load";
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

const WEEKDAY_SHORT = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;
/** "Terça (30/09)" a partir de "YYYY-MM-DD", sem criar Date com offset. */
function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekday = WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${weekday} (${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")})`;
}

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
  /** Itens de "levar sempre", por `${profileId}:${subjectId}`. */
  tomorrowKits: Record<string, string[]>;
  /** Quantas a família concluiu hoje — o que distingue fechar de nunca ter tido. */
  doneToday: number;
  /** Dias seguidos em que a casa cuidou de alguma coisa. Nunca por criança. */
  streakDays: number;
  /**
   * Se hoje já entrava na conta quando o servidor respondeu.
   *
   * Sem isto a sequência nascia defasada em 1 justamente no fecho otimista: a
   * página carregou antes da primeira conclusão do dia, então a contagem
   * começou em ontem — e o selo aparecia dizendo N quando a verdade já era
   * N+1, até o `router.refresh()` chegar.
   */
  streakCountsToday: boolean;
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
  tomorrowKits,
  currentUserId,
  profileFilter,
  doneToday: initialDoneToday,
  streakDays,
  streakCountsToday,
}: Props) {
  const [counters, setCounters] = useState(initialCounters);
  const [doneToday, setDoneToday] = useState(initialDoneToday);
  /**
   * O que saiu da tela antes de o servidor responder.
   *
   * `UnifiedActivityCard` se esconde sozinho quando conclui (`return null`),
   * mas o array continua vindo do servidor — sem rastrear aqui, a pastilha do
   * cabeçalho continuava dizendo "1 atividade" sobre um grid vazio, e o fecho
   * do dia só aparecia quando o `router.refresh()` voltasse.
   */
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  /**
   * Zera o escondido quando o servidor manda uma lista nova.
   *
   * Ajuste durante o render, e não `useEffect`: o efeito só rodaria depois de
   * um render com a lista nova e o conjunto velho, e nesse quadro um item que
   * voltou a ficar pendente apareceria escondido. `buckets` só muda de
   * identidade quando a resposta do servidor troca.
   */
  const [seenBuckets, setSeenBuckets] = useState(buckets);
  if (seenBuckets !== buckets) {
    setSeenBuckets(buckets);
    setHiddenKeys(new Set());
  }

  // O servidor é a verdade: depois do `router.refresh()` disparado pelo card,
  // os contadores reais chegam e substituem o ajuste otimista.
  useEffect(() => setCounters(initialCounters), [initialCounters]);
  useEffect(() => setDoneToday(initialDoneToday), [initialDoneToday]);

  return (
    <div className="space-y-8">
      <KpiCards counters={counters} profileFilter={profileFilter} />
      {BUCKETS.map(({ key, title, description, empty, Icon, color }) => {
        const entries = buckets[key].filter((entry) => !hiddenKeys.has(entry.key));
        // "3 atividades · ~45 min" responde a pergunta das sete da noite. O
        // rótulo diz quantas foram estimadas quando nem todas foram — senão o
        // número viraria promessa falsa.
        const estimate = formatBucketEstimate(entries.map((e) => e.item.estimatedMinutes));
        const fullDays =
          key === "week"
            ? summarizeDayLoad(
                entries.map((entry) => ({
                  dueAt: entry.item.dueAt,
                  estimatedMinutes: entry.item.estimatedMinutes,
                  status: entry.item.status,
                })),
                { fromIso: todayIso, days: 8 },
              ).filter((day) => day.level === "cheio")
            : [];
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
                  {estimate ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <Timer className="size-3.5 shrink-0" aria-hidden />
                      {estimate}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                {/* O semáforo da semana: saber na sexta que a terça tem três
                    entregas é o que permite adiantar no fim de semana. Saber na
                    terça de manhã não serve para nada. */}
                {key === "week" && fullDays.length ? (
                  <p className="mt-1 text-sm font-medium text-chart-4-ink">
                    {fullDays.length === 1
                      ? `${weekdayLabel(fullDays[0]?.iso ?? "")} está cheia: ${formatDayLoad(fullDays[0] ?? { iso: "", count: 0, minutes: 0, level: "leve" })}.`
                      : `Dias mais puxados: ${fullDays
                          .map((day) => `${weekdayLabel(day.iso)} (${formatDayLoad(day)})`)
                          .join(", ")}.`}
                  </p>
                ) : null}
              </div>
            </div>
            {key === "tomorrow" ? (
              <TomorrowBackpack schedule={tomorrowSchedule} kits={tomorrowKits} />
            ) : null}
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
              <DayClosed
                doneToday={doneToday}
                tomorrowCount={
                  buckets.tomorrow.filter((entry) => !hiddenKeys.has(entry.key)).length
                }
                streakDays={streakCountsToday || doneToday === 0 ? streakDays : streakDays + 1}
              />
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
function DayClosed({
  doneToday,
  tomorrowCount,
  streakDays,
}: {
  doneToday: number;
  tomorrowCount: number;
  streakDays: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-chart-2/30 bg-card p-6 text-center shadow-solid">
      <DayClosedIllustration className="max-w-[150px]" />
      <div className="space-y-1">
        <p className="text-xl font-bold tracking-tight">Dia fechado</p>
        {/* `doneToday` é sempre ≥ 1 aqui: o cartão só renderiza sob essa
            condição — é ela que separa "o dia fechou" de "nunca houve nada". */}
        <p className="text-sm text-muted-foreground">
          {doneToday === 1
            ? "Uma atividade cuidada hoje. Nada mais pendente para o dia."
            : `${doneToday} atividades cuidadas hoje. Nada mais pendente para o dia.`}
        </p>
      </div>
      {/*
        A sequência é da FAMÍLIA. Aparece a partir de dois dias, porque "1 dia
        seguido" não é sequência — e nunca por criança: um número por filho
        viraria placar entre irmãos dentro de casa.
      */}
      {streakDays >= 2 ? (
        <p className="inline-flex items-center gap-2 rounded-full border border-chart-4/40 bg-chart-4/15 px-3 py-1 text-sm font-semibold">
          <Flame className="size-4 shrink-0 text-chart-4-ink" aria-hidden />
          Vocês cuidaram da rotina {streakDays} dias seguidos
        </p>
      ) : null}
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
