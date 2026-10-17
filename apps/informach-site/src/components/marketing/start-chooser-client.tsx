"use client";

import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { type ReactNode, useState } from "react";

export type ChooserOption = { id: string; label: string; panel: ReactNode };

/**
 * Situações da casa ligadas ao produto certo. Os painéis chegam prontos do
 * servidor; sem JavaScript, o primeiro fica visível e os botões desabilitados.
 */
export function StartChooserClient({ options }: { options: readonly ChooserOption[] }) {
  const hydrated = useHydrated();
  const [selected, setSelected] = useState(options[0]?.id);
  return (
    <>
      <fieldset className="m-0 flex flex-wrap gap-2.5 border-0 p-0">
        <legend className="sr-only">Escolha uma situação</legend>
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              aria-controls={`painel-${option.id}`}
              disabled={!hydrated}
              onClick={() => setSelected(option.id)}
              className={cn(
                "min-h-12 cursor-pointer rounded-full border-2 px-[18px] text-[15px] font-bold transition-colors disabled:cursor-default",
                active
                  ? "border-night-ink bg-night-ink text-night"
                  : "border-night-ink/35 bg-transparent text-night-ink hover:border-night-ink/70",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      <div aria-live="polite">
        {options.map((option) => (
          <div key={option.id} id={`painel-${option.id}`} hidden={option.id !== selected}>
            {option.panel}
          </div>
        ))}
      </div>
    </>
  );
}
