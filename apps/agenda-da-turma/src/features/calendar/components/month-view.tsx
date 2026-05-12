"use client";

import { useMemo } from "react";
import type { ActivityListItem } from "@/features/activities/types";
import { buildMonthGrid, WEEKDAY_SHORT_LABELS_SUNDAY_FIRST } from "../date";
import { DayCell } from "./day-cell";

type Props = {
  anchorIso: string;
  items: ActivityListItem[];
  onSelectActivity: (item: ActivityListItem) => void;
  onCreateForDay: (iso: string) => void;
};

// Vista mensal: grid 7×6 (42 dias) com domingo na primeira coluna. Header
// fixo de weekdays no topo. Agrupa os itens do snapshot por `dueAt` numa
// passada O(n) via Map.
export function MonthView({ anchorIso, items, onSelectActivity, onCreateForDay }: Props) {
  const grid = useMemo(() => buildMonthGrid(anchorIso), [anchorIso]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ActivityListItem[]>();
    for (const item of items) {
      const list = map.get(item.dueAt) ?? [];
      list.push(item);
      map.set(item.dueAt, list);
    }
    return map;
  }, [items]);

  return (
    <section
      aria-label="Calendário mensal"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      {/* Header de weekdays */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAY_SHORT_LABELS_SUNDAY_FIRST.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Grid 7×6. `divide-x`/`divide-y` com `divide-border` (mesmo token
          visível usado em todo o app — `border-border/60` ficava invisível
          em light mode porque o token já é um cinza muito claro). Linhas
          discretas tipo Google Calendar, sem dobra/duplicação. */}
      <div className="grid grid-cols-7 divide-x divide-y divide-border">
        {grid.map((cell) => (
          <DayCell
            key={cell.iso}
            iso={cell.iso}
            inMonth={cell.inMonth}
            items={itemsByDate.get(cell.iso) ?? []}
            onSelectActivity={onSelectActivity}
            onCreateForDay={onCreateForDay}
          />
        ))}
      </div>
    </section>
  );
}
