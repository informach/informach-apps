"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import {
  buildWeekDays,
  formatDayLabel,
  parseLocalIso,
  todayLocalIso,
  WEEKDAY_SHORT_LABELS_SUNDAY_FIRST,
} from "../date";
import { ActivityBlip } from "./activity-blip";

type Props = {
  anchorIso: string;
  items: TaskRow[];
  onSelectActivity: (item: TaskRow) => void;
  onCreateForDay: (iso: string) => void;
};

// Vista semanal: 7 colunas em desktop, lista vertical com seções por dia em
// mobile. Cabeçalho de cada coluna: weekday curto + dia/mês; "hoje" ganha
// pílula primary. Click no fundo da coluna abre create dialog do dia.
export function WeekView({ anchorIso, items, onSelectActivity, onCreateForDay }: Props) {
  const days = useMemo(() => buildWeekDays(anchorIso), [anchorIso]);
  const today = todayLocalIso();

  const itemsByDate = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const item of items) {
      // Sem prazo não há coluna: a atividade fica na rotina e na lista, sem
      // ganhar uma data fictícia só para caber na semana.
      if (!item.dueAt) continue;
      const list = map.get(item.dueAt) ?? [];
      list.push(item);
      map.set(item.dueAt, list);
    }
    return map;
  }, [items]);

  return (
    <div className="overflow-hidden rounded-lg border border-muted-foreground/20 bg-card">
      {/* Separadores entre colunas (desktop) ou linhas (mobile). `--border`
          acompanha `--card` no tema base, então a grade usa um divisor
          semântico com opacidade baixa para aparecer em light/dark. */}
      <div className="grid grid-cols-1 divide-y divide-muted-foreground/20 md:grid-cols-7 md:divide-x md:divide-y-0">
        {days.map((iso, index) => {
          const dayItems = itemsByDate.get(iso) ?? [];
          const isToday = iso === today;
          const dayNumber = parseLocalIso(iso).getDate();
          const monthNumber = parseLocalIso(iso).getMonth() + 1;
          const weekdayLabel = WEEKDAY_SHORT_LABELS_SUNDAY_FIRST[index] ?? "";

          return (
            <div key={iso} className="group relative flex flex-col">
              <div
                className={cn(
                  "flex items-center justify-between border-b border-muted-foreground/20 bg-muted/30 px-3 py-2",
                  isToday && "bg-primary/10",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {weekdayLabel}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      isToday && "text-primary-ink",
                    )}
                  >
                    {String(dayNumber).padStart(2, "0")}/{String(monthNumber).padStart(2, "0")}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onCreateForDay(iso)}
                  // Mesma grafia de `day-cell` e `month-agenda`: o mesmo
                  // controle era anunciado de três jeitos em duas vistas.
                  aria-label={`Criar atividade em ${formatDayLabel(iso)}`}
                >
                  <Plus className="size-3.5" aria-hidden />
                </Button>
              </div>
              {/* Click no espaço vazio da coluna cria atividade no dia */}
              <button
                type="button"
                onClick={() => onCreateForDay(iso)}
                className="absolute inset-0 top-[2.625rem] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Espaço vazio de ${formatDayLabel(iso)}, criar atividade`}
                tabIndex={-1}
              />
              <div className="relative z-10 flex min-h-[18rem] flex-col gap-1 p-2">
                {dayItems.length === 0 ? (
                  <p className="px-1 pt-1 text-xs text-muted-foreground/70">Sem atividades</p>
                ) : (
                  dayItems.map((item) => (
                    <ActivityBlip
                      key={item.id}
                      item={item}
                      onSelect={() => onSelectActivity(item)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
