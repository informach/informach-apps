import { Card, CardContent } from "@informach/ui/components/card";
import { cn } from "@informach/ui/lib/utils";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import {
  activityOverviewHref,
  type DueWindow,
  type OverviewStatus,
} from "@/features/unified-activities/overview-types";
import type { DashboardCounters } from "../types";

type KpiToken = "destructive" | "chart-4" | "primary" | "chart-2";

type KpiSpec = {
  key: keyof DashboardCounters;
  label: string;
  token: KpiToken;
  Icon: typeof AlertCircle;
  /** Recorte que abre exatamente as linhas que este número contou. */
  status: OverviewStatus;
  dueWindow: DueWindow;
};

// Mapeamento token → bucket segue convenção do app (CLAUDE.md §7):
// destructive = atrasado/erro, chart-4 (laranja) = atenção, primary = info,
// chart-2 (verde) = sucesso/concluído.
const KPIS: KpiSpec[] = [
  {
    key: "overdue",
    label: "Atrasadas",
    token: "destructive",
    Icon: AlertCircle,
    status: "pending",
    dueWindow: "atrasadas",
  },
  {
    key: "today",
    label: "Hoje",
    token: "chart-4",
    Icon: Clock,
    status: "pending",
    dueWindow: "hoje",
  },
  {
    key: "week",
    label: "Próximos 7 dias",
    token: "primary",
    Icon: CalendarDays,
    status: "pending",
    dueWindow: "semana",
  },
  {
    key: "doneRecent",
    label: "Concluídas (7d)",
    token: "chart-2",
    Icon: CheckCircle2,
    status: "done",
    dueWindow: "recentes",
  },
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
    label: "text-chart-4-ink",
    icon: "bg-chart-4/15 text-chart-4-ink",
  },
  primary: {
    card: "border-primary/40 bg-primary/10",
    label: "text-primary-ink",
    icon: "bg-primary/15 text-primary-ink",
  },
  "chart-2": {
    card: "border-chart-2/40 bg-chart-2/10",
    label: "text-chart-2-ink",
    icon: "bg-chart-2/15 text-chart-2-ink",
  },
};

type Props = {
  counters: DashboardCounters;
  /** Viaja para a lista junto do recorte, como no resto da rotina. */
  profileFilter: string | null;
};

/**
 * Os quatro números da rotina — e cada um abre a lista que ele contou.
 *
 * Eram `Card` mudos. O dado mais acionável da tela ("3 atrasadas") não levava a
 * lugar nenhum, e para ver quais eram as três a pessoa tinha que descer,
 * procurar no bucket e conferir de olho. O recorte que cada card abre replica o
 * `COUNT(*) FILTER` que o produziu, então a lista nunca discorda do número.
 *
 * Zero não vira link: não há o que abrir, e um alvo de toque que não faz nada é
 * pior do que nenhum.
 */
export function KpiCards({ counters, profileFilter }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {KPIS.map(({ key, label, token, Icon, status, dueWindow }) => {
        const value = counters[key];
        const classes = TOKEN_CLASSES[token];
        const empty = value === 0;
        const href = activityOverviewHref({
          profileFilter,
          typeFilter: null,
          statusFilter: status,
          dueWindow,
          noticeId: null,
          page: 1,
        });
        const body = (
          <CardContent className="flex items-center gap-3 p-4">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                classes.icon,
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              {/* Dado grande, rótulo pequeno: o número do KPI tinha o mesmo
                  tamanho do título da página. */}
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.08em]",
                  classes.label,
                )}
              >
                {label}
              </p>
              <p className="text-4xl font-extrabold leading-none tabular-nums text-foreground">
                {value}
              </p>
            </div>
            {empty ? null : (
              <ChevronRight className={cn("size-4 shrink-0", classes.label)} aria-hidden />
            )}
          </CardContent>
        );

        if (empty) {
          return (
            <Card key={key} className={cn(classes.card, "opacity-60")}>
              {body}
            </Card>
          );
        }

        return (
          <Card
            key={key}
            className={cn(
              classes.card,
              "transition-shadow focus-within:shadow-solid hover:shadow-solid motion-reduce:transition-none",
            )}
          >
            <Link
              href={href}
              aria-label={`${label}: ${value}. Ver na lista de atividades.`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {body}
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
