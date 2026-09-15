"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { formatDayLabel } from "../date";

type Props = {
  anchorIso: string;
  items: ActivityOverviewItem[];
  currentUserId: string;
  onCreateForDay: (iso: string) => void;
};

// Vista diária: lista vertical com o mesmo card das outras telas.
export function DayView({ anchorIso, items, currentUserId, onCreateForDay }: Props) {
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{formatDayLabel(anchorIso)}</h2>
        <Button variant="outline" size="sm" onClick={() => onCreateForDay(anchorIso)}>
          <Plus className="mr-1 size-4" aria-hidden />
          Nova atividade
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm font-medium text-foreground">Sem atividades neste dia</p>
          <p className="text-xs text-muted-foreground">
            Clique em &quot;Nova atividade&quot; para cadastrar uma para {formatDayLabel(anchorIso)}
            .
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((entry) => (
            <UnifiedActivityCard key={entry.key} entry={entry} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </section>
  );
}
