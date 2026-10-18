import "server-only";
import { randomUUID } from "node:crypto";
import type { Staff } from "@/lib/access";
import { emailUnsubscribeUrl, getEmails, sendStaffOnlyEmail } from "@/lib/emails";
import { getEnv } from "@/lib/env";
import {
  hasEnableProof,
  redeemSetupCode,
  replaceSetupCode,
  restoreEnableProof,
  takeEnableProof,
} from "./repository";
import {
  CODE_TTL_MINUTES,
  enableProofIdentifier,
  minutesFrom,
  newSetupCode,
  PROOF_TTL_MINUTES,
  setupCodeIdentifier,
  setupCodePrefix,
} from "./service";

const CATEGORY = "auth.two-factor-setup-otp";

export type SendSetupCodeResult = { ok: true } | { ok: false; reason: "blocked" | "not_sent" };

/**
 * Sorteia o código, troca o anterior da sessão e manda para o e-mail da conta,
 * pelo mesmo envio restrito à equipe das outras mensagens de acesso. O código
 * não fica guardado em lugar nenhum além do e-mail; no banco vai só o HMAC.
 */
export async function sendSetupCode(staff: Staff, sessionId: string): Promise<SendSetupCodeResult> {
  const env = getEnv();
  const code = newSetupCode();
  await replaceSetupCode({
    prefix: setupCodePrefix(sessionId),
    identifier: setupCodeIdentifier(env.BETTER_AUTH_SECRET, sessionId, code),
    userId: staff.id,
    expiresAt: minutesFrom(new Date(), CODE_TTL_MINUTES),
  });
  const { html, text, subject } = await getEmails().renderTemplate(CATEGORY, {
    appName: "Bastidores",
    otp: code,
    expiresInMinutes: CODE_TTL_MINUTES,
  });
  const result = await sendStaffOnlyEmail({
    to: staff.email,
    category: CATEGORY,
    // Código de uso único: a chave da mensagem não pode ser derivada dele.
    messageKey: `two-factor-setup_${randomUUID()}`,
    subject,
    html,
    text,
    unsubscribeUrl: emailUnsubscribeUrl(staff.email, CATEGORY),
    userId: staff.id,
  });
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.status === "skipped" ? "blocked" : "not_sent" };
}

/** Confere o código e, se bater, grava a prova da sessão por 10 minutos. */
export async function confirmSetupCode(
  staff: Staff,
  sessionId: string,
  code: string,
): Promise<boolean> {
  return redeemSetupCode({
    prefix: setupCodePrefix(sessionId),
    identifier: setupCodeIdentifier(getEnv().BETTER_AUTH_SECRET, sessionId, code),
    proofIdentifier: enableProofIdentifier(sessionId),
    userId: staff.id,
    proofExpiresAt: minutesFrom(new Date(), PROOF_TTL_MINUTES),
  });
}

export function takeProofOf(sessionId: string) {
  return takeEnableProof(enableProofIdentifier(sessionId));
}

export function restoreProofOf(sessionId: string, userId: string, expiresAt: Date) {
  return restoreEnableProof({
    proofIdentifier: enableProofIdentifier(sessionId),
    userId,
    expiresAt,
  });
}

export function sessionHasEnableProof(sessionId: string) {
  return hasEnableProof(enableProofIdentifier(sessionId));
}
