"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { type ActionResult, auditAs, reasonSchema, staffAction } from "@/lib/action";
import { getAuth } from "@/lib/auth";
import { PRODUCT_KEYS, PRODUCTS } from "@/lib/products";
import { isStaffRole } from "@/lib/roles";
import { actionTarget, deleteDatabaseSessions, disconnectEdiComputer } from "./repository";
import {
  BAN_DURATIONS,
  BAN_REASONS,
  type BanDuration,
  banEndsAt,
  composeReason,
  DEVICE_REASONS,
  isBanActive,
  joinNames,
  productBy,
  SESSION_REASONS,
  sessionsRevokedMessage,
} from "./service";
import { revokeEverywhere } from "./sessions";
import { requestVerificationCode } from "./verification";

const userId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const note = z.string().max(200).optional();

/** Escolha da lista mais a nota; "Outro motivo" exige a nota. */
function reasonFrom(choice: string, text: string | undefined) {
  return reasonSchema.safeParse(composeReason(choice, text));
}

const AUDITED = "O registro entrou na auditoria em seu nome.";

async function requestHeaders() {
  return new Headers(await headers());
}

export const revokeSessionsAction = staffAction({
  schema: z.object({ userId, reason: z.enum(SESSION_REASONS), note }),
  rateLimit: { key: "bastidores:revoke-sessions", max: 10, window: "10m" },
  run: async (input, staff): Promise<ActionResult> => {
    const reason = reasonFrom(input.reason, input.note);
    if (!reason.success) return { ok: false, error: "Escreva o motivo em poucas palavras." };
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    const result = await revokeEverywhere(target.id);
    const reached = result.perApp.filter((app) => app.count !== null);
    await auditAs(staff, "admin.sessions_revoked", {
      targetId: target.id,
      count: result.databaseCount + reached.reduce((sum, app) => sum + (app.count ?? 0), 0),
      apps: reached.map((app) => app.app),
      reason: reason.data,
    });
    return { ok: true, message: `${sessionsRevokedMessage(result)} ${AUDITED}` };
  },
});

export const resendVerificationAction = staffAction({
  schema: z.object({ userId, app: z.enum(PRODUCT_KEYS) }),
  rateLimit: { key: "bastidores:resend-verification", max: 5, window: "10m" },
  run: async (input, staff): Promise<ActionResult> => {
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    if (target.emailVerified)
      return { ok: false, error: "O e-mail desta conta já está confirmado." };
    const result = await requestVerificationCode(input.app, target.email);
    const name = PRODUCTS[input.app].name;
    if (!result.ok) {
      if (result.reason === "rate_limited")
        return {
          ok: false,
          error: `${name} recusou por excesso de pedidos. Espere um minuto e tente de novo.`,
        };
      if (result.reason === "unreachable")
        return {
          ok: false,
          error: `Não deu para falar com ${name} agora. Veja em Operação se o serviço está no ar.`,
        };
      return {
        ok: false,
        error: `${name} não aceitou o pedido (erro ${result.status ?? "desconhecido"}). Tente de novo em alguns minutos.`,
      };
    }
    await auditAs(staff, "admin.verification_resent", { targetId: target.id, app: input.app });
    return {
      ok: true,
      message: `Código novo enviado ${productBy(input.app)}. Ele vale por 10 minutos e é digitado na tela de ${name}. ${AUDITED}`,
    };
  },
});

export const banAction = staffAction({
  schema: z.object({
    userId,
    reason: z.enum(BAN_REASONS),
    note,
    duration: z.enum(Object.keys(BAN_DURATIONS) as [BanDuration, ...BanDuration[]]),
  }),
  rateLimit: { key: "bastidores:ban", max: 10, window: "1h" },
  run: async (input, staff): Promise<ActionResult> => {
    const reason = reasonFrom(input.reason, input.note);
    if (!reason.success) return { ok: false, error: "Escreva o motivo em poucas palavras." };
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    if (target.id === staff.id) return { ok: false, error: "Você não pode banir a própria conta." };
    if (isStaffRole(target.role))
      return {
        ok: false,
        error:
          "Esta conta é da equipe. Um owner precisa mudar o papel para member antes do banimento.",
      };
    if (isBanActive(target.banned, target.banExpiresAt))
      return {
        ok: false,
        error: "A conta já está banida. Desbanir antes de banir com outro prazo.",
      };
    const endsAt = banEndsAt(input.duration);
    // O pacote grava `user.banned` com o motivo e apaga as sessões do Postgres.
    await getAuth().setUserBanState(await requestHeaders(), {
      userId: target.id,
      banned: true,
      banReason: reason.data,
      banExpiresAt: endsAt,
    });
    const result = await revokeEverywhere(target.id);
    const missed = result.perApp.filter((app) => app.count === null).map((app) => app.name);
    const period =
      input.duration === "sempre" ? "sem data para acabar" : `por ${BAN_DURATIONS[input.duration]}`;
    return {
      ok: true,
      message: [
        `Conta banida ${period}. A pessoa sai de todos os produtos; no Cozya e na Agenda da Turma isso pode levar até 5 minutos.`,
        missed.length
          ? `Não deu para alcançar ${joinNames(missed)}: tente encerrar as sessões de novo em alguns minutos.`
          : "",
        "Assinaturas não foram canceladas: se for o caso, cancele no Stripe.",
        AUDITED,
      ]
        .filter(Boolean)
        .join(" "),
    };
  },
});

export const unbanAction = staffAction({
  schema: z.object({ userId }),
  rateLimit: { key: "bastidores:unban", max: 10, window: "1h" },
  run: async (input): Promise<ActionResult> => {
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    if (!target.banned) return { ok: false, error: "A conta não está banida." };
    await getAuth().setUserBanState(await requestHeaders(), { userId: target.id, banned: false });
    return { ok: true, message: `Conta desbanida. A pessoa já pode entrar de novo. ${AUDITED}` };
  },
});

export const changeRoleAction = staffAction({
  schema: z.object({ userId, role: z.enum(["member", "admin", "owner"]) }),
  role: "owner",
  rateLimit: { key: "bastidores:change-role", max: 10, window: "1h" },
  run: async (input, staff): Promise<ActionResult> => {
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    if (target.id === staff.id) return { ok: false, error: "Você não pode mudar o próprio papel." };
    if (target.role === input.role)
      return { ok: false, error: `A conta já tem o papel ${input.role}.` };
    // O pacote confere `users.set_role` e grava `user.role_changed`.
    await getAuth().setUserRole(await requestHeaders(), target.id, input.role);
    // Quem sai da equipe perde também a sessão aberta no Bastidores (as sessões
    // do Bastidores e da Suíte Edi ficam no Postgres). Cada tela já confere o
    // papel no banco; encerrar a sessão é a segunda trava.
    const leftStaff = isStaffRole(target.role) && !isStaffRole(input.role);
    if (leftStaff) await deleteDatabaseSessions(target.id);
    const effect = leftStaff
      ? "A conta sai da equipe e a sessão dela no Bastidores foi encerrada."
      : input.role === "member"
        ? "A conta continua fora da equipe."
        : "Para entrar no Bastidores, a pessoa cria uma senha e ativa as duas etapas.";
    return { ok: true, message: `Papel mudado para ${input.role}. ${effect} ${AUDITED}` };
  },
});

export const disconnectEdiAction = staffAction({
  schema: z.object({ userId, deviceId: z.uuid(), reason: z.enum(DEVICE_REASONS), note }),
  rateLimit: { key: "bastidores:edi-disconnect", max: 10, window: "1h" },
  run: async (input, staff): Promise<ActionResult> => {
    const reason = reasonFrom(input.reason, input.note);
    if (!reason.success) return { ok: false, error: "Escreva o motivo em poucas palavras." };
    const target = await actionTarget(input.userId);
    if (!target) return { ok: false, error: "Essa conta não existe mais." };
    const revoked = await disconnectEdiComputer(target.id, input.deviceId);
    if (!revoked) return { ok: false, error: "Este computador já estava desconectado." };
    await auditAs(staff, "admin.edi_device_disconnected", {
      targetId: target.id,
      deviceId: input.deviceId,
      reason: reason.data,
    });
    return {
      ok: true,
      message: `Computador desconectado. A vaga fica livre agora, e as ferramentas param de abrir nele na próxima validação da licença, em até 72 horas. ${AUDITED}`,
    };
  },
});
