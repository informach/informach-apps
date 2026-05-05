"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { toast } from "@informach/ui/components/sonner";
import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { cn } from "@informach/ui/lib/utils";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { selectFreePlanAction, startProCheckoutAction } from "../actions";
import {
  type BillingCycle,
  FREE_FEATURES,
  type PlanFeature,
  PRICING,
  PRO_FEATURES,
} from "../plans-content";
import { OnboardingStepper } from "./onboarding-stepper";

export type PlanCardsProps = {
  initialCycle?: BillingCycle;
};

export function PlanCards({ initialCycle = "monthly" }: PlanCardsProps) {
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [isFreePending, startFreeTransition] = useTransition();
  const [isProPending, startProTransition] = useTransition();
  const proPlan = PRICING[cycle];
  const anyPending = isFreePending || isProPending;

  const handleFree = () => {
    startFreeTransition(async () => {
      const result = await selectFreePlanAction({});
      if (!result.ok) {
        toast.error("Não foi possível continuar.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      router.push(result.value.redirectTo);
    });
  };

  const handlePro = () => {
    startProTransition(async () => {
      const result = await startProCheckoutAction({ cycle });
      if (!result.ok) {
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
      <OnboardingStepper currentStep={3} />

      <header className="space-y-3 text-center">
        <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
          Escolha seu plano
        </h1>
        <p className="mx-auto max-w-md text-pretty text-sm text-muted-foreground md:text-base">
          Comece grátis ou desbloqueie a IA com o Pro. Você pode mudar de plano a qualquer momento.
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
                -20%
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="group relative flex flex-col border-border/60 bg-card/80 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
          <CardHeader className="space-y-3 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cozya Free
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">R$ 0</span>
              <span className="text-sm text-muted-foreground">para sempre</span>
            </div>
            <CardTitle className="text-base font-normal text-muted-foreground">
              Pra quem quer começar a organizar receitas sem custo.
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

        <Card className="group relative flex flex-col border-2 border-primary/40 bg-card shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-xl">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          />
          <Badge className="absolute -top-3 left-6 gap-1">
            <Sparkles className="size-3" aria-hidden />
            Mais popular
          </Badge>
          <CardHeader className="space-y-3 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Cozya Pro</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{proPlan.price}</span>
              <span className="text-sm text-muted-foreground">{proPlan.period}</span>
            </div>
            <p className="text-xs text-muted-foreground">{proPlan.note}</p>
            <CardTitle className="text-base font-normal text-muted-foreground">
              Pra quem quer usar a IA pra capturar receita de qualquer fonte.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <FeatureList features={PRO_FEATURES} />
            <Button size="lg" className="w-full" onClick={handlePro} disabled={anyPending}>
              {isProPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Assinar Pro
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Sem cartão pra começar. Sem fidelidade pra continuar.
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
              feature.included ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/60",
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
