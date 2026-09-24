import "server-only";
import { createHash, randomInt } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { recordProductEvent } from "@/features/metrics/events";
import { env } from "@/lib/env";
import { generateInboxToken, inboxAddress, senderDomain, tokenFromRecipient } from "./address";
import {
  countNewMessages,
  findActiveInboxAddress,
  findOwnerByToken,
  insertInboxMessage,
  MAX_NEW_MESSAGES,
  MESSAGE_RETENTION_DAYS,
  replaceInboxAddress,
  revokeInboxAddresses,
} from "./repository";

/** Sem domínio configurado, a feature ainda não existe para ninguém. */
export const inboxEnabled = () => Boolean(env.INBOUND_EMAIL_DOMAIN);

/**
 * O endereço só é mostrado inteiro na hora em que nasce.
 *
 * Como o token vive em hash, não dá para reconstruí-lo depois — de propósito,
 * pela mesma razão do feed de calendário. Quem perder o endereço gira e recebe
 * outro; o anterior para de aceitar mensagem na hora.
 */
export async function createInboxAddress(userId: string) {
  if (!inboxEnabled()) return err({ code: "INBOX_DISABLED" } as const);
  const token = generateInboxToken(() => randomInt(0, 1_000_000) / 1_000_000);
  await replaceInboxAddress(userId, token);
  return ok({ address: inboxAddress(token, env.INBOUND_EMAIL_DOMAIN ?? "") });
}

export async function revokeInboxAddress(userId: string) {
  await revokeInboxAddresses(userId);
  return ok({ revoked: true });
}

export async function hasInboxAddress(userId: string) {
  return Boolean(await findActiveInboxAddress(userId));
}

export type InboundEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachment: { name: string; type: string; dataUrl: string } | null;
};

const MAX_TEXT = 16_000;
const ALLOWED_ATTACHMENTS = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

/**
 * Guarda o que chegou por e-mail. Não lê nada, não cobra nada.
 *
 * A leitura pela IA — e a cobrança — acontece quando a família escolhe a
 * criança e manda organizar. Um e-mail que chega sozinho nunca gasta crédito de
 * ninguém: senão, qualquer um que descobrisse o endereço esvaziaria a conta.
 */
export async function receiveInboundEmail(input: InboundEmail, now = new Date()) {
  const domain = env.INBOUND_EMAIL_DOMAIN;
  if (!domain) return err({ code: "INBOX_DISABLED" } as const);
  const token = tokenFromRecipient(input.to, domain);
  if (!token) return err({ code: "UNKNOWN_ADDRESS" } as const);
  const ownerUserId = await findOwnerByToken(token);
  if (!ownerUserId) return err({ code: "UNKNOWN_ADDRESS" } as const);
  // Teto por família: a caixa é um degrau até a revisão, não um arquivo.
  if ((await countNewMessages(ownerUserId)) >= MAX_NEW_MESSAGES)
    return err({ code: "INBOX_FULL" } as const);

  const attachment =
    input.attachment && ALLOWED_ATTACHMENTS.includes(input.attachment.type)
      ? input.attachment
      : null;
  const message = await insertInboxMessage({
    ownerUserId,
    // Do remetente ficam o hash (para reconhecer repetição) e o domínio (para
    // a família reconhecer a escola). O endereço completo é dado de terceiro.
    fromHash: createHash("sha256").update(input.from.trim().toLowerCase()).digest("hex"),
    fromDomain: senderDomain(input.from),
    subject: input.subject.slice(0, 300),
    text: input.text.slice(0, MAX_TEXT),
    attachmentName: attachment?.name.slice(0, 180) ?? null,
    attachmentType: attachment?.type ?? null,
    attachmentData: attachment?.dataUrl ?? null,
    expiresAt: new Date(now.valueOf() + MESSAGE_RETENTION_DAYS * 86_400_000),
  });
  if (!message) return err({ code: "INBOX_FULL" } as const);
  await recordProductEvent(ownerUserId, { event: "inbox_message_received" });
  return ok({ id: message.id });
}
