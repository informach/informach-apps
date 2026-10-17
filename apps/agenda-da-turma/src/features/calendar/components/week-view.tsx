import { cn } from "@informach/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import {
  formatClockTime,
  longDayLabel,
  weekdayLong,
  weekdayShort,
} from "@/features/dashboard/day-labels";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { formatEstimate } from "@/features/unified-activities/estimate";
import { summarizeDayLoad } from "@/features/unified-activities/load";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import { buildWeekDays, parseLocalIso, weekDayAnchor } from "../date";

type Props = {
  anchorIso: string;
  todayIso: string;
  items: TaskRow[];
  /** As atividades em aberto sem data, que nenhum dia pode mostrar. */
  undated: TaskRow[];
  newActivityHref: (iso: string) => string;
};

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/**
 * Matéria (ou o tipo, sem matéria), criança e o que muda o dia: "na próxima
 * aula" quando a data veio do horário, o local e o tempo que a família estimou.
 */
function metaLine(item: TaskRow): string {
  const parts = [item.subjectName ?? ACTIVITY_TYPE_LABELS[item.type], item.profileName];
  if (item.dateOrigin === "schedule") parts.push("na próxima aula");
  if (item.location) parts.push(item.location);
  if (item.estimatedMinutes && item.estimatedMinutes > 0)
    parts.push(`cerca de ${formatEstimate(item.estimatedMinutes)}`);
  return parts.join(" · ");
}

function WeekItem({ item }: { item: TaskRow }) {
  const done = item.status === "done";
  const dot = item.subjectColorIndex !== null ? DOT_CLASS[item.subjectColorIndex] : undefined;
  return (
    <li>
      <Link
        href={`/atividades/${item.id}`}
        className="flex min-h-11 items-start gap-2.5 rounded-lg py-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={cn(
            "mt-[7px] size-2.5 shrink-0 rounded-full",
            dot ?? "border-[1.5px] border-foreground/50",
          )}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[15px] font-bold leading-snug",
              done && "text-muted-foreground line-through",
            )}
          >
            {item.title}
            {item.time ? ` · ${formatClockTime(item.time)}` : ""}
            {done ? <span className="sr-only"> (feita)</span> : null}
          </span>
          <span className="block text-[13px] text-muted-foreground">{metaLine(item)}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * A semana, como a página da agenda de papel: uma linha por dia, de segunda a
 * domingo, com o dia da semana e o número à esquerda e o que vence nele à
 * direita. Hoje vem marcado, o dia cheio avisa ("dia cheio", pela mesma conta
 * do resumo de domingo) e o que não tem data fica numa linha recolhida em
 * cima, porque dia nenhum pode mostrá-lo.
 *
 * A atividade aqui é uma linha que abre o detalhe, como o blip no mês. Marcar
 * como feito é em Hoje e em Atividades, no card de sempre.
 */
export function WeekView({ anchorIso, todayIso, items, undated, newActivityHref }: Props) {
  const days = buildWeekDays(anchorIso);
  const load = new Map(
    summarizeDayLoad(items, { fromIso: days[0] ?? anchorIso, days: days.length }).map((day) => [
      day.iso,
      day.level,
    ]),
  );
  const byDay = new Map<string, TaskRow[]>(days.map((iso) => [iso, []]));
  const ordered = [...items].sort(
    (a, b) =>
      (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
      a.profileName.localeCompare(b.profileName, "pt-BR") ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  for (const item of ordered) if (item.dueAt) byDay.get(item.dueAt)?.push(item);

  return (
    <div className="space-y-3">
      {undated.length ? (
        <details className="group rounded-[18px] border-[1.5px] border-dashed border-foreground/25 bg-background px-4">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
            <span>Sem data marcada · {undated.length}</span>
            <span className="text-sm text-primary-ink group-open:hidden">Ver</span>
            <span className="hidden text-sm text-primary-ink group-open:inline">Esconder</span>
          </summary>
          <ul className="space-y-0.5 pb-3">
            {undated.map((item) => (
              <WeekItem key={item.id} item={item} />
            ))}
          </ul>
        </details>
      ) : null}

      <ol
        aria-label="Os dias da semana"
        className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
      >
        {days.map((iso) => {
          const dayItems = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          const full = load.get(iso) === "cheio";
          const weekend = [0, 6].includes(parseLocalIso(iso).getDay());
          return (
            <li
              key={iso}
              id={weekDayAnchor(iso)}
              className={cn(
                "grid scroll-mt-24 grid-cols-[62px_1fr] gap-2.5 border-t border-foreground/15 py-3.5 pl-4 pr-3.5 first:border-t-0",
                isToday ? "bg-primary/5" : full && "bg-chart-4/10",
              )}
            >
              <h2 className="flex flex-col items-start">
                <span className="sr-only">
                  {longDayLabel(iso, todayIso)}
                  {isToday ? ", hoje" : ""}
                  {full ? ", dia cheio" : ""}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "text-xs font-extrabold uppercase tracking-[0.08em]",
                    isToday
                      ? "text-primary-ink"
                      : full
                        ? "text-chart-4-ink"
                        : "text-muted-foreground",
                  )}
                >
                  {weekdayShort(iso)}
                  {isToday ? " · hoje" : ""}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "text-[30px] font-extrabold leading-none tracking-tight tabular-nums",
                    weekend && dayItems.length === 0 && "text-muted-foreground",
                  )}
                >
                  {Number(iso.slice(8))}
                </span>
                {full ? (
                  <span aria-hidden className="mt-1.5 text-xs font-extrabold text-chart-4-ink">
                    dia cheio
                  </span>
                ) : null}
              </h2>
              {dayItems.length ? (
                <ul className="min-w-0">
                  {dayItems.map((item) => (
                    <WeekItem key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Nada marcado</span>
                  <Link
                    href={newActivityHref(iso)}
                    aria-label={`Adicionar para ${weekdayLong(iso).toLowerCase()}, ${Number(iso.slice(8))}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-foreground/15 hover:bg-muted"
                  >
                    <Plus className="size-5" aria-hidden />
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
