"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { toast } from "@informach/ui/components/sonner";
import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { cn } from "@informach/ui/lib/utils";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { recordOfferSeenAction } from "@/features/kitchen/event-actions";
import { TRIAL_DAYS } from "@/features/kitchen/trial";
import { selectFreePlanAction, startProCheckoutAction } from "@/features/onboarding/actions";
import { OnboardingStepper } from "@/features/onboarding/components/onboarding-stepper";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import {
  ANNUAL_SAVINGS_PCT,
  type BillingCycle,
  FREE_FEATURES,
  type PlanFeature,
  PRICING,
  PRO_FEATURES,
  PRO_MONTHLY_CREDITS,
} from "../plans-content";

export type PlanCardsProps = {
  initialCycle?: BillingCycle;
  /**
   * Mostra as etapas "Conta, Código, Plano" do cadastro de quem escolheu o Pro na página.
   * Default `true` mantém o uso histórico em /choose-plan; passe `false` em
   * /upgrade (usuário já está dentro do app).
   */
  showStepper?: boolean;
  /**
   * Mostra o card do plano Free. Default `true` para o onboarding. Passe
   * `false` em /upgrade: quem já está no app não precisa reescolher o Free.
   */
  showFreePlan?: boolean;
  /** h2 when the page already has its own title, as in the end-of-trial summary. */
  titleAs?: "h1" | "h2";
};

export function PlanCards({
  initialCycle = "monthly",
  showStepper = true,
  showFreePlan = true,
  titleAs: Title = "h1",
}: PlanCardsProps) {
  const router = useRouter();
  useEffect(() => {
    void catchActionResult(() => recordOfferSeenAction({}));
  }, []);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [isFreePending, startFreeTransition] = useTransition();
  const [isProPending, startProTransition] = useTransition();
  const proPlan = PRICING[cycle];
  const anyPending = isFreePending || isProPending;

  const handleFree = () => {
    startFreeTransition(async () => {
      const result = await catchActionResult(() => selectFreePlanAction({}));
      if (!result.ok) {
        toast.error("Não foi possível continuar.", {
          description: isActionRejected(result.error)
            ? "Atualize a página e tente novamente."
            : "Tente novamente em instantes.",
        });
        return;
      }
      router.push(result.value.redirectTo);
    });
  };

  const handlePro = () => {
    startProTransition(async () => {
      const result = await catchActionResult(() => startProCheckoutAction({ cycle }));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível abrir o checkout.", {
            description: "Atualize a página e tente novamente.",
          });
          return;
        }
        if (result.error.code === "PRO_NOT_CONFIGURED") {
          toast("Plano Pro ainda não configurado.", {
            description: "Voltamos em breve com o Pro disponível. Por enquanto, escolha o Free.",
          });
          return;
        }
        if (result.error.code === "ALREADY_SUBSCRIBED") {
          toast("Você já tem o Pro ativo.", {
            description: "Indo para a tela de plano para você gerenciar a assinatura.",
          });
          router.push("/settings/billing");
          return;
        }
        if (result.error.code === "UNAUTHORIZED") {
          router.push("/login");
          return;
        }
        toast.error("Não foi possível abrir o checkout.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      window.location.href = result.value.url;
    });
  };

  return (
    <div className="w-full max-w-5xl space-y-8">
      {showStepper && <OnboardingStepper currentStep={3} />}

      <header className="space-y-3 text-center">
        <Title className="text-balance text-[30px] font-extrabold tracking-display md:text-4xl">
          {showFreePlan ? "Escolha como começar" : "Cozya Pro"}
        </Title>
        <p className="mx-auto max-w-md text-pretty text-[15px] text-muted-foreground md:text-base">
          {showFreePlan
            ? `Comece com ${TRIAL_DAYS} dias grátis ou assine o Pro agora. Dá para mudar quando quiser.`
            : "A semana inteira: planejar, comprar e cozinhar. Cancele pela conta quando quiser."}
        </p>
      </header>

      <div className="flex justify-center">
        <Tabs value={cycle} onValueChange={(value) => setCycle(value as BillingCycle)}>
          <TabsList>
            <TabsTrigger value="monthly" className="px-5">
              {PRICING.monthly.tabLabel}
            </TabsTrigger>
            <TabsTrigger value="annual" className="px-5">
              {PRICING.annual.tabLabel}
              <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0 text-[10px]">
                economize {ANNUAL_SAVINGS_PCT}%
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className={cn("grid gap-5", showFreePlan ? "md:grid-cols-2" : "mx-auto max-w-md")}>
        {showFreePlan && (
          <Card className="group relative flex flex-col border-border/60 bg-card/80 backdrop-blur transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
            <CardHeader className="space-y-3 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cozya Free
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">R$ 0</span>
                <span className="text-sm text-muted-foreground">para sempre</span>
              </div>
              <CardTitle className="text-base font-normal text-muted-foreground">
                Para começar sem pagar: {TRIAL_DAYS} dias de planejamento e, depois, o Free.
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-6">
              <FeatureList features={FREE_FEATURES} />
              <Button
                variant="outline"
                size="lg"
                onClick={handleFree}
                disabled={anyPending}
                className="w-full"
              >
                {isFreePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Começar grátis
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="group relative flex flex-col border-2 border-primary bg-card shadow-sm">
          <Badge className="absolute -top-3 left-6">Para a semana inteira</Badge>
          <CardHeader className="space-y-3 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-ink">
              Cozya Pro
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{proPlan.price}</span>
              <span className="text-sm text-muted-foreground">{proPlan.period}</span>
            </div>
            <p className="text-xs text-muted-foreground">{proPlan.note}</p>
            <CardTitle className="text-base font-normal text-muted-foreground">
              Planejar, comprar e cozinhar, com {PRO_MONTHLY_CREDITS} créditos de IA por mês.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <FeatureList features={PRO_FEATURES} />
            <Button size="lg" className="w-full" onClick={handlePro} disabled={anyPending}>
              {isProPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {cycle === "annual" ? "Assinar o Pro anual" : "Assinar o Pro mensal"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {showFreePlan ? "Sem cartão para começar. " : ""}Cancele pela conta quando quiser.
      </p>
    </div>
  );
}

function FeatureList({ features }: { features: PlanFeature[] }) {
  return (
    <ul className="space-y-3">
      {features.map((feature) => (
        <li
          key={feature.label}
          className={cn(
            "flex items-start gap-3 text-sm",
            !feature.included && "text-muted-foreground/70",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
              feature.included
                ? "bg-primary/15 text-brand-ink"
                : "bg-muted text-muted-foreground/60",
            )}
          >
            <Check className="size-3" aria-hidden />
          </span>
          <span className="leading-relaxed">{feature.label}</span>
        </li>
      ))}
    </ul>
  );
}
