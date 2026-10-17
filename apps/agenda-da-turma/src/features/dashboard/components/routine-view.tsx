"use client";

import { Backpack, Flame } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { DayClosedIllustration } from "@/components/illustrations";
import { ActivitySheet } from "@/features/unified-activities/components/activity-list";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import { formatDayLoad, summarizeDayLoad } from "@/features/unified-activities/load";
import type { RoutineBucketKey, RoutineBuckets } from "@/features/unified-activities/routine-types";
import { addDaysIso } from "../date";
import { weekdayLong } from "../day-labels";
import { countWord, routineSummary } from "../routine-summary";
import type { TodaySubjectsView } from "../today-subjects-service";
import { WeekStrip, type WeekStripDay } from "./week-strip";

type Props = {
  todayIso: string;
  buckets: RoutineBuckets;
  /** Matérias de amanhã por criança. */
  tomorrowSchedule: TodaySubjectsView[];
  /** Itens de "levar sempre", por `${profileId}:${subjectId}`. */
  tomorrowKits: Record<string, string[]>;
  /** Falso à noite: a mochila sobe para o topo da página e sai de "Amanhã". */
  showBackpackRow: boolean;
  doneToday: number;
  /** Dias seguidos em que a casa cuidou de alguma coisa. Nunca por criança. */
  streakDays: number;
  streakCountsToday: boolean;
  currentUserId: string;
  profileFilter: string | null;
  /** "Hoje na escola", que carrega à parte (Suspense) e entra entre as duas folhas. */
  school?: ReactNode;
  /** O convite do resumo, em uma linha, só depois que a família já tem rotina. */
  commitment?: ReactNode;
};

/**
 * Hoje: a página do dia.
 *
 * Uma frase de resumo, "Para hoje", o que tem na escola, "Amanhã" com a
 * mochila e a semana numa linha. Saíram os quatro números do topo (repetiam as
 * listas logo abaixo), o progresso por criança (porcentagens lado a lado viram
 * comparação entre irmãos) e o rodapé jurídico (o aviso de que "feito" não
 * avisa a escola aparece uma vez, no primeiro Feito).
 *
 * Os três buckets continuam vindo de `getRoutineSnapshot`, a mesma projeção da
 * lista de Atividades e da vez da criança: nada aqui é consulta própria.
 */
export function RoutineView({
  todayIso,
  buckets,
  tomorrowSchedule,
  tomorrowKits,
  showBackpackRow,
  currentUserId,
  profileFilter,
  doneToday: initialDoneToday,
  streakDays,
  streakCountsToday,
  school,
  commitment,
}: Props) {
  const [doneToday, setDoneToday] = useState(initialDoneToday);
  /**
   * O que saiu da tela antes de o servidor responder.
   *
   * O card some sozinho quando conclui, mas o array continua vindo do
   * servidor: sem rastrear aqui, a contagem e a frase de resumo continuariam
   * contando o que já foi feito até o `router.refresh()` voltar.
   */
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  // Zera o escondido quando o servidor manda uma lista nova (ajuste durante o
  // render, não `useEffect`: o efeito mostraria um quadro com a lista nova e o
  // conjunto velho).
  const [seenBuckets, setSeenBuckets] = useState(buckets);
  if (seenBuckets !== buckets) {
    setSeenBuckets(buckets);
    setHiddenKeys(new Set());
  }
  useEffect(() => setDoneToday(initialDoneToday), [initialDoneToday]);

  const visible = (key: RoutineBucketKey) =>
    buckets[key].filter((entry) => !hiddenKeys.has(entry.key));
  const attention = visible("attention");
  const tomorrow = visible("tomorrow");
  const week = visible("week");
  const late = attention.filter((entry) => entry.item.dueAt && entry.item.dueAt < todayIso).length;

  const onStatusSuccess =
    (key: string) => (_entry: unknown, _previous: "pending" | "done", next: "pending" | "done") => {
      setHiddenKeys((current) => {
        const nextSet = new Set(current);
        if (next === "done") nextSet.add(key);
        else nextSet.delete(key);
        return nextSet;
      });
      // Concluir conta pelo DIA da conclusão, não pelo prazo: uma atividade sem
      // prazo cuidada hoje fecha o dia igual.
      setDoneToday((current) => Math.max(0, current + (next === "done" ? 1 : -1)));
    };

  // A semana a partir de hoje, de TODOS os buckets: a mesma janela do resumo
  // de domingo (`LOAD_WINDOW_DAYS`), para as duas não discordarem sobre um dia.
  const all = [...attention, ...tomorrow, ...week];
  const load = summarizeDayLoad(
    all.map((entry) => ({
      dueAt: entry.item.dueAt,
      estimatedMinutes: entry.item.estimatedMinutes,
      status: entry.item.status,
      type: entry.item.type,
    })),
    { fromIso: todayIso },
  );
  const days: WeekStripDay[] = load.map((day) => ({
    iso: day.iso,
    full: day.level === "cheio",
    dots: all
      .filter((entry) => entry.item.dueAt === day.iso)
      .map((entry) => ({ key: entry.key, color: entry.item.subjectColorIndex })),
  }));
  // A lista da semana cobre os mesmos dias da faixa. O bucket vai um dia além
  // (o sétimo depois de hoje); esse fica em "Ver tudo", no calendário, em vez
  // de aparecer na lista sem um dia correspondente na faixa logo acima.
  const stripEnd = days[days.length - 1]?.iso;
  const weekShown = stripEnd
    ? week.filter((entry) => !entry.item.dueAt || entry.item.dueAt <= stripEnd)
    : week;
  const tomorrowHasClasses = tomorrowSchedule.some((view) => view.subjects.length > 0);
  const fullDays = load.filter((day) => day.level === "cheio" && day.iso > todayIso);
  const firstFull = fullDays[0];
  const prepareOnFullDay = firstFull
    ? all.find(
        (entry) =>
          entry.item.dueAt === firstFull.iso &&
          (entry.item.type === "exam" || entry.item.type === "project"),
      )
    : undefined;
  const tomorrowIso = addDaysIso(todayIso, 1);

  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-foreground/90">
        {routineSummary({
          forToday: attention.length,
          late,
          tomorrow: tomorrow.length,
          doneToday,
        })}
      </p>

      {/*
        No telefone é uma coluna, na ordem do dia: Para hoje, Hoje na escola,
        Amanhã, a semana. No computador são duas, como no canvas: o que fazer à
        esquerda, a escola e a semana à direita. As colunas viram
        `display: contents` no telefone e os blocos se ordenam pelo `order`.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-1 empty:hidden">
            {attention.length > 0 ? (
              <ActivitySheet
                title="Para hoje"
                labelledBy="routine-today"
                aside={attention.length === 1 ? "1 em aberto" : `${attention.length} em aberto`}
              >
                {attention.map((entry) => (
                  <li key={entry.key}>
                    <UnifiedActivityCard
                      entry={entry}
                      currentUserId={currentUserId}
                      optimisticHideWhenDone
                      onStatusSuccess={onStatusSuccess(entry.key)}
                    />
                  </li>
                ))}
              </ActivitySheet>
            ) : doneToday > 0 ? (
              <DayClosed
                doneToday={doneToday}
                tomorrowCount={tomorrow.length}
                streakDays={streakCountsToday || doneToday === 0 ? streakDays : streakDays + 1}
              />
            ) : null}
          </div>

          <ActivitySheet
            title={`Amanhã, ${weekdayLong(tomorrowIso).toLowerCase()}`}
            labelledBy="routine-tomorrow"
            aside={tomorrow.length > 0 ? String(tomorrow.length) : undefined}
            className="order-3"
          >
            {tomorrow.map((entry) => (
              <li key={entry.key}>
                <UnifiedActivityCard
                  entry={entry}
                  currentUserId={currentUserId}
                  optimisticHideWhenDone
                  onStatusSuccess={onStatusSuccess(entry.key)}
                />
              </li>
            ))}
            {showBackpackRow ? (
              <TomorrowBackpackRow schedule={tomorrowSchedule} kits={tomorrowKits} />
            ) : null}
            {tomorrow.length === 0 ? (
              <li className="border-t border-foreground/15 px-4 py-3 text-sm text-muted-foreground sm:px-5">
                {!tomorrowHasClasses
                  ? "Amanhã está livre por enquanto."
                  : showBackpackRow
                    ? "Nenhuma atividade marcada para amanhã."
                    : "Nenhuma atividade marcada. A mochila de amanhã está no topo da página."}
              </li>
            ) : null}
          </ActivitySheet>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-2 empty:hidden">{school}</div>

          <section
            aria-labelledby="routine-week"
            className="order-4 space-y-3 rounded-[20px] border border-foreground/15 bg-background p-4 sm:p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="routine-week" className="text-xl font-extrabold tracking-tight">
                A semana
              </h2>
              <Link
                href={`/calendario?view=week${profileFilter ? `&perfil=${profileFilter}` : ""}`}
                className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink"
              >
                Ver tudo
              </Link>
            </div>
            <WeekStrip days={days} todayIso={todayIso} profileFilter={profileFilter} />
            {firstFull ? (
              <div className="space-y-1 rounded-xl bg-chart-4/10 px-3.5 py-3 text-[15px] leading-snug">
                <p>
                  <strong className="text-chart-4-ink">
                    {weekdayLong(firstFull.iso)} está {isWeekend(firstFull.iso) ? "cheio" : "cheia"}
                    :
                  </strong>{" "}
                  {formatDayLoad(firstFull)}.
                  {fullDays.length > 1
                    ? ` Também puxado: ${fullDays
                        .slice(1)
                        .map((day) => weekdayLong(day.iso).toLowerCase())
                        .join(", ")}.`
                    : ""}
                </p>
                {prepareOnFullDay ? (
                  <Link
                    href={`/atividades/${prepareOnFullDay.item.id}#plano-de-estudo`}
                    className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink"
                  >
                    Dividir o estudo nos dias livres
                  </Link>
                ) : null}
              </div>
            ) : null}
            {weekShown.length > 0 ? (
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-primary-ink [&::-webkit-details-marker]:hidden">
                  {weekShown.length === 1
                    ? "Ver a atividade do resto da semana"
                    : `Ver as ${weekShown.length} atividades do resto da semana`}
                </summary>
                <ActivitySheet className="mt-2">
                  {weekShown.map((entry) => (
                    <li key={entry.key}>
                      <UnifiedActivityCard
                        entry={entry}
                        currentUserId={currentUserId}
                        optimisticHideWhenDone
                        onStatusSuccess={onStatusSuccess(entry.key)}
                      />
                    </li>
                  ))}
                </ActivitySheet>
              </details>
            ) : null}
          </section>

          <div className="order-5 empty:hidden">{commitment}</div>
        </div>
      </div>
    </div>
  );
}

/** Sábado e domingo são "cheio"; os outros dias são "-feira", e ficam "cheia". */
function isWeekend(iso: string) {
  const weekday = weekdayLong(iso).toLowerCase();
  return weekday === "sábado" || weekday === "domingo";
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A mochila dentro de "Amanhã", de dia. À noite ela sobe para o topo da página. */
function TomorrowBackpackRow({
  schedule,
  kits,
}: {
  schedule: TodaySubjectsView[];
  kits: Record<string, string[]>;
}) {
  const withClasses = schedule.filter((view) => view.subjects.length > 0);
  if (withClasses.length === 0) return null;
  return (
    <li className="flex items-start gap-3 border-t border-foreground/15 px-4 py-3 sm:px-5">
      <Backpack className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1 text-[15px] leading-snug">
        <p className="font-bold">Na mochila de amanhã</p>
        {withClasses.map((view) => {
          const items = view.subjects.flatMap(
            (subject) => kits[`${view.profileId}:${subject.id}`] ?? [],
          );
          return (
            <p key={view.profileId} className="break-words">
              <span className="font-semibold">{view.profileName}:</span>{" "}
              {view.subjects.map((subject) => subject.name).join(", ")}
              {items.length ? (
                <span className="text-muted-foreground">. Leva {items.join(", ")}</span>
              ) : null}
            </p>
          );
        })}
      </div>
    </li>
  );
}

/**
 * O fecho do dia: aparece só quando houve o que cuidar (`doneToday > 0`), que é
 * o que separa "o dia fechou" de "o dia nunca teve nada". Sem pontos e sem
 * comparação entre crianças: o reconhecimento é da casa.
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
    <section className="flex items-center gap-4 rounded-[20px] border border-chart-2/40 bg-background p-4 shadow-solid sm:p-5">
      <DayClosedIllustration className="max-w-[96px] shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-lg font-extrabold tracking-tight">Dia fechado</p>
        <p className="text-sm text-muted-foreground">
          {doneToday === 1
            ? "Uma coisa cuidada hoje."
            : `${capitalize(countWord(doneToday))} coisas cuidadas hoje.`}{" "}
          {tomorrowCount === 0 ? "Amanhã está livre por enquanto." : "Amanhã está logo abaixo."}
        </p>
        {/* A sequência é da FAMÍLIA, a partir de dois dias, e nunca por criança:
            um número por filho viraria placar entre irmãos. */}
        {streakDays >= 2 ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Flame className="size-4 shrink-0 text-chart-4-ink" aria-hidden />
            {streakDays} dias seguidos com a casa em dia
          </p>
        ) : null}
      </div>
    </section>
  );
}
