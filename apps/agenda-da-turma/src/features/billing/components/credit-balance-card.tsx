"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Progress } from "@informach/ui/components/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@informach/ui/components/tooltip";
import { Info, Sparkles } from "lucide-react";

type Props = {
  /** Available balance (total - reserved). */
  available: number;
  /** Total credits granted (purchases + bonuses, minus consumption). */
  total: number;
  /** Credits in active reservations (in-flight LLM calls). */
  reserved: number;
  /**
   * Monthly grant of the active subscription (e.g. 50 for Agenda da Turma Pro).
   * Used as the denominator of the progress bar and the "X de N" label. When 0
   * (Free user without subscription), the bar is hidden and copy adapts.
   */
  monthlyCap: number;
};

export function CreditBalanceCard({ available, total, reserved, monthlyCap }: Props) {
  const hasPlan = monthlyCap > 0;
  const cycleAvailable = hasPlan ? Math.min(available, monthlyCap) : 0;
  const percent = hasPlan ? (cycleAvailable / monthlyCap) * 100 : 0;
  const extras = Math.max(0, total - monthlyCap);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          Créditos disponíveis
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help rounded-full text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Como os créditos funcionam"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Cada vez que a IA é usada consome 1 crédito.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {formatNumber(available)}
            {hasPlan ? (
              <span className="ml-1 text-base font-normal text-muted-foreground tabular-nums">
                / {formatNumber(monthlyCap)}
              </span>
            ) : null}
          </div>
          {extras > 0 ? (
            <span
              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums"
              title={`${formatNumber(extras)} créditos extras de pacotes não expiram com o ciclo`}
            >
              +{formatNumber(extras)} de pacotes
            </span>
          ) : null}
        </div>
        {hasPlan ? (
          <Progress
            value={percent}
            className="h-2"
            aria-label="Progresso dos créditos do mês (sem contar extras de pacotes)"
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {hasPlan
            ? extras > 0
              ? `Barra mostra o ciclo mensal. Extras de pacotes não expiram${reserved > 0 ? ` · ${formatNumber(reserved)} reservados em chamadas em andamento` : ""}.`
              : reserved > 0
                ? `${formatNumber(reserved)} reservados em chamadas em andamento.`
                : `Renova ao final do ciclo da sua assinatura.`
            : "Assine o Pro para liberar créditos de IA."}
        </p>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
