"use client";

import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { BackpackIcon } from "@/components/icons/canvas-icons";
import { DayClosedIllustration } from "@/components/illustrations";
import { upcomingWeekAnchorIso } from "@/features/calendar/date";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { ActivitySheet, SHEET_LINK } from "@/features/unified-activities/components/activity-list";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import { summarizeDayLoad } from "@/features/unified-activities/load";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import type { RoutineBucketKey, RoutineBuckets } from "@/features/unified-activities/routine-types";
import { addDaysIso } from "../date";
import { weekdayLong } from "../day-labels";
import {
  backpackLine,
  backpackSentence,
  buildBackpack,
  fullDayCount,
  fullDayDetail,
  weekRows,
} from "../page-of-day";
import { describeThing, eveningSentence, joinWords, routineSummary } from "../routine-summary";
import type { TodaySubjectsView } from "../today-subjects-service";
import { WeekStrip, type WeekStripDay } from "./week-strip";

type Props = {
  todayIso: string;
  buckets: RoutineBuckets;
  /** Matérias de amanhã por criança. */
  tomorrowSchedule: TodaySubjectsView[];
  /** Itens de "levar sempre", por `${profileId}:${subjectId}`. */
  tomorrowKits: Record<string, string[]>;
  /** Depois das 18h a página vira a mochila de amanhã. */
  evening: boolean;
  doneToday: number;
  /** Dias seguidos em que a casa cuidou de alguma coisa. Nunca por criança. */
  streakDays: number;
  streakCountsToday: boolean;
  currentUserId: string;
  profileFilter: string | null;
  /** A saudação e a data (`TodayHeader`), com as pílulas ao lado no computador. */
  header: ReactNode;
  /** As pílulas de criança no celular, logo depois da frase de resumo. */
  pills: ReactNode;
  /** Primeiros passos, recado sem conferir e o aviso de boas-vindas. */
  notices: ReactNode;
  /** "Hoje na escola", que carrega à parte (Suspense). */
  school: ReactNode;
  /** Atividades da turma esperando aceite. */
  shared: ReactNode;
  /** O convite do resumo, só depois que a família já tem rotina. */
  commitment?: ReactNode;
};

const ORDINALS = [
  "",
  "primeiro",
  "segundo",
  "terceiro",
  "quarto",
  "quinto",
  "sexto",
  "sétimo",
  "oitavo",
  "nono",
  "décimo",
];

/**
 * Hoje: a página do dia, como nas pranchas do canvas.
 *
 * De dia, no celular: a frase de resumo, as pílulas de criança, "Para hoje",
 * "Hoje na escola", "Amanhã" com a mochila e "A semana" na faixa de sete dias.
 * No computador, duas colunas: o que fazer à esquerda (com a data por extenso e
 * as pílulas ao lado), a semana em lista, a escola e a turma à direita. À
 * noite, a pergunta da casa muda e a página também: "A mochila de amanhã" como
 * título, uma folha por criança com o que vai nela, "Ainda de hoje" e o fecho
 * do dia.
 *
 * Os três buckets continuam vindo de `getRoutineSnapshot`, a mesma projeção da
 * lista de Atividades e da vez da criança: nada aqui é consulta própria.
 */
export function RoutineView(props: Props) {
  const {
    todayIso,
    buckets,
    tomorrowSchedule,
    tomorrowKits,
    evening,
    currentUserId,
    profileFilter,
    doneToday: initialDoneToday,
    streakDays,
    streakCountsToday,
  } = props;
  const [doneToday, setDoneToday] = useState(initialDoneToday);
  /**
   * O que saiu da tela antes de o servidor responder. O card some sozinho
   * quando conclui, mas o array continua vindo do servidor: sem rastrear aqui,
   * a contagem e a frase de resumo continuariam contando o que já foi feito.
   */
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  // Zera o escondido quando o servidor manda uma lista nova (ajuste durante o
  // render: o efeito mostraria um quadro com a lista nova e o conjunto velho).
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
      // Concluir conta pelo DIA da conclusão, não pelo prazo.
      setDoneToday((current) => Math.max(0, current + (next === "done" ? 1 : -1)));
    };
  const card = (entry: ActivityOverviewItem, chip = true, profile = true) => (
    <li key={entry.key}>
      <UnifiedActivityCard
        entry={entry}
        currentUserId={currentUserId}
        optimisticHideWhenDone
        hideChip={!chip}
        hideProfile={!profile}
        onStatusSuccess={onStatusSuccess(entry.key)}
      />
    </li>
  );

  // A semana a partir de hoje, de TODOS os buckets: a mesma janela do resumo
  // de domingo (`LOAD_WINDOW_DAYS`), para as duas não discordarem sobre um dia.
  const all = [...attention, ...tomorrow, ...week];
  const things = all.map((entry) => ({
    profileId: entry.item.profileId,
    profileName: entry.item.profileName,
    type: entry.item.type,
    title: entry.item.title,
    subjectName: entry.item.subjectName,
    dueAt: entry.item.dueAt,
    time: entry.item.time,
    estimatedMinutes: entry.item.estimatedMinutes,
  }));
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
  const firstFull = load.find((day) => day.level === "cheio" && day.iso > todayIso);
  const fullThings = firstFull ? things.filter((thing) => thing.dueAt === firstFull.iso) : [];
  const prepareOnFullDay = firstFull
    ? all.find(
        (entry) =>
          entry.item.dueAt === firstFull.iso &&
          (entry.item.type === "exam" || entry.item.type === "project"),
      )
    : undefined;
  const tomorrowIso = addDaysIso(todayIso, 1);
  const tomorrowThings = things.filter((thing) => thing.dueAt === tomorrowIso);
  const backpack = buildBackpack({
    schedule: tomorrowSchedule,
    kits: tomorrowKits,
    tomorrow: tomorrowThings,
  });
  const extrasTomorrow = tomorrowSchedule.flatMap((view) =>
    view.subjects
      .filter((subject) => subject.source === "extra")
      .map((subject) => subject.name.toLowerCase()),
  );
  const weekHref = `/calendario?date=${upcomingWeekAnchorIso(todayIso)}${profileFilter ? `&perfil=${profileFilter}` : ""}`;
  const fullDayName = firstFull ? weekdayLong(firstFull.iso) : "";
  const fullDayPhrase = firstFull
    ? `${fullDayName} está ${isWeekend(firstFull.iso) ? "cheio" : "cheia"}`
    : "";
  const streak = streakCountsToday || doneToday === 0 ? streakDays : streakDays + 1;

  if (evening)
    return (
      <div className="space-y-3">
        {props.header}
        <p className="text-base leading-[1.45] text-foreground/85">
          {eveningSentence({
            tomorrowLabel: `${weekdayLong(tomorrowIso)}, ${Number(tomorrowIso.slice(8))}`,
            openToday: attention.length,
          })}
        </p>
        <div className="empty:hidden">{props.notices}</div>
        {backpack.length ? (
          <section
            aria-label="O que vai na mochila"
            className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
          >
            <ul>
              {backpack.map((child, index) => (
                <li key={child.profileId}>
                  <div
                    className={cn(
                      "flex min-h-[60px] items-center gap-3 px-3.5 py-3",
                      index > 0 && "border-t border-foreground/15 pt-4",
                    )}
                  >
                    <StudentAvatar name={child.profileName} size="sheet" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-bold">{child.profileName}</p>
                      {child.subjects.length ? (
                        <p className="text-[13px] font-medium text-muted-foreground">
                          {joinWords(child.subjects)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <ul>
                    {tomorrow
                      .filter((entry) => entry.item.profileId === child.profileId)
                      .map((entry) => card(entry, false, false))}
                  </ul>
                  {child.kits.map((kit) => (
                    <div
                      key={kit.subject}
                      className="flex items-start gap-3 border-t border-foreground/15 px-3.5 py-3"
                    >
                      <span className="flex w-11 shrink-0 justify-center pt-0.5">
                        <BackpackIcon className="size-[22px]" />
                      </span>
                      <p className="min-w-0 text-[15px] leading-normal">
                        <b>Levar sempre na aula de {kit.subject.toLowerCase()}</b>
                        <br />
                        {joinWords(kit.items).replace(/^./, (c) => c.toUpperCase())}
                      </p>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {attention.length ? (
          <ActivitySheet
            title="Ainda de hoje"
            labelledBy="routine-still-today"
            aside={String(attention.length)}
          >
            {attention.map((entry) => card(entry))}
          </ActivitySheet>
        ) : null}
        {doneToday > 0 ? <DayClosed doneToday={doneToday} streakDays={streak} /> : null}
        {firstFull ? (
          <Link
            href={weekHref}
            className="flex min-h-[52px] items-center justify-between gap-3 rounded-[18px] border border-foreground/15 px-4 py-3.5 text-[15px] hover:bg-muted/60"
          >
            <span>
              <b className="text-chart-4-ink">{fullDayPhrase}</b> · {fullDayCount(fullThings)}
            </span>
            <span className="shrink-0 font-bold text-primary-ink">Ver a semana</span>
          </Link>
        ) : null}
        <div className="empty:hidden">{props.shared}</div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <div className="order-1">{props.header}</div>
        <p className="order-2 -mt-1 text-base leading-[1.45] text-foreground/85 lg:mt-0 lg:text-[17px]">
          {routineSummary({
            forToday: attention.length,
            late,
            tomorrow: [...tomorrowThings.map(describeThing), ...extrasTomorrow],
            doneToday,
          })}
        </p>
        <div className="order-3 pt-1 empty:hidden lg:hidden">{props.pills}</div>
        <div className="order-4 empty:hidden">{props.notices}</div>
        <div className="order-5 empty:hidden">
          {attention.length > 0 ? (
            <ActivitySheet
              title="Para hoje"
              labelledBy="routine-today"
              aside={`${attention.length} em aberto`}
            >
              {attention.map((entry) => card(entry))}
            </ActivitySheet>
          ) : doneToday > 0 ? (
            <DayClosed doneToday={doneToday} streakDays={streak} />
          ) : null}
        </div>
        <ActivitySheet
          title={`Amanhã, ${weekdayLong(tomorrowIso).toLowerCase()}`}
          labelledBy="routine-tomorrow"
          aside={
            tomorrow.length > 0 ? (
              <>
                <span className="lg:hidden">{tomorrow.length}</span>
                <span className="hidden lg:inline">
                  {backpack.some((child) => child.items.length)
                    ? `${tomorrow.length} e a mochila`
                    : tomorrow.length}
                </span>
              </>
            ) : undefined
          }
          className="order-7"
        >
          {tomorrow.map((entry) => card(entry))}
          {backpack.some((child) => child.items.length) ? (
            <li className="border-t border-foreground/15">
              <div className="flex items-start gap-3 px-3.5 py-3.5 lg:hidden">
                <span className="flex w-[30px] shrink-0 justify-center pt-0.5">
                  <BackpackIcon className="size-[22px]" />
                </span>
                <div className="min-w-0 text-[15px] leading-normal">
                  <p className="font-bold">Na mochila de amanhã</p>
                  {backpack
                    .filter((child) => child.items.length)
                    .map((child) => (
                      <p key={child.profileId}>{backpackLine(child)}</p>
                    ))}
                </div>
              </div>
              <p className="hidden min-h-[60px] items-center gap-3.5 py-2.5 pl-6 pr-5 text-[15px] lg:flex">
                <BackpackIcon pocket={false} className="size-5 shrink-0" />
                <span>
                  <b>Na mochila:</b> {backpackSentence(backpack)}
                </span>
              </p>
            </li>
          ) : null}
          {tomorrow.length === 0 &&
          !backpack.some((child) => child.items.length || child.subjects.length) ? (
            <li className="border-t border-foreground/15 px-4 py-3 text-sm text-muted-foreground">
              Amanhã está livre por enquanto.
            </li>
          ) : null}
        </ActivitySheet>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <div className="order-6 empty:hidden lg:order-2">{props.school}</div>
        <section
          aria-labelledby="routine-week"
          className="order-8 overflow-hidden rounded-[20px] border border-foreground/15 bg-background lg:order-1"
        >
          <div className="flex items-baseline justify-between gap-3 px-[18px] pb-2.5 pt-4 lg:px-5">
            <h2
              id="routine-week"
              className="text-[21px] font-extrabold leading-[normal] tracking-[-0.02em] lg:text-xl"
            >
              A semana
            </h2>
            <Link href={weekHref} className={SHEET_LINK}>
              <span className="lg:hidden">Ver tudo</span>
              <span className="hidden lg:inline">Abrir</span>
            </Link>
          </div>
          <div className="space-y-3.5 px-3 pb-4 lg:hidden">
            <WeekStrip days={days} todayIso={todayIso} profileFilter={profileFilter} />
            {firstFull ? (
              <div className="mx-1 space-y-1.5 rounded-[14px] bg-chart-4/10 px-3.5 py-3 text-[15px] leading-[1.45]">
                <p>
                  <b className="text-chart-4-ink">{fullDayPhrase}:</b> {fullDayDetail(fullThings)}.
                </p>
                {prepareOnFullDay ? (
                  <Link
                    href={`/atividades/${prepareOnFullDay.item.id}#plano-de-estudo`}
                    className={SHEET_LINK}
                  >
                    Dividir o estudo nos dias livres
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <ul className="hidden lg:block">
            {weekRows({
              todayIso,
              days: days.map((day) => ({ iso: day.iso, full: day.full })),
              things: things.filter((thing) => thing.dueAt && thing.dueAt > todayIso),
              openToday: attention.length,
              lateToday: late,
            }).map((row) => (
              <li
                key={row.iso}
                className={cn(
                  "grid grid-cols-[70px_1fr] gap-2.5 border-t border-foreground/15 px-5 py-3 text-sm leading-[normal]",
                  row.today ? "bg-primary/6" : row.full && "bg-chart-4/9",
                )}
              >
                <b className={cn(row.today ? "text-primary-ink" : row.full && "text-chart-4-ink")}>
                  {row.label}
                </b>
                <span>
                  {row.lead ? <b>{row.lead} </b> : null}
                  {row.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className="order-9 empty:hidden lg:order-3">{props.shared}</div>
        <div className="order-10 empty:hidden lg:order-4">{props.commitment}</div>
      </div>
    </div>
  );
}

/** Sábado e domingo são "cheio"; os outros dias são "-feira", e ficam "cheia". */
function isWeekend(iso: string) {
  const weekday = weekdayLong(iso).toLowerCase();
  return weekday === "sábado" || weekday === "domingo";
}

/**
 * O fecho do dia, como na prancha da noite: o desenho pequeno, o que a casa
 * cuidou hoje e a sequência dela. Sem pontos e sem comparação entre crianças:
 * o reconhecimento é da casa, e a sequência aparece a partir de dois dias.
 */
function DayClosed({ doneToday, streakDays }: { doneToday: number; streakDays: number }) {
  return (
    <section className="flex items-center gap-4 rounded-[20px] border border-foreground/15 bg-background p-[18px]">
      <DayClosedIllustration className="w-[72px] shrink-0" />
      <p className="min-w-0 text-[15px] leading-[1.45]">
        <b>
          {doneToday === 1
            ? "Hoje vocês cuidaram de 1 coisa."
            : `Hoje vocês cuidaram de ${doneToday} coisas.`}
        </b>
        {streakDays >= 2 ? (
          <>
            <br />
            {streakDays <= 10
              ? `É o ${ORDINALS[streakDays]} dia seguido da casa em dia.`
              : `São ${streakDays} dias seguidos da casa em dia.`}
          </>
        ) : null}
      </p>
    </section>
  );
}
