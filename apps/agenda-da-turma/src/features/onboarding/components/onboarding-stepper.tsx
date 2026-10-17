import { cn } from "@informach/ui/lib/utils";

export type OnboardingStepperProps = {
  /** Os nomes das etapas do caminho atual (ver `signupSteps`). */
  steps: string[];
  /** A etapa atual, a partir de 1. */
  currentStep: number;
  className?: string;
};

/**
 * As etapas do cadastro, no topo: "Passo 2 de 4: Código" e uma barra por
 * etapa, a atual mais comprida.
 *
 * Eram sempre três círculos numerados (cadastro, verificação, plano). O plano
 * saiu do cadastro e o caminho passou a depender de quem chega: quem escolheu
 * o Pro vai ao pagamento, quem foi convidado entra na casa de quem convidou, e
 * o resto cadastra a criança e manda o primeiro recado.
 */
export function OnboardingStepper({ steps, currentStep, className }: OnboardingStepperProps) {
  const current = steps[currentStep - 1] ?? "";
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <p className="text-sm font-bold text-muted-foreground">
        Passo {currentStep} de {steps.length}: {current}
      </p>
      <ol aria-label="Etapas do cadastro" className="flex items-center gap-1.5">
        {steps.map((label, index) => {
          const step = index + 1;
          const done = step < currentStep;
          const isCurrent = step === currentStep;
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "block h-2 rounded-full transition-[width] duration-200 motion-reduce:transition-none",
                  isCurrent ? "w-7" : "w-3",
                  done || isCurrent ? "bg-foreground" : "bg-foreground/15",
                )}
              />
              <span className="sr-only">
                {label}
                {done ? " (feita)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
