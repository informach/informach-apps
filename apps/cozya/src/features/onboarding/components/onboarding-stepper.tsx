"use client";

import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";

type Step = { id: 1 | 2 | 3; label: string };

const STEPS: readonly Step[] = [
  { id: 1, label: "Cadastro" },
  { id: 2, label: "Verificação" },
  { id: 3, label: "Plano" },
] as const;

export type OnboardingStepperProps = {
  currentStep: 1 | 2 | 3;
  className?: string;
};

export function OnboardingStepper({ currentStep, className }: OnboardingStepperProps) {
  return (
    <ol aria-label="Etapas do cadastro" className={cn("grid w-full grid-cols-3", className)}>
      {STEPS.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <li
            key={step.id}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-col items-center gap-2"
          >
            {!isLast && (
              <div
                aria-hidden
                className={cn(
                  "absolute left-1/2 top-[18px] z-0 h-0.5 w-full rounded-full transition-colors duration-200",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200",
                isCompleted && "border-primary bg-primary text-primary-foreground shadow-sm",
                isCurrent && "border-primary bg-background text-brand-ink ring-4 ring-primary/15",
                !isCompleted && !isCurrent && "border-border bg-background text-muted-foreground",
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" aria-hidden /> : step.id}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-wide sm:text-xs",
                isCurrent
                  ? "text-foreground"
                  : isCompleted
                    ? "text-foreground/70"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
