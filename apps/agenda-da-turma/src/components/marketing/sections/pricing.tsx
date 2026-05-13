"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ANNUAL_SAVINGS_PCT,
  type BillingCycle,
  FREE_FEATURES,
  PRICING,
  PRO_FEATURES,
} from "@/features/billing/plans-content";

const QUERY_CYCLE: Record<BillingCycle, string> = {
  monthly: "mensal",
  annual: "anual",
};

export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const proPlan = PRICING[cycle];

  return (
    <section id="planos" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Planos</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Comece grátis. Cresça quando precisar.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Sem cartão pra começar. Sem fidelidade pra continuar.
        </p>

        <div className="mt-8 flex justify-center">
          <Tabs value={cycle} onValueChange={(value) => setCycle(value as BillingCycle)}>
            <TabsList>
              <TabsTrigger value="monthly" className="px-5">
                {PRICING.monthly.tabLabel}
              </TabsTrigger>
              <TabsTrigger value="annual" className="px-5">
                {PRICING.annual.tabLabel}
                <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0 text-[10px]">
                  -{ANNUAL_SAVINGS_PCT}%
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
        <Card className="flex flex-col border-border/70">
          <CardHeader className="space-y-3 pb-4">
            <p className="text-sm font-medium text-muted-foreground">Agenda da Turma Free</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">R$ 0</span>
              <span className="text-sm text-muted-foreground">pra sempre</span>
            </div>
            <CardTitle className="text-base font-normal text-muted-foreground">
              Pra começar a organizar a rotina de um filho sem custo nenhum.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <ul className="space-y-3">
              {FREE_FEATURES.map((feature) => (
                <li
                  key={feature.label}
                  className={`flex items-start gap-3 text-sm ${
                    feature.included ? "" : "text-muted-foreground/70"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                      feature.included
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground/60"
                    }`}
                  >
                    <Check className="size-3" aria-hidden />
                  </span>
                  <span className="leading-relaxed">{feature.label}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="lg" asChild>
              <Link href="/signup">Começar grátis</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="relative flex flex-col border-2 border-primary/50 shadow-lg">
          <Badge className="absolute -top-3 left-6 gap-1">
            <Sparkles className="size-3" aria-hidden />
            Mais escolhido
          </Badge>
          <CardHeader className="space-y-3 pb-4">
            <p className="text-sm font-medium text-primary">Agenda da Turma Pro</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{proPlan.price}</span>
              <span className="text-sm text-muted-foreground">{proPlan.period}</span>
            </div>
            <p className="text-xs text-muted-foreground">{proPlan.note}</p>
            <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-3 text-center">
              <p className="text-xl font-semibold text-primary">70 créditos de IA por mês</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dá pra cadastrar 70 atividades por foto ou PDF, ou 35 por voz
              </p>
            </div>
            <CardTitle className="text-base font-normal text-muted-foreground">
              Pra família com mais de um filho ou que quer cadastrar tudo pela IA.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <ul className="space-y-3">
              {PRO_FEATURES.map((feature) => (
                <li key={feature.label} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3" aria-hidden />
                  </span>
                  <span className="leading-relaxed">{feature.label}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-3">
              <Button size="lg" className="w-full" asChild>
                <Link href={`/signup?plan=pro&cycle=${QUERY_CYCLE[cycle]}`}>Assinar Pro</Link>
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Quando os créditos do mês acabam, recursos de IA pausam até a renovação ou compra
                avulsa. O cadastro manual de atividades continua liberado.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
