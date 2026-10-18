"use client";

import { useMemo } from "react";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import { buildMonthGrid, formatMonthLabel, WEEKDAY_HEADERS } from "../date";
import { DayCell } from "./day-cell";
import { MonthAgenda } from "./month-agenda";

type Props = {
  anchorIso: string;
  items: TaskRow[];
  onSelectActivity: (item: TaskRow) => void;
  onCreateForDay: (iso: string) => void;
  onCreateWithoutDay: () => void;
};

// Vista mensal: grid 7×6 (42 dias) com segunda na primeira coluna. Header
// fixo de weekdays no topo. Agrupa os itens do snapshot por `dueAt` numa
// passada O(n) via Map.
export function MonthView({
  anchorIso,
  items,
  onSelectActivity,
  onCreateForDay,
  onCreateWithoutDay,
}: Props) {
  const grid = useMemo(() => buildMonthGrid(anchorIso), [anchorIso]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const item of items) {
      // Sem prazo não há célula; a ausência de data é estado legítimo.
      if (!item.dueAt) continue;
      const list = map.get(item.dueAt) ?? [];
      list.push(item);
      map.set(item.dueAt, list);
    }
    return map;
  }, [items]);

  const monthDays = useMemo(
    () => grid.filter((cell) => cell.inMonth).map((cell) => cell.iso),
    [grid],
  );

  return (
    <>
      {/*
        Duas formas do mesmo mês, decididas por CSS e não por media query em JS:
        renderizar as duas evita o salto de layout e a divergência de hidratação
        que um `useMediaQuery` traz numa página server-rendered.

        O custo aceito é montar as 42 células no telefone, onde a grade nunca
        aparece. Trocar por `matchMedia` devolveria a troca visível depois da
        hidratação justamente na vista padrão — pior para quem usa. Se o custo
        passar a pesar, o caminho é uma boundary só de `md`, não um seletor em JS.
      */}
      <div className="md:hidden">
        <MonthAgenda
          days={monthDays}
          itemsByDate={itemsByDate}
          monthLabel={formatMonthLabel(anchorIso)}
          onSelectActivity={onSelectActivity}
          onCreateForDay={onCreateForDay}
          onCreateWithoutDay={onCreateWithoutDay}
        />
      </div>
      <section
        aria-label="Calendário mensal"
        className="hidden overflow-hidden rounded-lg border border-muted-foreground/20 bg-card md:block"
      >
        {/* Header de weekdays */}
        <div className="grid grid-cols-7 divide-x divide-muted-foreground/20 border-b border-muted-foreground/20 bg-muted/40">
          {WEEKDAY_HEADERS.map((label) => (
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
    </>
  );
}
