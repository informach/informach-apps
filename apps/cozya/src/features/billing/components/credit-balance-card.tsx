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
   * Monthly grant of the active subscription (e.g. 30 for Cozya Pro). Used
   * as the denominator of the progress bar and the "X de N" label. When 0
   * (Free user without subscription), the bar is hidden and copy adapts.
   */
  monthlyCap: number;
};

export function CreditBalanceCard({ available, total, reserved, monthlyCap }: Props) {
  const hasPlan = monthlyCap > 0;
  // Show progress against the monthly cap. When the user has bought extra
  // packs (total > cap) the bar caps at 100% — the caption explains the rest.
  const percent = hasPlan ? Math.min(100, (available / monthlyCap) * 100) : 0;
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
                Cada vez que a IA é usada (gerar, extrair, refinar) consome 1 crédito —
                independente de você salvar a receita ou não.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatNumber(available)}
          {hasPlan ? (
            <span className="ml-1 text-base font-normal text-muted-foreground tabular-nums">
              / {formatNumber(monthlyCap)}
            </span>
          ) : null}
        </div>
        {hasPlan ? (
          <Progress value={percent} className="h-2" aria-label="Progresso dos créditos do mês" />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {hasPlan
            ? extras > 0
              ? `+ ${formatNumber(extras)} créditos extras de pacotes${reserved > 0 ? ` · ${formatNumber(reserved)} reservados` : ""}.`
              : reserved > 0
                ? `${formatNumber(reserved)} reservados em chamadas em andamento.`
                : `Renova ao final do ciclo da sua assinatura.`
            : "Assine o Cozya Pro para liberar créditos de IA."}
        </p>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
