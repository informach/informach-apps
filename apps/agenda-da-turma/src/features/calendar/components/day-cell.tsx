"use client";

import { Button } from "@informach/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@informach/ui/components/popover";
import { cn } from "@informach/ui/lib/utils";
import { Plus } from "lucide-react";
import type { ActivityListItem } from "@/features/activities/types";
import { todayLocalIso } from "../date";
import { ActivityBlip } from "./activity-blip";

type Props = {
  iso: string;
  inMonth: boolean;
  items: ActivityListItem[];
  onSelectActivity: (item: ActivityListItem) => void;
  onCreateForDay: (iso: string) => void;
};

const MAX_VISIBLE_BLIPS = 3;

// Célula de um dia na grid mensal.
// - Header: número do dia. "Hoje" ganha círculo `primary`. Dias fora do mês
//   ficam atenuados.
// - Body: até 3 blips empilhados; o resto vira "+N mais" num Popover.
// - Click na célula abre o create dialog pré-preenchido com o ISO. Blips e
//   "+N mais" usam stopPropagation pra não dispararem o handler da célula.
//   Antes a gente tinha um <button> absoluto cobrindo a célula — eliminado
//   porque criava nested-button issues com o "+N mais" e exigia z-index dance.
// - A11y: a div é `role="button"` + tabIndex + onKeyDown — focável por teclado
//   e ativável com Enter/Espaço, mesmo comportamento do antigo button absoluto.
export function DayCell({ iso, inMonth, items, onSelectActivity, onCreateForDay }: Props) {
  const today = todayLocalIso();
  const isToday = iso === today;
  const dayNumber = Number(iso.slice(-2));

  const visible = items.slice(0, MAX_VISIBLE_BLIPS);
  const overflow = items.length - visible.length;

  const handleCellClick = () => onCreateForDay(iso);
  const handleCellKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCreateForDay(iso);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: nested <button> (blips + Popover trigger) seriam HTML inválido se o outer fosse um <button>
    <div
      role="button"
      tabIndex={0}
      onClick={handleCellClick}
      onKeyDown={handleCellKey}
      aria-label={`Dia ${dayNumber} — criar atividade`}
      className={cn(
        // min-h-36 (9rem = 144px) cabe header + 3 blips + "+N mais" + gaps + padding
        // com folga, sem clipping. Tailwind core size, sem arbitrary value.
        "group flex min-h-36 cursor-pointer flex-col gap-1 bg-card p-1.5",
        !inMonth && "bg-muted/40",
        "transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "grid size-6 place-items-center text-xs font-medium tabular-nums",
            !inMonth && "text-muted-foreground opacity-70",
            isToday && "rounded-full bg-primary text-primary-foreground font-semibold",
          )}
        >
          {dayNumber}
        </span>
        {/* "+" hover discreto pra affordance de criar — aparece on group hover. */}
        <Plus
          className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      <div className="flex flex-1 flex-col gap-0.5">
        {visible.map((item) => (
          <ActivityBlip key={item.statusId} item={item} onSelect={() => onSelectActivity(item)} />
        ))}
        {overflow > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 justify-start px-1.5 py-0 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
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
                  <ActivityBlip
                    key={item.statusId}
                    item={item}
                    onSelect={() => onSelectActivity(item)}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}
