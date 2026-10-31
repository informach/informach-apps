import "server-only";
import type { Staff } from "@/lib/access";
import { daysAgo, formatBRL, formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { RAILWAY_PROJECT_URL, sentryIssues, stripeDashboard } from "@/lib/links";
import { PRODUCTS, SERVICES, type ServiceKey } from "@/lib/products";
import { probeAll, readStoredStatus } from "@/lib/services";
import {
  aiTaskOutcome,
  creditTotals,
  isOverdueStatus,
  isProStatus,
  planLabel,
  summarizeScheduled,
  summarizeSubscriptions,
} from "../money/logic";
import {
  everSubscribedByApp,
  ledgerFlow,
  reservationTotals,
  scheduledChanges,
  subscriptionStatusRows,
} from "../money/repository";
import { STATUS_LABEL } from "../money/service";
import { aiWeek } from "../overview/repository";
import { type ServiceCard, serviceCard } from "../overview/service";
import { type FunnelBar, funnelBars, type ProductTab, tabProduct } from "./logic";
import {
  type AgendaUsage,
  type BoraUsage,
  type CozyaUsage,
  type EdiUsage,
  type MissaoUsage,
  usageFor,
} from "./repository";

export type Pair = { label: string; value: string };
export type QuickLink = { label: string; href: string };

export type ProductView = {
  tab: ProductTab;
  name: string;
  domain: string;
  service: ServiceCard | null;
  kpis: Pair[];
  funnel: FunnelBar[];
  usageTitle: string;
  usage: Pair[];
  plans: Pair[];
  credits: Pair[];
  ai: string;
  note: string;
  links: QuickLink[];
};

export function aiSentence(
  runs: { total: number; withCost: number; costUsd: number; failed: number } | undefined,
  tasks: { status: string; total: number }[],
): string {
  const outcome = aiTaskOutcome(tasks);
  if (!runs && outcome.tasks === 0) return "Nenhuma tarefa de IA nos últimos 7 dias.";
  const parts: string[] = [];
  if (outcome.tasks > 0)
    parts.push(
      outcome.failureRate === null
        ? `${formatNumber(outcome.tasks)} ${outcome.tasks === 1 ? "tarefa" : "tarefas"} na semana, ainda em andamento.`
        : `${formatNumber(outcome.tasks)} ${outcome.tasks === 1 ? "tarefa" : "tarefas"} na semana; das encerradas, ${formatPercent(outcome.failureRate)} falharam e devolveram o crédito.`,
    );
  if (runs && runs.total > 0) {
    parts.push(
      runs.withCost > 0
        ? `Custo informado: ${formatUSD(runs.costUsd)}, em ${formatPercent(runs.withCost / runs.total)} das execuções.`
        : "O provedor não informou custo nas execuções da semana.",
    );
  }
  return parts.join(" ");
}

export async function getProductView(
  tab: ProductTab,
  staff: Staff,
  now: Date = new Date(),
): Promise<ProductView> {
  const owner = staff.role === "owner";

  if (tab === "sistema-zero") {
    return {
      tab,
      name: "Sistema Zero",
      domain: "sistemazero.com.br",
      service: null,
      kpis: [],
      funnel: [],
      usageTitle: "Por enquanto",
      usage: [
        { label: "Assinaturas e alunos", value: "no painel do Sistema Zero" },
        { label: "Área dos pais", value: "no próprio Sistema Zero" },
        { label: "Integração com o Bastidores", value: "fase futura" },
      ],
      plans: [],
      credits: [],
      ai: "A ajuda com IA do Sistema Zero roda na plataforma própria dele e não aparece aqui.",
      note: "Trazer o Sistema Zero para o Bastidores pede uma integração com a plataforma dele. Fica para depois da fase 3.",
      links: [{ label: "Abrir o Sistema Zero", href: "https://sistemazero.com.br" }],
    };
  }

  const serviceKey: ServiceKey = tab;
  const [checks, stored] = await Promise.all([probeAll(), readStoredStatus()]);
  const check = checks.find((item) => item.key === serviceKey);
  const service = check ? serviceCard(check, stored.get(serviceKey), now) : null;

  const product = tabProduct(tab);
  if (!product) {
    return {
      tab,
      name: SERVICES.site.name,
      domain: "informach.com.br",
      service,
      kpis: [],
      funnel: [],
      usageTitle: "O que acompanhar",
      usage: [
        {
          label: "Página inicial",
          value: service ? (service.state === "down" ? "fora do ar" : "no ar") : "sem conferência",
        },
        { label: "Visitas", value: "não medidas" },
      ],
      plans: [],
      credits: [],
      ai: "O site não usa IA.",
      note: "O site não usa cookies de acompanhamento, então não há visitas para contar. Termos e Privacidade de todos os produtos moram nele.",
      links: [
        { label: "Abrir o site", href: SERVICES.site.defaultOrigin },
        { label: "Railway", href: RAILWAY_PROJECT_URL },
      ],
    };
  }

  const since7 = daysAgo(7, now);
  const since30 = daysAgo(30, now);
  const [usage, statusRows, scheduledRows, ever, ledger, reservations, ai] = await Promise.all([
    usageFor(product, since7, now),
    subscriptionStatusRows(),
    scheduledChanges(),
    everSubscribedByApp([product]),
    ledgerFlow(since30),
    reservationTotals(since30),
    aiWeek(since7),
  ]);

  const subs = summarizeSubscriptions(statusRows).get(product);
  // Pro segue `PRO_STATUSES`: ativas e em teste. A receita conta só as ativas.
  const pro = subs?.pro ?? 0;
  const scheduled = summarizeScheduled(scheduledRows).get(product);
  const everPro = ever.find((row) => row.app === product)?.total ?? 0;
  const revenue: Pair[] = owner
    ? [
        {
          value: formatBRL(subs?.mrrCents ?? 0),
          label: "receita por mês, pelo preço de tabela das ativas",
        },
      ]
    : [];
  const proPair: Pair = {
    value: formatNumber(pro),
    label: `assinantes Pro (${formatNumber(subs?.monthly ?? 0)} mensal, ${formatNumber(subs?.annual ?? 0)} anual, ${formatNumber(subs?.trialing ?? 0)} em teste)`,
  };

  const funnel = funnelBars([
    { label: "Têm conta no produto", value: usage.accounts },
    { label: "Confirmaram o e-mail", value: usage.confirmed },
    { label: "Usaram nos últimos 7 dias", value: usage.active, comparedTo: "first" },
    { label: "Já assinaram alguma vez", value: everPro, comparedTo: "first" },
  ]);

  const others = new Map<string, number>();
  for (const row of statusRows) {
    if (row.app !== product || isProStatus(row.status) || isOverdueStatus(row.status)) continue;
    others.set(row.status, (others.get(row.status) ?? 0) + row.total);
  }
  const plans: Pair[] = [
    { label: "Ativas, plano mensal", value: formatNumber(subs?.monthly ?? 0) },
    { label: "Ativas, plano anual", value: formatNumber(subs?.annual ?? 0) },
    { label: "Em teste", value: formatNumber(subs?.trialing ?? 0) },
    { label: "Em atraso", value: formatNumber(subs?.pastDue ?? 0) },
    { label: "Com cancelamento agendado", value: formatNumber(scheduled?.canceling ?? 0) },
    ...(scheduled?.switches ?? []).map((item) => ({
      label: `Trocam para ${planLabel(item.productId)} no fim do período`,
      value: formatNumber(item.total),
    })),
    ...[...others.entries()].map(([status, total]) => ({
      label: `${capitalizeFirst(STATUS_LABEL[status] ?? status)}, de todas as épocas`,
      value: formatNumber(total),
    })),
  ];

  const credits = creditPairs(
    ledger.filter((row) => row.app === product),
    reservations.filter((row) => row.app === product),
  );

  const info = PRODUCTS[product];
  const links: QuickLink[] = [{ label: `Abrir ${info.name}`, href: `https://${info.domain}` }];
  if (owner)
    links.push({ label: "Assinaturas no Stripe", href: stripeDashboard("/subscriptions") });
  const sentry = sentryIssues(product);
  if (sentry) links.push({ label: "Erros no Sentry", href: sentry });
  links.push({ label: "Railway", href: RAILWAY_PROJECT_URL });

  const runs = ai.runs.find((row) => row.app === product);
  const tasks = ai.tasks.filter((row) => row.app === product);

  const base = {
    tab,
    name: info.name,
    domain: info.domain,
    service,
    funnel,
    plans,
    credits,
    links,
  };

  if (product === "cozya") {
    const cozya = usage as CozyaUsage;
    return {
      ...base,
      kpis: [
        { value: formatNumber(cozya.accounts), label: "contas que usam o Cozya" },
        { value: formatNumber(cozya.active), label: "usaram nos últimos 7 dias" },
        proPair,
        { value: formatNumber(cozya.trials), label: "já começaram o teste alguma vez" },
        ...revenue,
      ],
      usageTitle: "Uso na semana",
      usage: [
        { label: "Receitas guardadas", value: formatNumber(cozya.events.recipe_saved ?? 0) },
        { label: "Semanas planejadas", value: formatNumber(cozya.events.plan_completed ?? 0) },
        { label: "Listas de compras", value: formatNumber(cozya.events.shopping_created ?? 0) },
        { label: "Preparos iniciados", value: formatNumber(cozya.events.cooking_started ?? 0) },
        { label: "Preparos concluídos", value: formatNumber(cozya.events.cooking_completed ?? 0) },
      ],
      ai: aiSentence(runs, tasks),
      note: "Receitas, cardápios e listas nunca aparecem aqui: só quantas vezes cada ação aconteceu.",
    };
  }

  if (product === "agenda-da-turma") {
    const agenda = usage as AgendaUsage;
    return {
      ...base,
      kpis: [
        { value: formatNumber(agenda.accounts), label: "contas que usam a Agenda" },
        { value: formatNumber(agenda.families), label: "famílias com criança cadastrada" },
        { value: formatNumber(agenda.active), label: "usaram nos últimos 7 dias" },
        proPair,
        { value: formatNumber(agenda.guests), label: "adultos convidados" },
        ...revenue,
      ],
      usageTitle: "Uso na semana",
      usage: [
        { label: "Recados lidos pela IA", value: formatNumber(agenda.events.notice_parsed ?? 0) },
        {
          label: "Recados conferidos e salvos",
          value: formatNumber(agenda.events.notice_confirmed ?? 0),
        },
        {
          label: "Atividades concluídas",
          value: formatNumber(agenda.events.action_completed ?? 0),
        },
        { label: "Lembretes ligados", value: formatNumber(agenda.events.reminders_enabled ?? 0) },
        { label: "Perfis de criança, só a contagem", value: formatNumber(agenda.children) },
      ],
      ai: aiSentence(runs, tasks),
      note: "Nenhum número aqui usa nome de criança ou texto de recado.",
    };
  }

  if (product === "missao-saber") {
    const missao = usage as MissaoUsage;
    return {
      ...base,
      kpis: [
        { value: formatNumber(missao.accounts), label: "famílias" },
        { value: formatNumber(missao.active), label: "estudaram nos últimos 7 dias" },
        { ...proPair, label: proPair.label.replace("assinantes Pro", "famílias assinantes") },
        { value: formatNumber(missao.profiles), label: "perfis de estudante" },
        { value: formatNumber(missao.studyDevices), label: "aparelhos de estudo conectados" },
        ...revenue,
      ],
      usageTitle: "Estudo na semana",
      usage: [
        { label: "Missões concluídas", value: formatNumber(missao.sessions.mission ?? 0) },
        { label: "Revisões feitas", value: formatNumber(missao.sessions.review ?? 0) },
        { label: "Diagnósticos", value: formatNumber(missao.sessions.diagnostic ?? 0) },
        { label: "Simulados", value: formatNumber(missao.sessions.exam ?? 0) },
        { label: "Relatos de conteúdo abertos", value: formatNumber(missao.openReports) },
      ],
      ai: "A Missão Saber não usa IA nesta versão.",
      note: "Relatos de erro de conteúdo são corrigidos na área de manutenção do próprio app. O Bastidores só conta os abertos.",
      links: [
        ...links.slice(0, 1),
        { label: "Área de manutenção", href: `https://${info.domain}/manutencao` },
        ...links.slice(1),
      ],
    };
  }

  if (product === "bora-treinar") {
    const bora = usage as BoraUsage;
    const trainings = Object.values(bora.sessions).reduce((sum, total) => sum + total, 0);
    return {
      ...base,
      kpis: [
        { value: formatNumber(bora.accounts), label: "famílias" },
        { value: formatNumber(bora.active), label: "treinaram nos últimos 7 dias" },
        { ...proPair, label: proPair.label.replace("assinantes Pro", "famílias assinantes") },
        { value: formatNumber(bora.profiles), label: "perfis de quem treina" },
        ...revenue,
      ],
      usageTitle: "Treino na semana",
      usage: [
        { label: "Treinos concluídos", value: formatNumber(trainings) },
        { label: "Contados pela câmera", value: formatNumber(bora.sessions.camera ?? 0) },
        { label: "Contados à mão", value: formatNumber(bora.sessions.manual ?? 0) },
        { label: "Com o celular como câmera", value: formatNumber(bora.sessions.pareado ?? 0) },
        { label: "Treinos montados no editor", value: formatNumber(bora.customWorkouts) },
      ],
      ai: "O Bora Treinar não usa IA: a contagem pela câmera roda no aparelho da pessoa.",
      note: "Nomes de perfil, treinos e números de repetição nunca aparecem aqui: só quantos treinos aconteceram.",
    };
  }

  const edi = usage as EdiUsage;
  const hasSubs = pro > 0 || (subs?.pastDue ?? 0) > 0;
  return {
    ...base,
    kpis: [
      { value: formatNumber(edi.accounts), label: "contas" },
      { value: formatNumber(edi.connectedDevices), label: "computadores conectados" },
      { value: formatNumber(edi.devicesSeen), label: "computadores vistos na semana" },
      { value: formatNumber(edi.paidAccess), label: "contas com licença paga em dia" },
      ...(hasSubs
        ? [{ ...proPair, label: proPair.label.replace("assinantes Pro", "assinantes") }, ...revenue]
        : []),
    ],
    usageTitle: "Computadores e versões",
    usage: [
      { label: "Computadores conectados", value: formatNumber(edi.connectedDevices) },
      { label: "Vistos nos últimos 7 dias", value: formatNumber(edi.devicesSeen) },
      { label: "Versões publicadas", value: formatNumber(edi.releases) },
      ...(hasSubs ? [] : [{ label: "Assinaturas", value: "nenhuma registrada ainda" }]),
    ],
    ai: "A Suíte Edi não usa créditos de IA da Informach nesta versão.",
    note: "Ferramentas abertas e projetos ficam no computador da pessoa. O portal só sabe de contas, computadores e licenças.",
  };
}

/**
 * Créditos dos últimos 30 dias, com as mesmas regras de Dinheiro: devolvido por
 * falha vem das reservas soltas, compensação e reembolso vêm do razão, e o
 * vencimento é o valor concedido que chegou ao fim do prazo.
 */
export function creditPairs(
  ledger: ReadonlyArray<{ entryType: string; amount: number }>,
  reservations: ReadonlyArray<{ status: string; total: number; credits: number }>,
): Pair[] {
  const totals = creditTotals(ledger);
  const tasks = aiTaskOutcome(reservations);
  if (ledger.length === 0 && tasks.returned === 0) return [];
  const pairs: Pair[] = [
    { label: "Créditos concedidos", value: formatNumber(totals.granted) },
    { label: "Créditos usados", value: formatNumber(totals.consumed) },
    {
      label: `Devolvidos por falha, em ${formatNumber(tasks.returned)} ${tasks.returned === 1 ? "tarefa" : "tarefas"}`,
      value: formatNumber(tasks.returnedCredits),
    },
    {
      label: "Chegaram ao vencimento, pelo valor concedido",
      value: formatNumber(totals.reachedExpiry),
    },
  ];
  if (totals.compensated !== 0)
    pairs.push({ label: "Dados como compensação", value: formatNumber(totals.compensated) });
  if (totals.refunded > 0)
    pairs.push({ label: "Retirados por reembolso", value: formatNumber(totals.refunded) });
  return pairs;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
