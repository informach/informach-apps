import { Card, CardContent } from "@informach/ui/components/card";
import { cn } from "@informach/ui/lib/utils";
import { AlertCircle, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import type { DashboardCounters } from "../types";

type KpiToken = "destructive" | "chart-4" | "primary" | "chart-2";

type KpiSpec = {
  key: keyof DashboardCounters;
  label: string;
  token: KpiToken;
  Icon: typeof AlertCircle;
};

// Mapeamento token → bucket segue convenção do app (CLAUDE.md §7):
// destructive = atrasado/erro, chart-4 (laranja) = atenção, primary = info,
// chart-2 (verde) = sucesso/concluído.
const KPIS: KpiSpec[] = [
  { key: "overdue", label: "Atrasadas", token: "destructive", Icon: AlertCircle },
  { key: "today", label: "Hoje", token: "chart-4", Icon: Clock },
  { key: "week", label: "Próximos 7 dias", token: "primary", Icon: CalendarDays },
  { key: "doneRecent", label: "Concluídas (7d)", token: "chart-2", Icon: CheckCircle2 },
];

// Tailwind precisa ver a string da classe completa pra extrair —
// arbitrary token interpolation não funciona com JIT. Por isso o
// dicionário literal abaixo (em vez de `bg-${token}/10`).
const TOKEN_CLASSES: Record<KpiToken, { card: string; label: string; icon: string }> = {
  destructive: {
    card: "border-destructive/40 bg-destructive/10",
    label: "text-destructive",
    icon: "bg-destructive/15 text-destructive",
  },
  "chart-4": {
    card: "border-chart-4/40 bg-chart-4/10",
    label: "text-chart-4",
    icon: "bg-chart-4/15 text-chart-4",
  },
  primary: {
    card: "border-primary/40 bg-primary/10",
    label: "text-primary",
    icon: "bg-primary/15 text-primary",
  },
  "chart-2": {
    card: "border-chart-2/40 bg-chart-2/10",
    label: "text-chart-2",
    icon: "bg-chart-2/15 text-chart-2",
  },
};

type Props = {
  counters: DashboardCounters;
};

export function KpiCards({ counters }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {KPIS.map(({ key, label, token, Icon }) => {
        const value = counters[key];
        const classes = TOKEN_CLASSES[token];
        const empty = value === 0;
        return (
          <Card key={key} className={cn(classes.card, empty && "opacity-60")}>
            <CardContent className="flex items-center gap-3 p-4">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  classes.icon,
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className={cn("text-xs font-medium uppercase tracking-wide", classes.label)}>
                  {label}
                </p>
                <p className="text-3xl font-bold leading-tight text-foreground">{value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
