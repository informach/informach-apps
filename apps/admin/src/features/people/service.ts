import { findProduct } from "@informach/config";
import { formatDate, formatDay, formatNumber } from "@/lib/format";
import {
  appPhrase,
  isProductKey,
  PRODUCTS,
  type ProductKey,
  productName,
  sessionsScope,
} from "@/lib/products";
import {
  isScheduledSwitch,
  NO_SUBSCRIPTION_LINKS,
  type SubscriptionLinks,
  subscriptionIdOf,
  subscriptionLinks,
} from "../audit/subscription-links";

/**
 * Regras puras da ficha e da lista de pessoas: o que cada estado quer dizer em
 * português, sem banco, sem Next e sem React. Tudo aqui é testado sozinho.
 */

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

// ---------------------------------------------------------------------------
// Filtros da lista
// ---------------------------------------------------------------------------

export const PLAN_FILTERS = {
  assinante: "Assinante",
  teste: "Em teste",
  atraso: "Pagamento em atraso",
  gratis: "Grátis",
} as const;
export type PlanFilter = keyof typeof PLAN_FILTERS;

export const ACCOUNT_FILTERS = {
  "nao-confirmada": "E-mail não confirmado",
  banida: "Banida",
  equipe: "Equipe",
} as const;
export type AccountFilter = keyof typeof ACCOUNT_FILTERS;

export const PAGE_SIZE = 50;

export type PeopleFilters = {
  q: string;
  product: ProductKey | null;
  plan: PlanFilter | null;
  account: AccountFilter | null;
  page: number;
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Lê os filtros da barra de endereço, ignorando valores desconhecidos. */
export function parsePeopleFilters(
  params: Record<string, string | string[] | undefined>,
): PeopleFilters {
  const product = first(params.produto);
  const plan = first(params.situacao);
  const account = first(params.conta);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    q: first(params.q).slice(0, 120),
    product: isProductKey(product) ? product : null,
    plan: plan in PLAN_FILTERS ? (plan as PlanFilter) : null,
    account: account in ACCOUNT_FILTERS ? (account as AccountFilter) : null,
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Monta a query string mantendo os filtros e trocando só o que mudou. */
export function peopleQuery(filters: PeopleFilters, change: Partial<PeopleFilters> = {}): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.product) params.set("produto", next.product);
  if (next.plan) params.set("situacao", next.plan);
  if (next.account) params.set("conta", next.account);
  if (next.page > 1) params.set("pagina", String(next.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** `%` e `_` digitados viram texto literal no ILIKE. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export type PlanScope = {
  /** Situações de assinatura que o filtro procura. */
  statuses: Array<"active" | "trialing" | "past_due" | "unpaid">;
  /** "Grátis" é quem não tem nenhuma dessas assinaturas. */
  without: boolean;
  /** Só assinaturas do produto filtrado; nulo olha todos. */
  app: ProductKey | null;
  /** A demonstração de 14 dias do Cozya conta como teste. */
  cozyaDemo: boolean;
};

/**
 * O que cada filtro de situação procura, dentro do produto filtrado. A
 * demonstração do Cozya só entra em "Em teste" quando o filtro é o Cozya ou
 * nenhum produto: na Agenda, ela não diz nada.
 */
export function planScope(plan: PlanFilter, product: ProductKey | null): PlanScope {
  const app = product;
  switch (plan) {
    case "assinante":
      return { statuses: ["active"], without: false, app, cozyaDemo: false };
    case "teste":
      return {
        statuses: ["trialing"],
        without: false,
        app,
        cozyaDemo: product === null || product === "cozya",
      };
    case "atraso":
      return { statuses: ["past_due", "unpaid"], without: false, app, cozyaDemo: false };
    case "gratis":
      return {
        statuses: ["active", "trialing", "past_due", "unpaid"],
        without: true,
        app,
        cozyaDemo: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export type SubscriptionFacts = {
  status: string;
  productId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: Date | null;
  /** Troca de plano agendada para o fim do período (`switchPlan` em `@informach/billing`). */
  pendingProductId: string | null;
  canceledAt: Date | null;
  confirmedAt: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const TIER_LABEL: Record<string, string> = {
  pro: "Pro",
  individual: "Individual",
  family: "Família",
  suite: "Assinatura",
};

/** "Pro anual", "Família mensal". Produto fora do catálogo aparece pelo ID, em mono na tela. */
export function planLabel(productId: string): string {
  const product = findProduct(productId);
  if (!product) return productId;
  const tier = (product.tier && TIER_LABEL[product.tier]) ?? product.name;
  const interval =
    product.interval === "year" ? "anual" : product.interval === "month" ? "mensal" : "";
  return interval ? `${tier} ${interval}` : tier;
}

/** Preço de tabela do catálogo, "R$ 149 por ano". Stripe continua dono do preço cobrado. */
export function listPriceLine(productId: string): string | null {
  const product = findProduct(productId);
  if (product?.listPrice?.currency !== "BRL") return null;
  const value = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: product.listPrice.amountCents % 100 === 0 ? 0 : 2,
  }).format(product.listPrice.amountCents / 100);
  return `${value} por ${product.interval === "year" ? "ano" : "mês"}`;
}

export type PlanState = {
  /** Para filtros e contagens: igual ao status, menos "assinante" que é `active`. */
  kind: "assinante" | "teste" | "atraso" | "cancelada" | "outro";
  tone: Tone;
  /** Curto, para etiquetas: "Pro anual", "teste até 20/10", "pagamento em atraso". */
  short: string;
  /** Frase da ficha. */
  line: string;
};

/**
 * O que a assinatura quer dizer hoje. `past_due` nunca é Pro: o dinheiro não
 * entrou (regra de `PRO_STATUSES` em `@informach/billing`).
 *
 * Fim de período marcado não é sempre cancelamento: a troca de plano agendada
 * também marca, e guarda o plano novo em `pendingProductId`. E quem marcou pode
 * ter sido a pessoa no app ou a equipe no Stripe, então a frase não diz quem.
 */
export function describeSubscription(sub: SubscriptionFacts): PlanState {
  const plan = planLabel(sub.productId);
  switch (sub.status) {
    case "trialing": {
      const until = sub.trialEnd ?? sub.currentPeriodEnd;
      return {
        kind: "teste",
        tone: "info",
        short: `${plan}, em teste`,
        line: `Em teste até ${formatDay(until)}`,
      };
    }
    case "active": {
      if (sub.cancelAtPeriodEnd && sub.pendingProductId) {
        const next = planLabel(sub.pendingProductId);
        return {
          kind: "assinante",
          tone: "info",
          short: `${plan}, troca para ${next} em ${formatDay(sub.currentPeriodEnd)}`,
          line: `Troca para ${next} em ${formatDate(sub.currentPeriodEnd)}. Até lá, continua no plano ${plan}.`,
        };
      }
      if (sub.cancelAtPeriodEnd)
        return {
          kind: "assinante",
          tone: "warn",
          short: `${plan}, cancelamento agendado`,
          line: `Cancelamento agendado, vale até ${formatDay(sub.currentPeriodEnd)}`,
        };
      const since = sub.confirmedAt ?? sub.createdAt;
      const price = listPriceLine(sub.productId);
      return {
        kind: "assinante",
        tone: "ok",
        short: plan,
        line: `Assinante desde ${formatDay(since)}. Renova em ${formatDate(sub.currentPeriodEnd)}${price ? ` · ${price}` : ""}`,
      };
    }
    case "past_due":
      return {
        kind: "atraso",
        tone: "bad",
        short: `${plan}, pagamento em atraso`,
        line: `Pagamento em atraso desde ${formatDay(sub.currentPeriodStart)}. O Stripe tenta cobrar de novo sozinho.`,
      };
    case "unpaid":
      return {
        kind: "atraso",
        tone: "bad",
        short: `${plan}, sem pagamento`,
        line: "As tentativas de cobrança acabaram. O acesso pago está suspenso.",
      };
    case "canceled":
      return {
        kind: "cancelada",
        tone: "muted",
        short: "cancelada",
        line: `Cancelada em ${formatDay(sub.canceledAt ?? sub.updatedAt)}`,
      };
    case "incomplete":
      return {
        kind: "outro",
        tone: "warn",
        short: "pagamento não concluído",
        line: "Começou a assinar, mas o primeiro pagamento não foi concluído.",
      };
    case "incomplete_expired":
      return {
        kind: "outro",
        tone: "muted",
        short: "assinatura não concluída",
        line: "O primeiro pagamento não foi concluído e a tentativa expirou.",
      };
    case "paused":
      return {
        kind: "outro",
        tone: "muted",
        short: `${plan}, pausada`,
        line: "Assinatura pausada no Stripe.",
      };
    default:
      return {
        kind: "outro",
        tone: "muted",
        short: sub.status,
        line: `Situação no Stripe: ${sub.status}`,
      };
  }
}

/**
 * A assinatura que vale para a tela: a mais recente, com as que ainda dão
 * acesso na frente. Na troca agendada, a antiga fica `canceled` e a nova nasce
 * do mesmo cliente; a nova sempre ganha, então a antiga nunca aparece como
 * cancelamento.
 */
export function currentSubscription<T extends Pick<SubscriptionFacts, "status" | "createdAt">>(
  rows: T[],
): T | null {
  const weight = (status: string) =>
    ({ active: 0, trialing: 0, past_due: 1, unpaid: 2, incomplete: 3, paused: 3 })[status] ?? 4;
  return (
    [...rows].sort(
      (a, b) =>
        weight(a.status) - weight(b.status) || b.createdAt.getTime() - a.createdAt.getTime(),
    )[0] ?? null
  );
}

/** Demonstração do Cozya: 14 dias contados de `cozya.profiles.trial_started_at`, sem cartão. */
export const COZYA_DEMO_DAYS = 14;

export function cozyaDemoDay(trialStartedAt: Date | null, now: Date = new Date()): number | null {
  if (!trialStartedAt) return null;
  const day = Math.floor((now.getTime() - trialStartedAt.getTime()) / 86_400_000) + 1;
  return day >= 1 && day <= COZYA_DEMO_DAYS ? day : null;
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

/** "Chrome no Android". Só navegador e sistema; nada que identifique o aparelho. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Aparelho não identificado";
  const os = /iPad/.test(ua)
    ? "iPad"
    : /iPhone|iPod/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "Chromebook"
          : /Windows/.test(ua)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(ua)
              ? "Mac"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : /Electron\//.test(ua)
                ? "aplicativo de computador"
                : null;
  if (browser && os) return `${browser} no ${os}`;
  if (browser) return browser;
  if (os) return `Navegador no ${os}`;
  return "Aparelho não identificado";
}

// ---------------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------------

const EMAIL_CATEGORY: Record<string, string> = {
  "auth.verify-email": "Link para confirmar o e-mail",
  "auth.verify-email-otp": "Código para confirmar o e-mail",
  "auth.sign-in-otp": "Código de acesso",
  "auth.forget-password-otp": "Código para trocar a senha",
  "auth.password-reset": "Link para trocar a senha",
  "auth.magic-link": "Link de acesso",
  "auth.invitation": "Convite",
  "auth.account-deletion": "Confirmação de exclusão da conta",
  "auth.signup-attempt-on-existing": "Aviso de tentativa de cadastro",
  "billing.payment-success": "Recibo de pagamento",
  "billing.payment-failed": "Aviso de pagamento recusado",
  "billing.subscription-renewed": "Aviso de renovação",
  "billing.subscription-canceled": "Aviso de cancelamento",
  "billing.credits-purchased": "Recibo do pacote de créditos",
  "billing.credits-warning": "Aviso de créditos acabando",
  "agenda.routine": "Lembrete da rotina da Agenda",
  "missao.weekly-report": "Resumo semanal da Missão Saber",
  "admin.alert": "Aviso do Bastidores",
  "admin.weekly-summary": "Resumo da semana do Bastidores",
};

export function emailCategoryLabel(category: string): string {
  return EMAIL_CATEGORY[category] ?? "E-mail do sistema";
}

export function emailStatus(
  status: string,
  nextAttemptAt: Date | null,
): { label: string; tone: Tone } {
  switch (status) {
    case "delivered":
      return { label: "Entregue", tone: "ok" };
    case "sent":
      return { label: "Enviado", tone: "ok" };
    case "pending":
    case "sending":
      return { label: "Na fila", tone: "muted" };
    case "failed":
      return nextAttemptAt
        ? { label: "Tentando de novo", tone: "warn" }
        : { label: "Não saiu", tone: "bad" };
    case "bounced":
      return { label: "Voltou", tone: "bad" };
    case "dropped":
      return { label: "Bloqueado pelo SendGrid", tone: "bad" };
    case "complained":
      return { label: "Marcado como spam", tone: "bad" };
    case "skipped":
      return { label: "Não enviado", tone: "muted" };
    case "unknown":
      return { label: "Sem confirmação do envio", tone: "warn" };
    default:
      return { label: status, tone: "muted" };
  }
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export type TimelineEvent = {
  id: string;
  eventType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type TimelineEntry = {
  id: string;
  at: Date;
  title: string;
  detail: string | null;
  /** Ficha de outra pessoa citada no evento, para virar link. */
  otherPersonId: string | null;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function int(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeId(value: string | null): string | null {
  return value && ID_PATTERN.test(value) ? value : null;
}

/** "no Cozya", "na Agenda da Turma": o Cozya é o único nome masculino da casa. */
export function productIn(app: ProductKey): string {
  return app === "cozya" ? `no ${PRODUCTS.cozya.name}` : `na ${PRODUCTS[app].name}`;
}

/** "pelo Cozya", "pela Missão Saber". */
export function productBy(app: ProductKey): string {
  return app === "cozya" ? `pelo ${PRODUCTS.cozya.name}` : `pela ${PRODUCTS[app].name}`;
}

/** Produto citado no evento pelo slug; slug desconhecido fica de fora. */
function inProduct(payload: Record<string, unknown>): string {
  const app = text(payload, "app");
  return app && isProductKey(app) ? ` ${productIn(app)}` : "";
}

function productFromId(productId: string | null): string | null {
  if (!productId) return null;
  const product = findProduct(productId);
  return product ? `${productName(product.app)}, ${planLabel(productId)}` : null;
}

const SIMPLE: Record<string, string> = {
  "user.created": "Criou a conta",
  "user.email_changed": "Trocou o e-mail da conta",
  "user.password_changed": "Trocou a senha",
  "user.deletion_requested": "Pediu para excluir a conta",
  "user.deleted": "A conta foi excluída",
  "session.revoked": "Uma sessão foi encerrada",
  "account.linked": "Ligou outra forma de entrar na conta",
  "auth.sign_out": "Saiu da conta",
  "auth.sign_in_otp_requested": "Pediu um código para entrar",
  // O pacote grava a conta existente como autora, mas quem tentou foi outra pessoa.
  "auth.signup_attempt_on_existing": "Alguém tentou criar uma conta nova com o e-mail desta conta",
  "auth.forget_password_requested": "Pediu um código para trocar a senha",
  "auth.password_reset_completed": "Trocou a senha pelo código do e-mail",
  "auth.two_factor_enabled": "Ativou as duas etapas",
  "auth.two_factor_disabled": "Desligou as duas etapas",
  "auth.two_factor_verified": "Confirmou o código do autenticador",
  "auth.backup_code_used": "Entrou com um código de recuperação",
  "email.verified": "Confirmou o e-mail",
  "billing.payment_succeeded": "Um pagamento foi confirmado pelo Stripe",
  "billing.payment_failed": "Um pagamento foi recusado",
  "agenda.student_profile_created": "Criou um perfil de criança na Agenda da Turma",
  "agenda.student_profile_updated": "Atualizou um perfil de criança na Agenda da Turma",
  "agenda.student_profile_deleted": "Apagou um perfil de criança na Agenda da Turma",
  "agenda.turma_created_or_joined": "Criou ou entrou numa turma na Agenda da Turma",
  "agenda.turma_joined_by_code": "Entrou numa turma por código na Agenda da Turma",
  "agenda.turma_set_active": "Trocou a turma ativa na Agenda da Turma",
  "agenda.turma_left": "Saiu de uma turma na Agenda da Turma",
  "agenda.turma_deleted": "Apagou uma turma na Agenda da Turma",
  "agenda.turma_updated": "Atualizou uma turma na Agenda da Turma",
  "agenda.subject_created": "Criou uma matéria na Agenda da Turma",
  "agenda.subject_updated": "Atualizou uma matéria na Agenda da Turma",
  "agenda.subject_deleted": "Apagou uma matéria na Agenda da Turma",
  "agenda.activity_created": "Criou uma atividade na Agenda da Turma",
  "agenda.activity_updated": "Atualizou uma atividade na Agenda da Turma",
  "agenda.activity_deleted": "Apagou uma atividade na Agenda da Turma",
  "agenda.activity_status_set": "Marcou o andamento de uma atividade na Agenda da Turma",
  "agenda.activity_shared_response": "Respondeu a uma atividade compartilhada na Agenda da Turma",
  "missao.profile_updated": "Atualizou um perfil de estudante na Missão Saber",
  "missao.study_connected": "Conectou um aparelho de estudo na Missão Saber",
  "missao.study_code_issued": "Gerou um código de acesso para estudo na Missão Saber",
  "missao.study_revoked": "Desconectou um aparelho de estudo na Missão Saber",
};

/** Quem agiu e não existe mais em `core.users`. */
const DELETED_ACTOR = "Uma conta excluída";

function dateFrom(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Pro mensal, a partir de 3 de março", sem as partes que faltarem. */
function joinDetail(...parts: Array<string | null>): string | null {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length ? present.join(", ") : null;
}

/**
 * Frase da linha do tempo. Só usa do payload o que é identificador, slug de
 * produto, papel, quantidade ou o motivo escrito pela equipe; nunca e-mail, IP
 * ou conteúdo. `links` diz quais assinaturas foram trocadas por agendamento
 * (ver `describeTimeline`).
 */
export function describeEvent(
  event: TimelineEvent,
  subjectId: string,
  actorName: (id: string) => string | null,
  links: SubscriptionLinks = NO_SUBSCRIPTION_LINKS,
): TimelineEntry {
  const { payload } = event;
  const targetId = safeId(text(payload, "targetId"));
  const byOther =
    event.actorId && event.actorId !== subjectId
      ? (actorName(event.actorId) ?? DELETED_ACTOR)
      : null;
  /** "Trocou de plano" quando foi a própria pessoa; "Helena trocou de plano" quando foi outra conta. */
  const did = (phrase: string) =>
    byOther ? `${byOther} ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}` : phrase;
  const aboutOther = targetId && targetId !== subjectId ? targetId : null;
  const reason = text(payload, "reason");
  const base = {
    id: event.id,
    at: event.createdAt,
    detail: null as string | null,
    otherPersonId: aboutOther,
  };

  const simple = SIMPLE[event.eventType];
  if (simple) return { ...base, title: simple };

  switch (event.eventType) {
    case "session.created": {
      const ua = text(payload, "userAgent");
      const where = appPhrase(text(payload, "appName"));
      return {
        ...base,
        title: where ? `Entrou ${where}` : "Entrou numa sessão nova",
        detail: ua ? describeUserAgent(ua) : null,
      };
    }
    case "user.role_changed": {
      const role = text(payload, "newRole");
      const roleText = role && /^[a-z]{3,10}$/.test(role) ? role : "outro";
      const detail = reason ? `Motivo: ${reason}` : null;
      if (aboutOther)
        return { ...base, title: `Mudou o papel de outra conta para ${roleText}`, detail };
      const viaScript = text(payload, "source")?.startsWith("bootstrap-owner")
        ? "O script do primeiro owner"
        : null;
      return {
        ...base,
        title: `${byOther ?? viaScript ?? "Alguém"} mudou o papel desta conta para ${roleText}`,
        detail,
      };
    }
    case "user.banned":
      if (aboutOther)
        return { ...base, title: "Baniu outra conta", detail: reason ? `Motivo: ${reason}` : null };
      return {
        ...base,
        title: `${byOther ?? "A equipe"} baniu a conta`,
        detail: reason ? `Motivo: ${reason}` : null,
      };
    case "user.unbanned": {
      const detail = reason ? `Motivo: ${reason}` : null;
      if (aboutOther) return { ...base, title: "Desbaniu outra conta", detail };
      return { ...base, title: `${byOther ?? "A equipe"} desbaniu a conta`, detail };
    }
    case "admin.sessions_revoked": {
      const count = int(payload, "count") ?? 0;
      const sessions = count === 1 ? "1 sessão" : `${formatNumber(count)} sessões`;
      const detail = reason ? `Motivo: ${reason}` : null;
      if (aboutOther) return { ...base, title: `Encerrou ${sessions} de outra conta`, detail };
      return {
        ...base,
        title: `${byOther ?? "A equipe"} encerrou ${sessions}${sessionsScope(payload.apps)}`,
        detail,
      };
    }
    case "admin.verification_resent": {
      const app = text(payload, "app");
      const where = app && isProductKey(app) ? ` ${productBy(app)}` : "";
      if (aboutOther)
        return { ...base, title: `Reenviou o código de confirmação de outra conta${where}` };
      return {
        ...base,
        title: `${byOther ?? "A equipe"} reenviou o código de confirmação${where}`,
      };
    }
    case "admin.edi_device_disconnected": {
      const detail = reason ? `Motivo: ${reason}` : null;
      if (aboutOther)
        return { ...base, title: "Desconectou um computador Edi de outra conta", detail };
      return {
        ...base,
        title: `${byOther ?? "A equipe"} desconectou um computador da Suíte Edi`,
        detail,
      };
    }
    case "admin.audit_exported":
      return { ...base, title: "Exportou a auditoria do Bastidores" };
    case "missao.consent_recorded": {
      const version = text(payload, "version");
      return {
        ...base,
        title: "Registrou o consentimento na Missão Saber",
        detail: version && /^[A-Za-z0-9._-]{1,20}$/.test(version) ? `versão ${version}` : null,
      };
    }
    case "billing.checkout_started":
      return {
        ...base,
        title: "Abriu a página de pagamento",
        detail: productFromId(text(payload, "productId")),
      };
    case "billing.subscription_created": {
      const detail = productFromId(text(payload, "productId"));
      if (isScheduledSwitch(payload))
        return { ...base, title: "A troca de plano agendada começou a valer", detail };
      const id = subscriptionIdOf(payload);
      if (id && links.replacements.has(id))
        return { ...base, title: "O Stripe confirmou a assinatura do plano novo", detail };
      return { ...base, title: "Assinou", detail };
    }
    case "billing.subscription_updated": {
      // Troca pelo app (`switchPlan`) traz o plano novo; aviso do Stripe traz o atual.
      const next = productFromId(text(payload, "newProductId"));
      const mode = text(payload, "mode");
      if (mode === "immediate") return { ...base, title: did("Trocou de plano"), detail: next };
      if (mode === "schedule_at_period_end") {
        const appliesAt = dateFrom(text(payload, "appliesAt"));
        return {
          ...base,
          title: did("Agendou a troca de plano"),
          detail: joinDetail(next, appliesAt ? `a partir de ${formatDay(appliesAt)}` : null),
        };
      }
      if (reason === "reactivated")
        return { ...base, title: did("Desfez o cancelamento agendado da assinatura") };
      return {
        ...base,
        title: "A assinatura mudou",
        detail: productFromId(text(payload, "productId")) ?? next,
      };
    }
    case "billing.subscription_canceled": {
      const detail = productFromId(text(payload, "productId"));
      if (reason === "lgpd_account_deletion")
        return { ...base, title: "As assinaturas foram canceladas com a exclusão da conta" };
      const id = subscriptionIdOf(payload);
      if (id && links.replaced.has(id))
        return { ...base, title: "O plano anterior terminou para dar lugar ao novo", detail };
      if (payload.atPeriodEnd === true)
        return { ...base, title: did("Agendou o cancelamento da assinatura"), detail };
      if (payload.atPeriodEnd === false)
        return { ...base, title: did("Cancelou a assinatura na hora"), detail };
      // Aviso do Stripe: a assinatura terminou, sem dizer quem pediu.
      return { ...base, title: "A assinatura terminou", detail };
    }
    case "billing.credits_granted": {
      const amount = int(payload, "amount");
      return {
        ...base,
        title: `Recebeu ${amount === null ? "" : `${formatNumber(amount)} `}créditos de IA${inProduct(payload)}`,
      };
    }
    case "billing.credits_refunded": {
      // Débito no saldo: o pagamento do pacote foi reembolsado no Stripe.
      const amount = int(payload, "amount");
      const credits =
        amount === null
          ? "Créditos de IA foram retirados"
          : Math.abs(amount) === 1
            ? "1 crédito de IA foi retirado"
            : `${formatNumber(Math.abs(amount))} créditos de IA foram retirados`;
      return {
        ...base,
        title: `${credits}${inProduct(payload)} depois de um reembolso no Stripe`,
      };
    }
    case "billing.credits_warning_sent": {
      const threshold = int(payload, "threshold");
      return {
        ...base,
        title: "Recebeu o aviso de créditos acabando",
        detail: threshold === null ? null : `${threshold}% dos créditos do mês usados`,
      };
    }
    default:
      return { ...base, title: "Registro técnico", detail: event.eventType.slice(0, 80) };
  }
}

/**
 * A linha do tempo inteira. Olha os eventos juntos para reconhecer a troca de
 * plano agendada: o fim da assinatura antiga e o aviso do Stripe sobre a nova
 * não viram "terminou" nem "Assinou".
 */
export function describeTimeline(
  events: readonly TimelineEvent[],
  subjectId: string,
  actorName: (id: string) => string | null,
): TimelineEntry[] {
  const links = subscriptionLinks(events);
  return events.map((event) => describeEvent(event, subjectId, actorName, links));
}

/** Eventos que não entram na linha do tempo: barulhentos ou mostrados em outra seção. */
export const TIMELINE_EXCLUDED = ["billing.credits_consumed", "admin.user_viewed"] as const;
export const TIMELINE_EXCLUDED_PREFIXES = ["email."] as const;

// ---------------------------------------------------------------------------
// Auditoria da consulta
// ---------------------------------------------------------------------------

/** Janela em que reabrir a mesma ficha não grava outra consulta (atualizações depois de agir). */
export const VIEW_DEDUPE_MINUTES = 10;

export function shouldRecordView(lastViewedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastViewedAt) return true;
  return now.getTime() - lastViewedAt.getTime() >= VIEW_DEDUPE_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// Banimento e sessões
// ---------------------------------------------------------------------------

export const BAN_REASONS = [
  "Abuso de recurso de IA",
  "Fraude no pagamento",
  "Conta de teste",
  "Outro motivo",
] as const;
export const SESSION_REASONS = [
  "A pessoa pediu pelo direct",
  "Suspeita de acesso indevido",
  "Outro motivo",
] as const;
export const DEVICE_REASONS = [
  "A pessoa pediu pelo direct",
  "Computador perdido ou roubado",
  "Outro motivo",
] as const;
export const UNBAN_REASONS = [
  "Banimento feito por engano",
  "Situação resolvida com a pessoa",
  "Outro motivo",
] as const;
export const ROLE_REASONS = [
  "Entrou para a equipe",
  "Mudou de função na equipe",
  "Saiu da equipe",
  "Outro motivo",
] as const;
export const BAN_DURATIONS = {
  "7": "7 dias",
  "30": "30 dias",
  sempre: "Sem data, até desbanir",
} as const;
export type BanDuration = keyof typeof BAN_DURATIONS;

/** Motivo gravado: a opção escolhida e, quando houver, a nota curta da equipe. */
export function composeReason(choice: string, note: string | undefined): string {
  const clean = note?.replace(/\s+/g, " ").trim() ?? "";
  if (choice === "Outro motivo") return clean;
  return clean ? `${choice}: ${clean}` : choice;
}

export function banEndsAt(duration: BanDuration, now: Date = new Date()): Date | null {
  if (duration === "sempre") return null;
  return new Date(now.getTime() + Number(duration) * 86_400_000);
}

export function isBanActive(
  banned: boolean,
  banExpiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  return banned && (!banExpiresAt || banExpiresAt.getTime() > now.getTime());
}

/** Frase do resultado de encerrar sessões, honesta sobre o cache em cookie. */
export function sessionsRevokedMessage(input: {
  databaseCount: number;
  perApp: Array<{ name: string; count: number | null; cookieCacheMinutes: number }>;
}): string {
  const reached = input.perApp.filter((app) => app.count !== null);
  const missed = input.perApp.filter((app) => app.count === null).map((app) => app.name);
  const total = input.databaseCount + reached.reduce((sum, app) => sum + (app.count ?? 0), 0);
  const parts = [
    total === 0
      ? "Não havia sessão aberta."
      : `${total === 1 ? "1 sessão encerrada" : `${formatNumber(total)} sessões encerradas`}.`,
  ];
  const slow = reached
    .filter((app) => app.cookieCacheMinutes > 0 && (app.count ?? 0) > 0)
    .map((app) => app.name);
  if (slow.length)
    parts.push(
      `${joinNames(slow)} pode${slow.length > 1 ? "m" : ""} levar até 5 minutos para pedir a entrada de novo.`,
    );
  if (missed.length)
    parts.push(
      `Não deu para alcançar ${joinNames(missed)}: as sessões de lá continuam abertas. Tente de novo em alguns minutos.`,
    );
  return parts.join(" ");
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
