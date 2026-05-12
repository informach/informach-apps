"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/activity-card";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "@/features/activities/types";
import { formatDayLabel } from "../date";

type Props = {
  anchorIso: string;
  items: ActivityListItem[];
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
  onCreateForDay: (iso: string) => void;
};

// Vista diária: lista vertical reutilizando ActivityCard. A vista de dia é
// exatamente o que o card já faz — sem ROI em reinventar. Botão grande pra
// criar atividade no dia em destaque.
export function DayView({
  anchorIso,
  items,
  currentUserId,
  isPro,
  turmasForForm,
  onCreateForDay,
}: Props) {
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
          {items.map((item) => (
            <ActivityCard
              key={item.statusId}
              item={item}
              currentUserId={currentUserId}
              isPro={isPro}
              turmasForForm={turmasForForm}
            />
          ))}
        </div>
      )}
    </section>
  );
}
