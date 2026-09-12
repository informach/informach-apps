import { Skeleton } from "@informach/ui/components/skeleton";
import { cn } from "@informach/ui/lib/utils";
import { Backpack, CalendarDays, CircleCheck, type LucideIcon, Sun } from "lucide-react";
import Link from "next/link";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { getDashboardSnapshot } from "@/features/dashboard/service";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { getActivityPresentation } from "@/features/unified-activities/presentation";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { listNoticeActions, type NoticeActionRow } from "../repository";
import { ACTION_LABELS } from "../schemas";
import { RoutineCard } from "./routine-card";

function LegacyRow({ item }: { item: UnifiedActivityListItem }) {
  const presentation = getActivityPresentation(item.type);
  const TypeIcon = presentation.icon;
  return (
    <Link
      href={`/calendario?view=day&date=${item.dueAt}&perfil=${item.studentProfileId}`}
      className={cn(
        "block rounded-2xl border p-4 transition-colors hover:border-foreground/30 sm:p-5",
        presentation.surface,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-sm font-semibold">{item.studentProfileName}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium text-foreground",
            presentation.surface,
          )}
        >
          <TypeIcon className="size-3.5" aria-hidden />
          {ACTION_LABELS[item.type]}
        </span>
      </div>
      <p className="mt-2 break-words font-semibold leading-relaxed">{item.title}</p>
      {"version" in item && (item.version ?? 1) > 1 ? (
        <span className="mt-2 inline-block text-xs font-semibold text-foreground">
          Atualizada · versão {item.version} — confira a alteração
        </span>
      ) : null}
      <p className="mt-1 break-words text-xs text-foreground/80">
        {item.source === "extra"
          ? item.profileSubjectName
          : item.source === "turma"
            ? item.subjectName
            : "Atividade"}
      </p>
      <p className="mt-3 text-sm">
        {item.dueAt.split("-").reverse().join("/")} · Abrir para acompanhar
      </p>
    </Link>
  );
}

export async function TomorrowRoutine({
  userId,
  profileFilter,
}: {
  userId: string;
  profileFilter: string | null;
}) {
  const today = todayLocalIso();
  const tomorrow = addDaysIso(today, 1);
  const weekEnd = addDaysIso(today, 7);
  const [notices, legacy] = await Promise.all([
    listNoticeActions(userId, { profileId: profileFilter ?? undefined }),
    getDashboardSnapshot(userId, { profileFilter, limit: 100 }),
  ]);
  const attention = notices.filter(({ action: a }) => !a.dueAt || a.dueAt <= today);
  const tomorrowItems = notices.filter(({ action: a }) => a.dueAt === tomorrow);
  const week = notices.filter(
    ({ action: a }) => a.dueAt && a.dueAt > tomorrow && a.dueAt <= weekEnd,
  );
  const legacyTomorrow = legacy.upcoming.filter((i) => i.dueAt === tomorrow);
  const legacyWeek = legacy.upcoming.filter((i) => i.dueAt > tomorrow);
  function section(
    title: string,
    description: string,
    Icon: LucideIcon,
    color: number,
    rows: NoticeActionRow[],
    older: UnifiedActivityListItem[],
    empty: string,
  ) {
    const count = rows.length + older.length;
    return (
      <section className="space-y-4">
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
              {count > 0 ? (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                    getSubjectTintedClassByIndex(color),
                  )}
                >
                  {count} {count === 1 ? "atividade" : "atividades"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {rows.length || older.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <RoutineCard key={row.action.id} item={row} />
            ))}
            {older.map((item) => (
              <LegacyRow
                key={`${item.source}:${item.activityId}:${item.studentProfileId}`}
                item={item}
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
  }
  return (
    <div className="space-y-8">
      {section(
        "Para cuidar hoje",
        "Atividades de hoje, prazos que passaram e datas a confirmar.",
        Sun,
        4,
        attention,
        [...legacy.overdue, ...legacy.today],
        "Tudo certo por aqui! Nenhuma atividade de hoje ou data a confirmar entre os itens cadastrados.",
      )}
      {section(
        "Preparar para amanhã",
        "Uma olhada na mochila, nas tarefas e nos combinados do próximo dia.",
        Backpack,
        1,
        tomorrowItems,
        legacyTomorrow,
        "Amanhã está livre na agenda por enquanto. Vale conferir se chegou alguma atividade nova.",
      )}
      {section(
        "Próximos sete dias",
        "Tempo para se organizar, estudar e pedir uma ajudinha.",
        CalendarDays,
        3,
        week,
        legacyWeek,
        "Nenhuma atividade cadastrada para os próximos dias. Espaço para o que vem por aí!",
      )}
      <p className="text-xs text-muted-foreground">
        “Feito em casa” registra a organização da família. Entregas e autorizações à escola
        continuam no canal oficial. As listas consideram os itens cadastrados; novos recados e
        retificações precisam ser importados.
      </p>
    </div>
  );
}

export function TomorrowRoutineSkeleton() {
  return (
    <div role="status" aria-label="Carregando atividades da rotina" className="space-y-8">
      {["today", "tomorrow", "week"].map((key) => (
        <div key={key} className="space-y-4" aria-hidden>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
