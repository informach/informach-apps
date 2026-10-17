import { cn } from "@informach/ui/lib/utils";

const HINTS = {
  1: null,
  2: "Confira os dias e monte a lista do mercado.",
  3: "Antes de sair, toque no que já tem em casa.",
} as const;

/** The first week in three steps: the recipes, the days, the shopping list. */
export function FirstWeekSteps({ step }: { step: 1 | 2 | 3 }) {
  const hint = HINTS[step];
  return (
    <div className="space-y-2">
      {hint && (
        <p className="text-[13px] font-bold text-muted-foreground">
          Passo {step} de 3. <span className="font-medium">{hint}</span>
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {[1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn("h-[5px] rounded-full", index <= step ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
    </div>
  );
}
