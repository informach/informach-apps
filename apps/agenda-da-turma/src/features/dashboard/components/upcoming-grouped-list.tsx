import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

// "2025-05-13" → "Quarta · 13/05" (com primeira letra capitalizada).
// Interpreta como meio-dia UTC pra evitar shift de TZ que jogaria pro dia anterior.
function formatGroupHeader(dueAt: string): string {
  const date = new Date(`${dueAt}T12:00:00Z`);
  const formatted = DATE_FORMATTER.format(date);
  // Intl em pt-BR retorna "quarta-feira, 13/05" → quebramos em weekday + day/month
  // pra gerar "Quarta · 13/05".
  const [weekdayRaw, dayMonth] = formatted.split(",").map((s) => s.trim());
  const weekday = (weekdayRaw ?? "")
    .replace(/-feira$/i, "")
    .replace(/^(.)/, (c) => c.toUpperCase());
  return dayMonth ? `${weekday} · ${dayMonth}` : formatted;
}

type Props = {
  items: UnifiedActivityListItem[];
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
};

export function UpcomingGroupedList({ items, currentUserId, isPro, turmasForForm }: Props) {
  // Items já vêm ordenados por dueAt ASC do service (turma + extras mesclados).
  // Agrupa preservando ordem.
  const groups = new Map<string, UnifiedActivityListItem[]>();
  for (const item of items) {
    const list = groups.get(item.dueAt) ?? [];
    list.push(item);
    groups.set(item.dueAt, list);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([dueAt, group]) => (
        <div key={dueAt} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatGroupHeader(dueAt)}
            <span className="ml-2 font-normal normal-case text-muted-foreground/80">
              ({group.length})
            </span>
          </p>
          <div className="space-y-3">
            {group.map((item) => (
              <UnifiedActivityCard
                key={item.source === "turma" ? item.statusId : item.activityId}
                item={item}
                currentUserId={currentUserId}
                isPro={isPro}
                turmasForForm={turmasForForm}
                hideActions
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
