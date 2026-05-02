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
    <ol
      aria-label="Etapas do cadastro"
      className={cn("flex w-full items-start gap-1.5 sm:gap-3", className)}
    >
      {STEPS.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <li
            key={step.id}
            aria-current={isCurrent ? "step" : undefined}
            className="flex flex-1 items-start gap-1.5 sm:gap-3"
          >
            <div className="flex flex-1 flex-col items-center gap-2">
              <span
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200",
                  isCompleted && "border-primary bg-primary text-primary-foreground shadow-sm",
                  isCurrent && "border-primary bg-background text-primary ring-4 ring-primary/15",
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
            </div>
            {!isLast && (
              <div
                aria-hidden
                className={cn(
                  "mt-[18px] h-0.5 flex-1 rounded-full transition-colors duration-200",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
