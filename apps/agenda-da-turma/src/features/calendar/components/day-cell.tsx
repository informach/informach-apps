"use client";

import { Button } from "@informach/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@informach/ui/components/popover";
import { cn } from "@informach/ui/lib/utils";
import { Plus } from "lucide-react";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import { formatDayLabel, todayLocalIso } from "../date";
import { ActivityBlip } from "./activity-blip";

type Props = {
  iso: string;
  inMonth: boolean;
  items: TaskRow[];
  onSelectActivity: (item: TaskRow) => void;
  onCreateForDay: (iso: string) => void;
};

const MAX_VISIBLE_BLIPS = 3;

// Criar e abrir uma atividade são controles irmãos. Nenhum evento de um item
// pode ativar a criação do dia, inclusive com Enter/Espaço ou no popover.
export function DayCell({ iso, inMonth, items, onSelectActivity, onCreateForDay }: Props) {
  const today = todayLocalIso();
  const isToday = iso === today;
  const dayNumber = Number(iso.slice(-2));

  const visible = items.slice(0, MAX_VISIBLE_BLIPS);
  const overflow = items.length - visible.length;

  return (
    <div
      className={cn(
        // min-h-36 (9rem = 144px) cabe header + 3 blips + "+N mais" + gaps + padding
        // com folga, sem clipping. Tailwind core size, sem arbitrary value.
        "group flex min-h-36 flex-col gap-1 bg-card p-1.5",
        !inMonth && "bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={() => onCreateForDay(iso)}
        // Data por extenso: o rótulo anunciava "2026-09-15" em leitor de tela.
        aria-label={`Criar atividade em ${formatDayLabel(iso)}${isToday ? " (hoje)" : ""}`}
        className="flex min-h-9 items-center justify-between rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "grid size-6 place-items-center text-xs font-medium tabular-nums",
            !inMonth && "text-muted-foreground opacity-70",
            isToday && "rounded-full bg-primary text-primary-foreground font-semibold",
          )}
        >
          {dayNumber}
        </span>
        <Plus className="size-3.5 text-muted-foreground" aria-hidden />
      </button>

      <div className="flex flex-1 flex-col gap-0.5">
        {visible.map((item) => (
          <ActivityBlip key={item.id} item={item} onSelect={() => onSelectActivity(item)} />
        ))}
        {overflow > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 justify-start px-1.5 py-0 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Ver mais ${overflow} atividade${overflow === 1 ? "" : "s"} do dia ${dayNumber}`}
              >
                + {overflow} mais
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                Todas as atividades
              </p>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <ActivityBlip key={item.id} item={item} onSelect={() => onSelectActivity(item)} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}
