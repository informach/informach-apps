import { createHmac, randomInt } from "node:crypto";

/**
 * Prova de caixa de e-mail antes de ativar as duas etapas.
 *
 * A senha é a mesma em todos os produtos, então ela sozinha não prova que a
 * pessoa é a dona da conta. Antes de `/two-factor/enable`, a tela manda um
 * código para o e-mail da conta; acertar o código grava uma prova curta, de uso
 * único e presa à sessão, que a rota de autenticação consome na ativação.
 *
 * Os registros ficam em `core.verifications`, sem migração nova, e o valor nunca
 * é lido: o código entra no `identifier` como HMAC com o segredo do Bastidores,
 * e procurar o registro pelo `identifier` já é a conferência.
 */

export const CODE_TTL_MINUTES = 10;
export const PROOF_TTL_MINUTES = 10;

const CODE_PREFIX = "bastidores:2fa-email-code:";
const PROOF_PREFIX = "bastidores:2fa-email-ok:";
/** Id de sessão gerado pelo pacote (UUID); nada de `%` ou `_`, que o LIKE leria como curinga. */
const SESSION_ID = /^[A-Za-z0-9-]{1,80}$/;

function checkedSessionId(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error("unexpected session id format");
  return sessionId;
}

/** Código de 6 números, sorteado com gerador criptográfico. */
export function newSetupCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Aceita espaços no meio (o e-mail mostra o código espaçado); devolve `null` se não forem 6 números. */
export function normalizeSetupCode(raw: string): string | null {
  const clean = raw.replace(/\s+/g, "");
  return /^\d{6}$/.test(clean) ? clean : null;
}

/** Começo comum a todos os códigos da sessão, para trocar o código antigo pelo novo. */
export function setupCodePrefix(sessionId: string): string {
  return `${CODE_PREFIX}${checkedSessionId(sessionId)}:`;
}

/** `identifier` do código: HMAC do par sessão e código, com o segredo do Bastidores. */
export function setupCodeIdentifier(secret: string, sessionId: string, code: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${checkedSessionId(sessionId)}:${code}`)
    .digest("base64url");
  return `${setupCodePrefix(sessionId)}${digest}`;
}

/** `identifier` da prova que libera uma ativação nesta sessão. */
export function enableProofIdentifier(sessionId: string): string {
  return `${PROOF_PREFIX}${checkedSessionId(sessionId)}`;
}

export function minutesFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * Valor de `trustDevice` que o Better Auth trataria como pedido de "confiar
 * neste aparelho". O Bastidores pede o código em toda entrada, então qualquer
 * coisa além de ausente ou falso é recusada antes de chegar ao plugin.
 */
export function asksToTrustDevice(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== "false";
}
