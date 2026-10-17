import { findProduct } from "@informach/config";
import { formatDay } from "@/lib/format";
import { appPhrase, productName, sessionsScope } from "@/lib/products";
import { emailCategoryLabel } from "../operations/email-labels";
import { planLabel } from "../people/service";
import { groupOf } from "./filters";
import {
  isScheduledSwitch,
  NO_SUBSCRIPTION_LINKS,
  type SubscriptionLinks,
  subscriptionIdOf,
  subscriptionLinks,
} from "./subscription-links";

/**
 * A frase em português de cada evento da auditoria, montada só a partir de IDs
 * e de valores que não carregam dado pessoal (papel, app, categoria, contagem,
 * motivo digitado pela equipe). E-mail, IP, token e qualquer outro valor do
 * payload nunca entram na frase.
 */

export type Person = { id: string; name: string; staff: boolean };

export type AuditEventInput = {
  id: string;
  eventType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type SentencePart =
  | { kind: "text"; text: string }
  | { kind: "person"; id: string; name: string };

export type DescribedEvent = {
  id: string;
  createdAt: Date;
  eventType: string;
  /** `deleted`: a conta que agiu não existe mais; aparece sem link. */
  actor: { kind: "staff" | "person" | "system" | "deleted"; label: string; id: string | null };
  parts: SentencePart[];
  /** Nomes dos campos guardados no payload, nunca os valores. */
  fields: string[];
  /** Consultas e ações da equipe, as do grupo "Ações da equipe". */
  team: boolean;
};

type Context = {
  payload: Record<string, unknown>;
  target: SentencePart | null;
  app: string | null;
  links: SubscriptionLinks;
};

const ROLE_NAMES: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "membro",
  guest: "convidado",
};

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Motivo digitado pela equipe numa ação do Bastidores. Curto e sem quebra de linha. */
function reason(payload: Record<string, unknown>): string | null {
  const value = str(payload, "reason");
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ");
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

const t = (text: string): SentencePart => ({ kind: "text", text });

function withTarget(before: string, ctx: Context, after = ""): SentencePart[] {
  const parts: SentencePart[] = [t(before)];
  parts.push(ctx.target ?? t("uma conta"));
  if (after) parts.push(t(after));
  return parts;
}

/** "no Cozya"; os demais produtos são femininos ("na Agenda da Turma"). */
function inAppPhrase(ctx: Context): string {
  if (!ctx.app) return "";
  const name = productName(ctx.app);
  return ctx.app === "cozya" ? ` no ${name}` : ` na ${name}`;
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}

/** Produto do evento: o slug gravado ou o produto do catálogo citado na cobrança. */
function appOf(payload: Record<string, unknown>): string | null {
  const app = str(payload, "app");
  if (app) return app;
  const productId = str(payload, "productId") ?? str(payload, "newProductId");
  return productId ? (findProduct(productId)?.app ?? null) : null;
}

/** "Pro mensal", só para produto do catálogo; ID desconhecido fica de fora. */
function planOf(payload: Record<string, unknown>, key: string): string | null {
  const productId = str(payload, key);
  return productId && findProduct(productId) ? planLabel(productId) : null;
}

function dateOf(payload: Record<string, unknown>, key: string): Date | null {
  const value = str(payload, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const PHRASES: Record<string, (ctx: Context) => SentencePart[]> = {
  // Bastidores
  "admin.user_viewed": (ctx) => withTarget("Abriu a ficha de ", ctx),
  "admin.sessions_revoked": (ctx) => {
    const count = num(ctx.payload, "count") ?? num(ctx.payload, "revoked");
    const why = reason(ctx.payload);
    return withTarget(
      "Encerrou as sessões de ",
      ctx,
      `${sessionsScope(ctx.payload.apps)}${count !== null ? `, ${plural(count, "sessão", "sessões")}` : ""}${why ? `, motivo: ${why}` : ""}`,
    );
  },
  "admin.verification_resent": (ctx) =>
    withTarget("Reenviou o código de confirmação de e-mail para ", ctx, inAppPhrase(ctx)),
  "admin.edi_device_disconnected": (ctx) => {
    const why = reason(ctx.payload);
    return withTarget(
      "Desconectou um computador da Suíte Edi de ",
      ctx,
      why ? `, motivo: ${why}` : "",
    );
  },
  "admin.audit_exported": (ctx) => {
    const rows = num(ctx.payload, "rows");
    return [
      t(`Exportou a auditoria${rows !== null ? ` (${plural(rows, "linha", "linhas")})` : ""}`),
    ];
  },
  // Contas
  "user.created": () => [t("Criou a conta")],
  "user.email_changed": () => [t("Trocou o e-mail da conta")],
  "user.password_changed": () => [t("Trocou a senha")],
  "user.role_changed": (ctx) => {
    const role = str(ctx.payload, "newRole");
    return withTarget("Mudou o papel de ", ctx, role ? ` para ${ROLE_NAMES[role] ?? role}` : "");
  },
  "user.banned": (ctx) => {
    const why = reason(ctx.payload);
    return withTarget("Baniu ", ctx, why ? `, motivo: ${why}` : "");
  },
  "user.unbanned": (ctx) => withTarget("Desbaniu ", ctx),
  "user.deletion_requested": () => [t("Pediu a exclusão da conta")],
  "user.deleted": () => [t("Uma conta foi excluída")],
  "account.linked": () => [t("Conectou um login externo à conta")],
  "email.verified": () => [t("Confirmou o e-mail")],
  "org.created": () => [t("Criou uma organização")],
  "org.member_added": () => [t("Adicionou alguém a uma organização")],
  "org.member_removed": () => [t("Tirou alguém de uma organização")],
  "org.invitation_sent": () => [t("Enviou um convite para uma organização")],
  // Sessões e acesso
  "session.created": (ctx) => {
    const where = appPhrase(str(ctx.payload, "appName"));
    return [t(where ? `Entrou ${where}` : "Entrou em um produto")];
  },
  "session.revoked": () => [t("Uma sessão foi encerrada")],
  "auth.sign_out": () => [t("Saiu de um produto")],
  "auth.sign_in_otp_requested": () => [t("Alguém pediu um código de acesso")],
  // Quem agiu é "Alguém"; a conta gravada em `actorId` é a dona do e-mail (ver `eventPeople`).
  "auth.signup_attempt_on_existing": (ctx) =>
    withTarget("Tentou criar uma conta nova com o e-mail de ", ctx),
  "auth.forget_password_requested": () => [t("Alguém pediu para trocar a senha")],
  "auth.password_reset_completed": () => [t("Trocou a senha pelo código do e-mail")],
  "auth.two_factor_enabled": () => [t("Ativou as duas etapas")],
  "auth.two_factor_disabled": () => [t("Desativou as duas etapas")],
  "auth.two_factor_verified": () => [t("Confirmou o código das duas etapas")],
  "auth.backup_code_used": () => [t("Entrou com um código de recuperação")],
  // E-mails
  "email.delivery_sent": (ctx) => [t(`Enviou um e-mail de ${categoryText(ctx)}`)],
  "email.delivery_failed": (ctx) => [t(`Um e-mail de ${categoryText(ctx)} falhou`)],
  "email.delivery_skipped": (ctx) => [
    t(`Um e-mail de ${categoryText(ctx)} não foi enviado, por bloqueio ou descadastro`),
  ],
  "email.unsubscribe_recorded": (ctx) => [t(`Alguém pediu para não receber ${categoryText(ctx)}`)],
  "email.suppression_recorded": () => [t("Um endereço entrou na lista de bloqueio do SendGrid")],
  // Cobrança
  "billing.checkout_started": (ctx) => [t(`Abriu o pagamento${inAppPhrase(ctx)}`)],
  "billing.subscription_created": (ctx) => {
    if (isScheduledSwitch(ctx.payload)) {
      const plan = planOf(ctx.payload, "productId");
      return [
        t(`Troca de plano agendada aplicada${inAppPhrase(ctx)}${plan ? `, agora ${plan}` : ""}`),
      ];
    }
    const id = subscriptionIdOf(ctx.payload);
    if (id && ctx.links.replacements.has(id))
      return [t(`Assinatura do plano novo confirmada${inAppPhrase(ctx)}`)];
    return [t(`Assinatura criada${inAppPhrase(ctx)}`)];
  },
  "billing.subscription_updated": (ctx) => {
    // Troca pelo app (`switchPlan`) traz o plano novo em `newProductId`.
    const mode = str(ctx.payload, "mode");
    const next = planOf(ctx.payload, "newProductId");
    const to = next ? ` para ${next}` : "";
    if (mode === "immediate") return [t(`Trocou de plano${inAppPhrase(ctx)}${to}, na hora`)];
    if (mode === "schedule_at_period_end") {
      const at = dateOf(ctx.payload, "appliesAt");
      return [
        t(`Agendou a troca de plano${inAppPhrase(ctx)}${to}${at ? ` em ${formatDay(at)}` : ""}`),
      ];
    }
    if (str(ctx.payload, "reason") === "reactivated")
      return [t(`Desfez o cancelamento agendado da assinatura${inAppPhrase(ctx)}`)];
    return [t(`Assinatura atualizada${inAppPhrase(ctx)}`)];
  },
  "billing.subscription_canceled": (ctx) => {
    const { payload } = ctx;
    if (str(payload, "reason") === "lgpd_account_deletion") {
      const canceled = num(payload, "canceled");
      const failed = num(payload, "failed");
      const counts = [
        canceled !== null ? plural(canceled, "cancelada", "canceladas") : null,
        failed ? plural(failed, "falha", "falhas") : null,
      ].filter(Boolean);
      return [
        t(
          `Assinaturas canceladas pela exclusão da conta${counts.length ? ` (${counts.join(", ")})` : ""}`,
        ),
      ];
    }
    const id = subscriptionIdOf(payload);
    if (id && ctx.links.replaced.has(id))
      return [t(`Plano anterior encerrado pela troca agendada${inAppPhrase(ctx)}`)];
    if (payload.atPeriodEnd === true)
      return [t(`Agendou o cancelamento da assinatura${inAppPhrase(ctx)}`)];
    if (payload.atPeriodEnd === false)
      return [t(`Cancelou a assinatura na hora${inAppPhrase(ctx)}`)];
    // Aviso do Stripe: diz que terminou, não quem pediu (a pessoa, a equipe no Stripe ou o fim do período).
    return [t(`Cancelamento registrado${inAppPhrase(ctx)}, a assinatura terminou`)];
  },
  "billing.payment_succeeded": (ctx) => [t(`Pagamento confirmado${inAppPhrase(ctx)}`)],
  "billing.payment_failed": (ctx) => {
    const attempt = num(ctx.payload, "attempt");
    return [
      t(`Cobrança recusada${inAppPhrase(ctx)}${attempt !== null ? `, tentativa ${attempt}` : ""}`),
    ];
  },
  "billing.credits_granted": (ctx) => [t(`Créditos de IA liberados${inAppPhrase(ctx)}`)],
  "billing.credits_consumed": (ctx) => [t(`Créditos de IA usados${inAppPhrase(ctx)}`)],
  // Débito no saldo: o pagamento do pacote de créditos foi reembolsado no Stripe.
  "billing.credits_refunded": (ctx) => {
    const amount = num(ctx.payload, "amount");
    const credits =
      amount === null
        ? "Créditos de IA retirados"
        : plural(Math.abs(amount), "crédito de IA retirado", "créditos de IA retirados");
    return [t(`${credits}${inAppPhrase(ctx)} depois de um reembolso no Stripe`)];
  },
  "billing.credits_warning_sent": (ctx) => {
    const threshold = num(ctx.payload, "threshold");
    return [
      t(
        `Aviso de créditos enviado${threshold !== null ? `, ${threshold}% usados` : ""}${inAppPhrase(ctx)}`,
      ),
    ];
  },
  // Agenda da Turma
  "agenda.student_profile_created": () => [t("Criou um perfil de estudante na Agenda da Turma")],
  "agenda.student_profile_updated": () => [t("Mudou um perfil de estudante na Agenda da Turma")],
  "agenda.student_profile_deleted": () => [t("Apagou um perfil de estudante na Agenda da Turma")],
  "agenda.turma_created_or_joined": () => [t("Criou ou entrou numa turma na Agenda da Turma")],
  "agenda.turma_joined_by_code": () => [t("Entrou numa turma pelo código na Agenda da Turma")],
  "agenda.turma_set_active": () => [t("Trocou a turma ativa na Agenda da Turma")],
  "agenda.turma_left": () => [t("Saiu de uma turma na Agenda da Turma")],
  "agenda.turma_deleted": () => [t("Apagou uma turma na Agenda da Turma")],
  "agenda.turma_updated": () => [t("Mudou uma turma na Agenda da Turma")],
  "agenda.subject_created": () => [t("Criou uma matéria na Agenda da Turma")],
  "agenda.subject_updated": () => [t("Mudou uma matéria na Agenda da Turma")],
  "agenda.subject_deleted": () => [t("Apagou uma matéria na Agenda da Turma")],
  "agenda.activity_created": () => [t("Criou uma atividade na Agenda da Turma")],
  "agenda.activity_updated": () => [t("Mudou uma atividade na Agenda da Turma")],
  "agenda.activity_deleted": () => [t("Apagou uma atividade na Agenda da Turma")],
  "agenda.activity_status_set": () => [t("Marcou a situação de uma atividade na Agenda da Turma")],
  "agenda.activity_shared_response": () => [
    t("Respondeu a uma atividade compartilhada na Agenda da Turma"),
  ],
  "agenda.profile_subject_created": () => [t("Criou uma matéria de um perfil na Agenda da Turma")],
  "agenda.profile_subject_updated": () => [t("Mudou uma matéria de um perfil na Agenda da Turma")],
  "agenda.profile_subject_status_changed": () => [
    t("Mudou a situação de uma matéria de um perfil na Agenda da Turma"),
  ],
  "agenda.profile_subject_deleted": () => [t("Apagou uma matéria de um perfil na Agenda da Turma")],
  "agenda.profile_subject_activity_created": () => [
    t("Criou uma atividade de um perfil na Agenda da Turma"),
  ],
  "agenda.profile_subject_activity_updated": () => [
    t("Mudou uma atividade de um perfil na Agenda da Turma"),
  ],
  "agenda.profile_subject_activity_deleted": () => [
    t("Apagou uma atividade de um perfil na Agenda da Turma"),
  ],
  "agenda.profile_subject_activity_status_set": () => [
    t("Marcou a situação de uma atividade de um perfil na Agenda da Turma"),
  ],
  // Missão Saber
  "missao.profile_updated": () => [t("Mudou um perfil de estudante na Missão Saber")],
  "missao.study_connected": () => [t("Conectou um aparelho de estudo na Missão Saber")],
  "missao.study_code_issued": () => [t("Gerou um código de estudo na Missão Saber")],
  "missao.study_revoked": () => [t("Desconectou um aparelho de estudo na Missão Saber")],
  "missao.consent_recorded": () => [t("Registrou o consentimento da família na Missão Saber")],
};

function categoryText(ctx: Context): string {
  const category = str(ctx.payload, "category");
  return category ? emailCategoryLabel(category).toLowerCase() : "um tipo não informado";
}

/** O ID da pessoa sobre quem é o evento, nos nomes de campo usados pelos pacotes e pelo Bastidores. */
export function targetIdOf(payload: Record<string, unknown>): string | null {
  return str(payload, "targetId") ?? str(payload, "targetUserId");
}

/**
 * Quem agiu e sobre quem. Na tentativa de cadastro com um e-mail que já tem
 * conta, `@informach/auth` grava a conta existente em `actorId`, mas ela é o
 * alvo: quem tentou não tem conta, ou não se sabe qual é.
 */
export function eventPeople(event: Pick<AuditEventInput, "eventType" | "actorId" | "payload">): {
  actorId: string | null;
  targetId: string | null;
} {
  if (event.eventType === "auth.signup_attempt_on_existing")
    return { actorId: null, targetId: event.actorId };
  return { actorId: event.actorId, targetId: targetIdOf(event.payload ?? {}) };
}

function systemLabel(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === "user.role_changed") {
    // Gravado por `scripts/bootstrap-owner.ts`, com ou sem `--emergencia`.
    const source = str(payload, "source");
    if (source === "bootstrap-owner:emergencia") return "Script de emergência do owner";
    if (source?.startsWith("bootstrap-owner")) return "Script do primeiro owner";
  }
  if (eventType === "billing.subscription_canceled") {
    if (str(payload, "reason") === "lgpd_account_deletion") return "Exclusão da conta";
    // O webhook só informa que a assinatura acabou; quem pediu não vem junto.
    return str(payload, "status") ? "Aviso do Stripe" : "Sistema";
  }
  if (eventType.startsWith("billing.payment_") || eventType.startsWith("billing.subscription_"))
    return "Stripe";
  if (eventType.startsWith("auth.")) return "Alguém";
  return "Sistema";
}

/** Conta citada no evento que não existe mais: vira texto, sem link para ficha vazia. */
const DELETED_TARGET = t("uma conta excluída");

export function describeEvent(
  event: AuditEventInput,
  people: ReadonlyMap<string, Person>,
  links: SubscriptionLinks = NO_SUBSCRIPTION_LINKS,
): DescribedEvent {
  const payload = event.payload ?? {};
  const { actorId, targetId } = eventPeople(event);
  const targetPerson = targetId ? people.get(targetId) : undefined;
  const ctx: Context = {
    payload,
    target: !targetId
      ? null
      : targetPerson
        ? { kind: "person", id: targetId, name: targetPerson.name || "uma conta sem nome" }
        : DELETED_TARGET,
    app: appOf(payload),
    links,
  };
  const phrase = PHRASES[event.eventType];
  const actorPerson = actorId ? people.get(actorId) : undefined;
  const actor: DescribedEvent["actor"] = !actorId
    ? { kind: "system", label: systemLabel(event.eventType, payload), id: null }
    : actorPerson
      ? {
          kind: actorPerson.staff ? "staff" : "person",
          label: actorPerson.name || "Conta sem nome",
          id: actorId,
        }
      : { kind: "deleted", label: "Conta excluída", id: null };
  return {
    id: event.id,
    createdAt: event.createdAt,
    eventType: event.eventType,
    actor,
    parts: phrase ? phrase(ctx) : [t("Registrou um evento sem descrição em português ainda")],
    fields: Object.keys(payload).sort(),
    team: groupOf(event.eventType) === "equipe",
  };
}

/**
 * Uma página de eventos. Olha os eventos juntos para reconhecer a troca de
 * plano agendada, que no fim do período encerra uma assinatura e cria outra.
 */
export function describeEvents(
  events: readonly AuditEventInput[],
  people: ReadonlyMap<string, Person>,
): DescribedEvent[] {
  const links = subscriptionLinks(events);
  return events.map((event) => describeEvent(event, people, links));
}

/** A frase inteira em texto corrido, para testes e leitores que não seguem link. */
export function sentenceText(parts: readonly SentencePart[]): string {
  return parts.map((part) => (part.kind === "text" ? part.text : part.name)).join("");
}

/** IDs de pessoa citados nos eventos (quem agiu e sobre quem), para buscar os nomes de uma vez. */
export function peopleIdsOf(events: readonly AuditEventInput[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const { actorId, targetId } = eventPeople(event);
    if (actorId) ids.add(actorId);
    if (targetId) ids.add(targetId);
  }
  return [...ids];
}
