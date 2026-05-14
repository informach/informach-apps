"use client";

import { useMemo } from "react";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { buildMonthGrid, WEEKDAY_SHORT_LABELS_SUNDAY_FIRST } from "../date";
import { DayCell } from "./day-cell";

type Props = {
  anchorIso: string;
  items: UnifiedActivityListItem[];
  onSelectActivity: (item: UnifiedActivityListItem) => void;
  onCreateForDay: (iso: string) => void;
};

// Vista mensal: grid 7×6 (42 dias) com domingo na primeira coluna. Header
// fixo de weekdays no topo. Agrupa os itens do snapshot por `dueAt` numa
// passada O(n) via Map.
export function MonthView({ anchorIso, items, onSelectActivity, onCreateForDay }: Props) {
  const grid = useMemo(() => buildMonthGrid(anchorIso), [anchorIso]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, UnifiedActivityListItem[]>();
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
      className="overflow-hidden rounded-lg border border-muted-foreground/20 bg-card"
    >
      {/* Header de weekdays */}
      <div className="grid grid-cols-7 divide-x divide-muted-foreground/20 border-b border-muted-foreground/20 bg-muted/40">
        {WEEKDAY_SHORT_LABELS_SUNDAY_FIRST.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Grid 7×6. `--border` é igual ao `--card` no tema base, então a grade
          usa `muted-foreground` com baixa opacidade para manter uma linha
          discreta e visível em light/dark. */}
      <div className="grid grid-cols-7 divide-x divide-y divide-muted-foreground/20">
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
