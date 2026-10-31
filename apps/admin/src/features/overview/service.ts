import "server-only";
import type { Staff } from "@/lib/access";
import {
  daysAgo,
  formatBRL,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTime,
  shortCommit,
} from "@/lib/format";
import { stripeLinks } from "@/lib/links";
import { PRODUCTS, type ProductKey, SERVICES } from "@/lib/products";
import {
  probeAll,
  problemText,
  readStoredStatus,
  type ServiceCheck,
  type StoredServiceStatus,
} from "@/lib/services";
import { isSameAvailability } from "../alerts/decide";
import {
  type AppSubscriptions,
  aiTaskOutcome,
  summarizeSubscriptions,
  WEBHOOK_WINDOW_DAYS,
  webhookConsequence,
  webhookNeedsResend,
  webhookProduct,
} from "../money/logic";
import {
  overdueReservations,
  pastDueByApp,
  subscriptionStatusRows,
  webhookProblems,
  webhookProblemTotals,
} from "../money/repository";
import { emailCountsSince, latestRuns } from "../operations/repository";
import { buildRoutineRows } from "../operations/service";
import { usageFor } from "../products/repository";
import {
  type AttentionItem,
  attentionHeadline,
  countLabel,
  dailySeries,
  emailCategoryPhrase,
  joinPhrases,
  lostEmailsByCategory,
  routineAttention,
  type SeriesPoint,
  seriesTotal,
  sortAttention,
  stripeWebhookTitle,
} from "./logic";
import { capitalize, inProduct, SERVICE_SUBJECT } from "./phrases";
import {
  accountTotals,
  aiWeek,
  multiProductAccounts,
  openContentReports,
  signupsPerDay,
} from "./repository";

export type ServiceCard = {
  key: ServiceCheck["key"];
  name: string;
  state: ServiceCheck["state"];
  /** Linha de baixo: versão e tempo no ar, ou o problema e desde quando. */
  line: string;
  commit: string | null;
};

function storedSince(check: ServiceCheck, stored: StoredServiceStatus | undefined): Date | null {
  // O "desde" só vale quando a vigia viu o serviço do mesmo lado que a conferência
  // de agora: fora do ar, ou no ar (lento conta como no ar).
  return stored && isSameAvailability(stored.state, check.state) ? stored.since : null;
}

export function serviceCard(
  check: ServiceCheck,
  stored: StoredServiceStatus | undefined,
  now: Date,
): ServiceCard {
  const since = storedSince(check, stored);
  const commit = check.commit ?? shortCommit(stored?.commit ?? null);
  let line: string;
  if (check.state === "down") {
    line = `${capitalize(problemText(check)) || "Não respondeu"}${since ? `, desde ${formatTime(since)}` : ""}`;
  } else if (check.state === "slow") {
    const seconds = ((check.latencyMs ?? 0) / 1000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    line = `Respondeu em ${seconds} s na última verificação`;
  } else {
    line = [commit, since ? `no ar ${formatRelative(since, now)}` : null]
      .filter(Boolean)
      .join(" · ");
    if (!line) line = "Respondeu agora";
  }
  return { key: check.key, name: SERVICES[check.key].name, state: check.state, line, commit };
}

function serviceAttention(
  cards: ServiceCard[],
  checks: ServiceCheck[],
  stored: Map<string, StoredServiceStatus>,
  now: Date,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const check of checks) {
    const subject = SERVICE_SUBJECT[check.key];
    const since = storedSince(check, stored.get(check.key));
    if (check.state === "down") {
      items.push({
        id: `service-down-${check.key}`,
        tone: "bad",
        title: `${subject.the} está fora do ar${since ? ` há ${formatDuration(now.getTime() - since.getTime())}` : ""}.`,
        detail: `${capitalize(problemText(check)) || "Não respondeu"}. Veja o último deploy em Operação.`,
        href: "/operacao",
        weight: since ? now.getTime() - since.getTime() : 0,
      });
    } else if (check.state === "slow") {
      const card = cards.find((item) => item.key === check.key);
      items.push({
        id: `service-slow-${check.key}`,
        tone: "warn",
        title: `${subject.the} está ${subject.feminine ? "lenta" : "lento"}.`,
        detail: `${card?.line ?? "Demorou para responder"}. Se continuar, confira em Operação.`,
        href: "/operacao",
      });
    }
  }
  return items;
}

export type ProductCard = {
  product: ProductKey;
  stats: { value: string; label: string }[];
  note?: string;
};

export type AiSummary = {
  costUsd: number;
  runs: number;
  runsWithCost: number;
  runsWithoutCost: { app: string; total: number }[];
  tasks: number;
  returned: number;
  /** Parte das tarefas encerradas que falhou e devolveu o crédito; null sem tarefa encerrada. */
  failureRate: number | null;
};

export type Overview = {
  now: Date;
  headline: string;
  services: ServiceCard[];
  attention: AttentionItem[];
  accounts: { total: number; new7: number; signedIn7: number; multiProduct: number };
  signups: SeriesPoint[];
  products: ProductCard[];
  ai: AiSummary;
  showRevenue: boolean;
};

function revenueOf(subs: AppSubscriptions | undefined): number {
  return subs?.mrrCents ?? 0;
}

export async function getOverview(staff: Staff, now: Date = new Date()): Promise<Overview> {
  const since7 = daysAgo(7, now);
  const webhookSince = daysAgo(WEBHOOK_WINDOW_DAYS, now);
  const owner = staff.role === "owner";

  const [
    checks,
    stored,
    totals,
    signups,
    multiProduct,
    pastDue,
    webhooks,
    webhookTotals,
    emails,
    runs,
    reports,
    overdue,
    statusRows,
    ai,
    cozya,
    agenda,
    missao,
    bora,
    edi,
  ] = await Promise.all([
    probeAll(),
    readStoredStatus(),
    accountTotals(since7),
    signupsPerDay(daysAgo(7, now)),
    multiProductAccounts(),
    pastDueByApp(),
    webhookProblems(webhookSince, now, 1),
    webhookProblemTotals(webhookSince, now),
    emailCountsSince(daysAgo(1, now)),
    latestRuns(),
    openContentReports(),
    overdueReservations(now),
    subscriptionStatusRows(),
    aiWeek(since7),
    usageFor("cozya", since7, now),
    usageFor("agenda-da-turma", since7, now),
    usageFor("missao-saber", since7, now),
    usageFor("bora-treinar", since7, now),
    usageFor("edi", since7, now),
  ]);

  const services = checks.map((check) => serviceCard(check, stored.get(check.key), now));
  const attention: AttentionItem[] = serviceAttention(services, checks, stored, now);

  const first = webhooks[0];
  if (webhookTotals.total > 0 && first) {
    const product = webhookProduct(first.providerEventId);
    const resend =
      webhookTotals.total === 1
        ? webhookNeedsResend(first.createdAt, now)
          ? " Passou dos três dias em que o Stripe reenvia sozinho."
          : ""
        : webhookTotals.needsResend > 0
          ? ` ${countLabel(webhookTotals.needsResend, "passou", "passaram")} dos três dias em que o Stripe reenvia sozinho e ${webhookTotals.needsResend === 1 ? "precisa ser reenviado" : "precisam ser reenviados"} por lá.`
          : "";
    attention.push({
      id: "stripe-webhooks",
      tone: "warn",
      title: stripeWebhookTitle({
        total: webhookTotals.total,
        needsResend: webhookTotals.needsResend,
        attempts: first.attempts,
      }),
      detail: `${webhookTotals.total === 1 ? "" : "O mais recente: "}${first.eventType}${product ? ` ${inProduct(product)}` : ""}, ${formatRelative(first.createdAt, now)}. ${webhookConsequence(first.eventType)}${resend}`,
      href: owner ? "/dinheiro" : stripeLinks.event(first.providerEventId),
      external: !owner,
      weight: webhookTotals.total,
    });
  }

  const pastDueTotal = pastDue.reduce((sum, row) => sum + row.total, 0);
  if (pastDueTotal > 0) {
    attention.push({
      id: "past-due",
      tone: "warn",
      title: `${countLabel(pastDueTotal, "pagamento", "pagamentos")} em atraso`,
      detail: `${joinPhrases(
        pastDue
          .filter((row) => row.total > 0)
          .sort((a, b) => b.total - a.total)
          .map((row) => `${formatNumber(row.total)} ${inProduct(row.app)}`),
      )}. O Stripe tenta cobrar de novo sozinho; enquanto isso a pessoa fica sem o plano pago.`,
      href: owner ? "/dinheiro" : undefined,
      weight: pastDueTotal,
    });
  }

  const lostEmails = lostEmailsByCategory(emails);
  const emailTotal = lostEmails.reduce((sum, row) => sum + row.total, 0);
  if (emailTotal > 0) {
    attention.push({
      id: "emails",
      tone: "warn",
      title: `${countLabel(emailTotal, "e-mail não chegou", "e-mails não chegaram")} nas últimas 24 horas`,
      detail: `${capitalize(
        joinPhrases(lostEmails.map((row) => emailCategoryPhrase(row.category, row.total))),
      )}. Os motivos estão em Operação.`,
      href: "/operacao",
      weight: emailTotal,
    });
  }

  const routines = routineAttention(buildRoutineRows(runs, [], now));
  if (routines) attention.push(routines);

  if (overdue > 0) {
    attention.push({
      id: "reservations",
      tone: "info",
      title: `${countLabel(overdue, "reserva de crédito passou", "reservas de crédito passaram")} do prazo`,
      detail:
        "A rotina de 5 minutos devolve os créditos. Se o número não baixar, confira as rotinas em Operação.",
      href: "/operacao",
    });
  }

  if (reports > 0) {
    attention.push({
      id: "missao-reports",
      tone: "info",
      title: `${countLabel(reports, "relato", "relatos")} de erro de conteúdo na Missão Saber`,
      detail:
        "Abertos pela família dentro de uma missão. A correção é feita na área de manutenção do próprio app.",
      href: `https://${PRODUCTS["missao-saber"].domain}/manutencao`,
      external: true,
    });
  }

  const subs = summarizeSubscriptions(statusRows);
  const revenue = (key: ProductKey) =>
    owner ? [{ value: formatBRL(revenueOf(subs.get(key))), label: "receita por mês" }] : [];
  // Pro segue `PRO_STATUSES` (ativas e em teste), como no resumo da semana e em Produtos.
  const pro = (key: ProductKey) => subs.get(key)?.pro ?? 0;

  const products: ProductCard[] = [
    {
      product: "cozya",
      stats: [
        { value: formatNumber(pro("cozya")), label: "assinantes Pro" },
        { value: formatNumber(subs.get("cozya")?.trialing ?? 0), label: "deles em teste" },
        ...revenue("cozya"),
        { value: formatNumber(cozya.events.recipe_saved ?? 0), label: "receitas guardadas" },
      ],
    },
    {
      product: "agenda-da-turma",
      stats: [
        { value: formatNumber(pro("agenda-da-turma")), label: "assinantes Pro" },
        { value: formatNumber(agenda.families), label: "famílias com criança cadastrada" },
        ...revenue("agenda-da-turma"),
        { value: formatNumber(agenda.events.notice_confirmed ?? 0), label: "recados salvos" },
      ],
    },
    {
      product: "missao-saber",
      stats: [
        { value: formatNumber(pro("missao-saber")), label: "famílias assinantes" },
        { value: formatNumber(missao.profiles), label: "perfis de estudante" },
        ...revenue("missao-saber"),
        { value: formatNumber(missao.sessions.mission ?? 0), label: "missões concluídas" },
      ],
    },
    {
      product: "bora-treinar",
      stats: [
        { value: formatNumber(pro("bora-treinar")), label: "famílias assinantes" },
        { value: formatNumber(bora.profiles), label: "perfis de treino" },
        ...revenue("bora-treinar"),
        {
          value: formatNumber(Object.values(bora.sessions).reduce((sum, total) => sum + total, 0)),
          label: "treinos na semana",
        },
      ],
    },
    {
      product: "edi",
      stats: [
        { value: formatNumber(edi.accounts), label: "contas" },
        { value: formatNumber(edi.connectedDevices), label: "computadores conectados" },
        ...(pro("edi") > 0
          ? [{ value: formatNumber(pro("edi")), label: "assinantes" }, ...revenue("edi")]
          : []),
      ],
      note: pro("edi") > 0 ? undefined : "Nenhuma assinatura da Suíte Edi registrada ainda.",
    },
  ];

  const runsTotal = ai.runs.reduce((sum, row) => sum + row.total, 0);
  const runsWithCost = ai.runs.reduce((sum, row) => sum + row.withCost, 0);
  const tasks = aiTaskOutcome(
    ai.tasks.filter((row) => row.app === "cozya" || row.app === "agenda-da-turma"),
  );
  const summary: AiSummary = {
    costUsd: ai.runs.reduce((sum, row) => sum + row.costUsd, 0),
    runs: runsTotal,
    runsWithCost,
    runsWithoutCost: ai.runs
      .map((row) => ({ app: row.app, total: row.total - row.withCost }))
      .filter((row) => row.total > 0),
    tasks: tasks.tasks,
    returned: tasks.returned,
    failureRate: tasks.failureRate,
  };

  const series = dailySeries(signups, 7, now);
  const sorted = sortAttention(attention);
  return {
    now,
    headline: attentionHeadline(sorted.length),
    services,
    attention: sorted,
    accounts: {
      ...totals,
      new7: seriesTotal(series),
      multiProduct,
    },
    signups: series,
    products,
    ai: summary,
    showRevenue: owner,
  };
}
