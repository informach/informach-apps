"use client";

import { cn } from "@informach/ui/lib/utils";
import {
  type AgendaExtracurricularDay,
  EXTRA_CLASS_DAY_LABEL_FULL,
  EXTRA_CLASS_DAY_LABEL_SHORT,
  EXTRA_CLASS_DAY_VALUES,
} from "../class-days";

type Props = {
  value: AgendaExtracurricularDay[];
  onChange: (next: AgendaExtracurricularDay[]) => void;
  disabled?: boolean;
};

// Toggle group horizontal Seg-Dom para extracurriculares (jazz pode ser
// sábado, futebol no domingo). Pure controlled — caller (RHF) controla
// state. Mantém ordem canônica entre re-renders.
export function ExtraClassDaysPicker({ value, onChange, disabled }: Props) {
  const selected = new Set(value);
  const toggle = (day: AgendaExtracurricularDay) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange(EXTRA_CLASS_DAY_VALUES.filter((d) => next.has(d)));
  };

  return (
    <fieldset aria-label="Dias da semana" className="flex flex-wrap gap-2 border-0 p-0 m-0">
      {EXTRA_CLASS_DAY_VALUES.map((day) => {
        const isOn = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            aria-pressed={isOn}
            aria-label={EXTRA_CLASS_DAY_LABEL_FULL[day]}
            onClick={() => toggle(day)}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isOn
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {EXTRA_CLASS_DAY_LABEL_SHORT[day]}
          </button>
        );
      })}
    </fieldset>
  );
}
