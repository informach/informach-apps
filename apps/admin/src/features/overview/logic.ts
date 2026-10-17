import type { Tone } from "@/components/status";
import { emailOutcome } from "../operations/email-labels";
import { inProduct } from "./phrases";

/**
 * Regras puras do Painel: ordem do "Precisa de você", a frase do topo e a série
 * de novas contas por dia. Sem banco, sem Next, para poder ser testado.
 */

export type AttentionItem = {
  /** Identificador estável, para a chave da lista e para os testes. */
  id: string;
  tone: Extract<Tone, "bad" | "warn" | "info">;
  title: string;
  detail: string;
  href?: string;
  /** Link para fora do Bastidores (Stripe, área de manutenção de um app). */
  external?: boolean;
  /** Desempate dentro do mesmo tom: maior primeiro. */
  weight?: number;
};

const TONE_ORDER: Record<AttentionItem["tone"], number> = { bad: 0, warn: 1, info: 2 };

/** Fora do ar primeiro, depois atenção, depois informação; dentro do tom, o mais pesado. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) =>
      TONE_ORDER[a.tone] - TONE_ORDER[b.tone] ||
      (b.weight ?? 0) - (a.weight ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

const COUNT_WORDS = [
  "",
  "Uma",
  "Duas",
  "Três",
  "Quatro",
  "Cinco",
  "Seis",
  "Sete",
  "Oito",
  "Nove",
  "Dez",
];

/** "Duas coisas precisam de você hoje." ou "Nada precisa de você agora." */
export function attentionHeadline(count: number): string {
  if (count <= 0) return "Nada precisa de você agora.";
  const word = COUNT_WORDS[count] ?? String(count);
  return count === 1
    ? `${word} coisa precisa de você hoje.`
    : `${word} coisas precisam de você hoje.`;
}

/** "1 pagamento" / "3 pagamentos". */
export function countLabel(value: number, one: string, many: string): string {
  return `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;
}

/** Lista legível: "2 no Cozya e 1 na Agenda da Turma". */
export function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

export type DayCount = { day: string; count: number };
export type SeriesPoint = { day: string; label: string; count: number };

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAY_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Dia "AAAA-MM-DD" de uma data em Brasília. */
export function brDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekdayOf(day: string): number {
  // Meio-dia em Brasília: o dia da semana não depende do fuso do servidor.
  return new Date(`${day}T12:00:00-03:00`).getUTCDay();
}

/**
 * Completa os últimos `days` dias (hoje incluído) com zero onde não houve
 * cadastro, na ordem do mais antigo para hoje.
 */
export function dailySeries(rows: DayCount[], days: number, now: Date = new Date()): SeriesPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  const points: SeriesPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = brDay(new Date(now.getTime() - offset * 86_400_000));
    points.push({
      day,
      label: WEEKDAY_SHORT[weekdayOf(day)] ?? "",
      count: byDay.get(day) ?? 0,
    });
  }
  return points;
}

/**
 * Total do gráfico. "Novas nos últimos 7 dias" usa esta soma, para o número e as
 * barras falarem dos mesmos sete dias de Brasília, hoje incluído.
 */
export function seriesTotal(points: readonly SeriesPoint[]): number {
  return points.reduce((sum, point) => sum + point.count, 0);
}

/** Texto do gráfico para leitor de tela: "Novas contas por dia, de domingo a sábado: 6, 9, ..." */
export function seriesDescription(title: string, points: SeriesPoint[]): string {
  if (points.length === 0) return `${title}: sem dados.`;
  const first = WEEKDAY_LONG[weekdayOf(points[0]?.day ?? "")] ?? "";
  const last = WEEKDAY_LONG[weekdayOf(points[points.length - 1]?.day ?? "")] ?? "";
  return `${title}, de ${first} a ${last}: ${joinPhrases(points.map((point) => String(point.count)))}.`;
}

/** Altura da barra em porcentagem do maior valor; zero vira um traço mínimo visível. */
export function barHeights(points: SeriesPoint[]): number[] {
  const max = Math.max(0, ...points.map((point) => point.count));
  return points.map((point) =>
    max === 0 ? 4 : Math.max(4, Math.round((point.count / max) * 100)),
  );
}

/** Nome humano das categorias de e-mail. Categoria nova cai no nome técnico, em mono. */
export const EMAIL_CATEGORY_LABEL: Record<string, { one: string; many: string }> = {
  "auth.verify-email": { one: "link de confirmação", many: "links de confirmação" },
  "auth.verify-email-otp": { one: "código de confirmação", many: "códigos de confirmação" },
  "auth.sign-in-otp": { one: "código de acesso", many: "códigos de acesso" },
  "auth.forget-password-otp": { one: "código de senha", many: "códigos de senha" },
  "auth.password-reset": { one: "link de senha", many: "links de senha" },
  "auth.magic-link": { one: "link de acesso", many: "links de acesso" },
  "auth.invitation": { one: "convite", many: "convites" },
  "auth.account-deletion": { one: "aviso de exclusão", many: "avisos de exclusão" },
  "auth.signup-attempt-on-existing": { one: "aviso de cadastro", many: "avisos de cadastro" },
  "billing.payment-success": { one: "recibo", many: "recibos" },
  "billing.payment-failed": { one: "aviso de pagamento", many: "avisos de pagamento" },
  "billing.subscription-renewed": { one: "aviso de renovação", many: "avisos de renovação" },
  "billing.subscription-canceled": {
    one: "aviso de cancelamento",
    many: "avisos de cancelamento",
  },
  "billing.credits-purchased": { one: "recibo de créditos", many: "recibos de créditos" },
  "billing.credits-warning": { one: "aviso de créditos", many: "avisos de créditos" },
  "agenda.routine": { one: "resumo da Agenda", many: "resumos da Agenda" },
  "missao.weekly-report": { one: "resumo da Missão", many: "resumos da Missão" },
  "admin.alert": { one: "aviso do Bastidores", many: "avisos do Bastidores" },
  "admin.weekly-summary": { one: "resumo do Bastidores", many: "resumos do Bastidores" },
};

export function emailCategoryPhrase(category: string, count: number): string {
  const label = EMAIL_CATEGORY_LABEL[category];
  if (!label) return `${count.toLocaleString("pt-BR")} de ${category}`;
  return countLabel(count, label.one, label.many);
}

/**
 * E-mails que não chegaram, pela mesma regra de Operação: falha sem nova
 * tentativa marcada, devolução e descarte. Bloqueio de propósito (descadastro,
 * lista de bloqueio) e falha que ainda vai ser tentada de novo não entram.
 */
export function lostEmailsByCategory(
  rows: ReadonlyArray<{ category: string; status: string; retryScheduled: boolean; count: number }>,
): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (emailOutcome(row.status, row.retryScheduled) !== "lost") continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

/** Título do aviso do Stripe no "Precisa de você", com o total sem o limite da lista. */
export function stripeWebhookTitle(input: {
  total: number;
  needsResend: number;
  /** Tentativas do mais recente, para o caso de um aviso só. */
  attempts: number;
}): string {
  if (input.total === 1) {
    if (input.needsResend > 0) return "Um aviso do Stripe precisa ser reenviado pelo Stripe.";
    return input.attempts >= 2
      ? `Um aviso do Stripe falhou ${input.attempts} vezes.`
      : "Um aviso do Stripe não foi processado.";
  }
  return `${input.total.toLocaleString("pt-BR")} avisos do Stripe não foram processados.`;
}

/** Situações de rotina que pedem alguém olhar. Parada de propósito e em andamento não entram. */
const ROUTINE_ATTENTION = {
  failed: { one: "rotina falhou", many: "rotinas falharam", phrase: "falhou" },
  interrupted: {
    one: "rotina parou no meio",
    many: "rotinas pararam no meio",
    phrase: "parou no meio",
  },
  late: {
    one: "rotina passou do prazo sem rodar",
    many: "rotinas passaram do prazo sem rodar",
    phrase: "passou do prazo sem rodar",
  },
  never: { one: "rotina nunca rodou", many: "rotinas nunca rodaram", phrase: "nunca rodou" },
} as const;

type AttentionState = keyof typeof ROUTINE_ATTENTION;

function isAttentionState(state: string): state is AttentionState {
  return state in ROUTINE_ATTENTION;
}

/** Quantas rotinas aparecem pelo nome antes de virar "e mais N". */
const ROUTINE_NAMES = 3;

/**
 * Um item só para as rotinas, com as mesmas situações da tela de Operação:
 * falhou, parou no meio, passou do prazo ou nunca rodou.
 */
export function routineAttention(
  rows: ReadonlyArray<{ app: string; label: string; state: string }>,
): AttentionItem | null {
  const flagged = rows.filter((row) => isAttentionState(row.state));
  if (flagged.length === 0) return null;
  const states = new Set(flagged.map((row) => row.state as AttentionState));
  const [only] = states;
  const title =
    states.size === 1 && only
      ? countLabel(flagged.length, ROUTINE_ATTENTION[only].one, ROUTINE_ATTENTION[only].many)
      : countLabel(flagged.length, "rotina precisa de atenção", "rotinas precisam de atenção");
  const names = flagged.slice(0, ROUTINE_NAMES).map((row) => {
    const where = row.app === "admin" ? "no Bastidores" : inProduct(row.app);
    return `${row.label} ${where} ${ROUTINE_ATTENTION[row.state as AttentionState].phrase}`;
  });
  const rest = flagged.length - names.length;
  if (rest > 0) names.push(`mais ${countLabel(rest, "rotina", "rotinas")}`);
  return {
    id: "jobs",
    tone: "warn",
    title,
    detail: `${joinPhrases(names)}. Os detalhes estão em Operação.`,
    href: "/operacao",
    weight: flagged.length,
  };
}
