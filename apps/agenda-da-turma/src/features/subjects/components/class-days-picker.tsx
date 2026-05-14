"use client";

import { cn } from "@informach/ui/lib/utils";
import { type AgendaClassDay, CLASS_DAY_LABEL_FULL, CLASS_DAY_VALUES } from "../class-days";

type Props = {
  value: AgendaClassDay[];
  onChange: (next: AgendaClassDay[]) => void;
  disabled?: boolean;
};

// Toggle group horizontal Seg-Sex. v1 não cobre sábado/domingo (escolas BR
// raramente têm aula nesses dias) — se virar caso comum, basta expandir
// AGENDA_CLASS_DAYS + check constraint na DB. Pure controlled: o caller
// (React Hook Form via FormField) gerencia state.
export function ClassDaysPicker({ value, onChange, disabled }: Props) {
  const selected = new Set(value);
  const toggle = (day: AgendaClassDay) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    // Devolve em ordem canônica Seg→Sex pra evitar churn entre re-renders.
    onChange(CLASS_DAY_VALUES.filter((d) => next.has(d)));
  };

  return (
    <fieldset aria-label="Dias da semana" className="flex flex-wrap gap-2 border-0 p-0 m-0">
      {CLASS_DAY_VALUES.map((day) => {
        const isOn = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            aria-pressed={isOn}
            aria-label={CLASS_DAY_LABEL_FULL[day]}
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
            {day === "mon"
              ? "Seg"
              : day === "tue"
                ? "Ter"
                : day === "wed"
                  ? "Qua"
                  : day === "thu"
                    ? "Qui"
                    : "Sex"}
          </button>
        );
      })}
    </fieldset>
  );
}
