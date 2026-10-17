import { cn } from "@informach/ui/lib/utils";

export type OnboardingStepperProps = {
  /** Os nomes das etapas do caminho atual (ver `signupSteps`). */
  steps: string[];
  /** A etapa atual, a partir de 1. */
  currentStep: number;
  className?: string;
};

/**
 * As etapas do cadastro, no canto de cima: uma barra por etapa, a atual mais
 * comprida, como no canvas. O texto ("Passo 2 de 4: Código") é o nome da
 * figura para quem usa leitor de tela; na tela, as barras bastam.
 *
 * Eram sempre três círculos numerados (cadastro, verificação, plano). O plano
 * saiu do cadastro e o caminho passou a depender de quem chega: quem escolheu
 * o Pro vai ao pagamento, quem foi convidado entra na casa de quem convidou, e
 * o resto cadastra a criança e manda o primeiro recado.
 */
export function OnboardingStepper({ steps, currentStep, className }: OnboardingStepperProps) {
  const current = steps[currentStep - 1] ?? "";
  return (
    <div
      role="img"
      aria-label={`Passo ${currentStep} de ${steps.length}: ${current}`}
      className={cn("flex gap-1.5", className)}
    >
      {steps.map((label, index) => {
        const step = index + 1;
        return (
          <span
            key={label}
            className={cn(
              "block h-2 rounded-full transition-[width] duration-200 motion-reduce:transition-none",
              step === currentStep ? "w-7" : "w-3",
              step <= currentStep ? "bg-foreground" : "bg-foreground/15",
            )}
          />
        );
      })}
    </div>
  );
}
