import { daysAgo } from "@/lib/format";
import { productName, SERVICE_KEYS, SERVICES, type ServiceKey } from "@/lib/products";
import {
  probeAll,
  problemText,
  readStoredStatus,
  type ServiceCheck,
  type ServiceState,
} from "@/lib/services";
import { isSameAvailability } from "../alerts/decide";
import { aiTaskOutcome } from "../money/logic";
import { type EmailOutcome, emailCategoryLabel, emailOutcome } from "./email-labels";
import {
  aiCostSince,
  emailCountsSince,
  latestRuns,
  migrationState,
  reservationCountsSince,
  runCountsSince,
} from "./repository";
import {
  type LastRun,
  ROUTINES,
  type RoutineDefinition,
  type RoutineState,
  routineState,
} from "./routines";
import { type SentryOverview, sentryOverview } from "./sentry";

export type ServiceRow = {
  key: ServiceKey;
  name: string;
  state: ServiceState;
  /** Desde quando está neste estado, pela vigia; null se acabou de mudar. */
  since: Date | null;
  latencyMs: number | null;
  commit: string | null;
  problem: string | null;
  database: string;
};

/** Frase da coluna "Banco", a partir da resposta do `/api/ready`. */
export function databaseText(
  key: ServiceKey,
  check: Pick<ServiceCheck, "state" | "problem">,
): string {
  if (key === "site") return "não usa";
  if (check.problem === "schema_behind") return "atrás desta versão";
  if (check.problem === "database_unreachable") return "sem acesso ao banco";
  if (check.state === "down") return "não conferido";
  return "em dia";
}

export function buildServiceRows(
  checks: readonly ServiceCheck[],
  stored: ReadonlyMap<string, { state: string; since: Date }>,
): ServiceRow[] {
  const byKey = new Map(checks.map((check) => [check.key, check]));
  return SERVICE_KEYS.flatMap((key) => {
    const check = byKey.get(key);
    if (!check) return [];
    const previous = stored.get(key);
    return [
      {
        key,
        name: SERVICES[key].name,
        state: check.state,
        // No ar e lento são o mesmo período: o "desde" só reinicia na queda e na volta.
        since: previous && isSameAvailability(previous.state, check.state) ? previous.since : null,
        latencyMs: check.latencyMs,
        commit: check.commit,
        problem: check.state === "down" ? problemText(check) || null : null,
        database: databaseText(key, check),
      },
    ];
  });
}

export type RoutineRow = RoutineDefinition & {
  appName: string;
  state: RoutineState;
  last: LastRun | null;
  runs24h: number;
  failures24h: number;
};

export function buildRoutineRows(
  runs: ReadonlyArray<LastRun & { app: string; job: string }>,
  counts: ReadonlyArray<{ app: string; job: string; runs: number; failures: number }>,
  now: Date,
): RoutineRow[] {
  const key = (app: string, job: string) => `${app}/${job}`;
  const lastByKey = new Map(runs.map((run) => [key(run.app, run.job), run]));
  const countByKey = new Map(counts.map((item) => [key(item.app, item.job), item]));
  return ROUTINES.map((routine) => {
    const last = lastByKey.get(key(routine.app, routine.job)) ?? null;
    const count = countByKey.get(key(routine.app, routine.job));
    return {
      ...routine,
      appName: routine.app === "admin" ? "Bastidores" : productName(routine.app),
      state: routineState(routine, last, now),
      last,
      runs24h: count?.runs ?? 0,
      failures24h: count?.failures ?? 0,
    };
  });
}

export type EmailCategoryRow = { label: string; day: number; week: number; weekLost: number };
export type EmailSummary = {
  day: Record<EmailOutcome, number>;
  categories: EmailCategoryRow[];
};

function emptyOutcomes(): Record<EmailOutcome, number> {
  return { delivered: 0, sent: 0, retrying: 0, lost: 0, skipped: 0 };
}

export function buildEmailSummary(
  day: ReadonlyArray<{ category: string; status: string; retryScheduled: boolean; count: number }>,
  week: ReadonlyArray<{ category: string; status: string; retryScheduled: boolean; count: number }>,
): EmailSummary {
  const totals = emptyOutcomes();
  const categories = new Map<string, EmailCategoryRow>();
  const row = (category: string) => {
    const label = emailCategoryLabel(category);
    const existing = categories.get(label);
    if (existing) return existing;
    const created = { label, day: 0, week: 0, weekLost: 0 };
    categories.set(label, created);
    return created;
  };
  for (const item of day) {
    totals[emailOutcome(item.status, item.retryScheduled)] += item.count;
    row(item.category).day += item.count;
  }
  for (const item of week) {
    const target = row(item.category);
    target.week += item.count;
    if (emailOutcome(item.status, item.retryScheduled) === "lost") target.weekLost += item.count;
  }
  return {
    day: totals,
    categories: [...categories.values()].sort(
      (a, b) => b.week - a.week || a.label.localeCompare(b.label),
    ),
  };
}

export type AiRow = {
  app: string;
  appName: string;
  tasks: number;
  active: number;
  returned: number;
  /** Parte das tarefas encerradas que devolveu o crédito; null sem tarefa encerrada. */
  failureRate: number | null;
  reportedUsd: number;
  /** Parte das execuções em que o provedor informou o custo; null sem execução. */
  costCoverage: number | null;
};

export function buildAiRows(
  reservations: ReadonlyArray<{ app: string; status: string; count: number }>,
  costs: ReadonlyArray<{ app: string; runs: number; withCost: number; reportedUsd: number }>,
): AiRow[] {
  const rows = new Map<string, AiRow>();
  const row = (app: string) => {
    const existing = rows.get(app);
    if (existing) return existing;
    const created: AiRow = {
      app,
      appName: productName(app),
      tasks: 0,
      active: 0,
      returned: 0,
      failureRate: null,
      reportedUsd: 0,
      costCoverage: null,
    };
    rows.set(app, created);
    return created;
  };
  // A mesma regra do Painel, de Produtos e de Dinheiro (`aiTaskOutcome`).
  for (const app of new Set(reservations.map((item) => item.app))) {
    const outcome = aiTaskOutcome(
      reservations
        .filter((item) => item.app === app)
        .map((item) => ({ status: item.status, total: item.count })),
    );
    Object.assign(row(app), {
      tasks: outcome.tasks,
      active: outcome.active,
      returned: outcome.returned,
      failureRate: outcome.failureRate,
    });
  }
  for (const item of costs) {
    const target = row(item.app);
    target.reportedUsd = item.reportedUsd;
    target.costCoverage = item.runs > 0 ? item.withCost / item.runs : null;
  }
  return [...rows.values()].sort((a, b) => b.tasks - a.tasks || a.appName.localeCompare(b.appName));
}

export type OperationsView = {
  checkedAt: Date;
  services: ServiceRow[];
  migrations: Awaited<ReturnType<typeof migrationState>>;
  routines: RoutineRow[];
  emails: EmailSummary;
  ai: AiRow[];
  sentry: SentryOverview;
};

export async function getOperationsView(now: Date = new Date()): Promise<OperationsView> {
  const since24h = daysAgo(1, now);
  const since7d = daysAgo(7, now);
  const [
    checks,
    stored,
    migrations,
    runs,
    counts,
    emailDay,
    emailWeek,
    reservations,
    costs,
    sentry,
  ] = await Promise.all([
    probeAll(),
    readStoredStatus(),
    migrationState(),
    latestRuns(),
    runCountsSince(since24h),
    emailCountsSince(since24h),
    emailCountsSince(since7d),
    reservationCountsSince(since7d),
    aiCostSince(since7d),
    sentryOverview(),
  ]);
  return {
    checkedAt: checks[0]?.checkedAt ?? now,
    services: buildServiceRows(checks, stored),
    migrations,
    routines: buildRoutineRows(runs, counts, now),
    emails: buildEmailSummary(emailDay, emailWeek),
    ai: buildAiRows(reservations, costs),
    sentry,
  };
}
