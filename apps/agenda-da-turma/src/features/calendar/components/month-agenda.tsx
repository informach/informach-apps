"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { CalendarPlus, Plus } from "lucide-react";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import {
  formatDayLabel,
  parseLocalIso,
  todayLocalIso,
  WEEKDAY_SHORT_LABELS_SUNDAY_FIRST,
} from "../date";
import { ActivityBlip } from "./activity-blip";

type Props = {
  /** Dias do mês âncora, em ordem, já sem o transbordo dos meses vizinhos. */
  days: string[];
  itemsByDate: Map<string, TaskRow[]>;
  monthLabel: string;
  onSelectActivity: (item: TaskRow) => void;
  onCreateForDay: (iso: string) => void;
  /** Criar sem data, para o vazio do mês. */
  onCreateWithoutDay: () => void;
};

/**
 * A vista do mês no telefone.
 *
 * A grade 7×6 não tem vista móvel: em 360 px cada célula fica com cerca de
 * 48 px de largura, o blip trunca antes da primeira palavra e a grade passa de
 * 860 px de altura. Como "mês" é a vista padrão, era a primeira coisa que a
 * família via ao abrir o calendário no celular.
 *
 * Aqui o mesmo dado vira agenda vertical: só os dias que têm alguma coisa,
 * cada um com a data por extenso e as atividades legíveis. Quem quiser a grade
 * continua tendo — ela volta a partir de `md`.
 */
export function MonthAgenda({
  days,
  itemsByDate,
  monthLabel,
  onSelectActivity,
  onCreateForDay,
  onCreateWithoutDay,
}: Props) {
  const today = todayLocalIso();
  const filled = days.filter((iso) => (itemsByDate.get(iso)?.length ?? 0) > 0);

  if (filled.length === 0) {
    return (
      <section
        aria-label={`Agenda de ${monthLabel}`}
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <CalendarPlus className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold">Nada marcado em {monthLabel}</p>
          <p className="text-sm text-muted-foreground">
            Atividades sem prazo continuam na rotina e na lista. Elas não ganham data aqui.
          </p>
        </div>
        {/*
          Nome distinto do "Nova atividade" da barra de cima — os dois ficam
          visíveis ao mesmo tempo no celular quando o mês está vazio — e SEM
          data: prefixar hoje enquanto a pessoa navega por dezembro entregava o
          formulário com o dia errado.
        */}
        <Button variant="outline" onClick={onCreateWithoutDay}>
          <Plus className="size-4" aria-hidden />
          Criar a primeira atividade
        </Button>
      </section>
    );
  }

  return (
    <section aria-label={`Agenda de ${monthLabel}`} className="flex flex-col gap-3">
      {filled.map((iso) => {
        const dayItems = itemsByDate.get(iso) ?? [];
        const date = parseLocalIso(iso);
        const isToday = iso === today;
        return (
          <article
            key={iso}
            className={cn(
              "overflow-hidden rounded-2xl border bg-card",
              isToday && "border-primary/40",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
              <h3 className="flex min-w-0 items-baseline gap-2">
                <span className="text-lg font-extrabold leading-none tabular-nums">
                  {String(date.getDate()).padStart(2, "0")}
                </span>
                <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {WEEKDAY_SHORT_LABELS_SUNDAY_FIRST[date.getDay()]}
                </span>
                {isToday ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Hoje
                  </span>
                ) : null}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => onCreateForDay(iso)}
                aria-label={`Criar atividade em ${formatDayLabel(iso)}`}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 p-2">
              {dayItems.map((item) => (
                <ActivityBlip key={item.id} item={item} onSelect={() => onSelectActivity(item)} />
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
