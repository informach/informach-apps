import "server-only";
import { createHash } from "node:crypto";
import type { DispatchResult, EmailCategory } from "@informach/emails";
import { emailUnsubscribeUrl, getEmails, ownerEmails } from "@/lib/emails";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";

type AdminCategory = Extract<EmailCategory, "admin.alert" | "admin.weekly-summary">;

/** Resumo curto do endereço para a chave da mensagem; o e-mail não vai na chave. */
export function recipientKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function unique(emails: readonly string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

/** Avisos de serviço: contas owner e quem mais estiver em ADMIN_ALERT_EMAILS. */
export async function alertRecipients(): Promise<string[]> {
  return unique([...(await ownerEmails()), ...getEnv().ADMIN_ALERT_EMAILS]);
}

/** Resumo da semana, com receita: só contas owner. */
export async function ownerRecipients(): Promise<string[]> {
  return unique(await ownerEmails());
}

/**
 * Quantas vezes um envio de desfecho desconhecido é refeito com chave nova.
 *
 * O `email-recover-stale` dos outros apps marca `unknown` uma tentativa que
 * ficou 30 minutos em `sending` sem aceite do SendGrid, e o pacote de e-mails
 * nunca reenvia `unknown` sozinho, porque o provedor pode ter aceitado antes da
 * queda: a mesma chave responde `deferred` para sempre. Para um aviso da
 * equipe, ficar sem o aviso é pior que receber duas vezes, então a próxima
 * passada tenta a mesma mensagem com a chave seguinte (`:reenvio-1`, ...).
 *
 * O que de fato saiu não repete: quando o aceite do SendGrid chega pelo webhook,
 * a chave original vira `already-sent` e a corrente para nela; e uma chave
 * nova que já saiu também para a corrente na passada seguinte.
 */
export const UNKNOWN_RESEND_LIMIT = 3;

/** Chave da tentativa `attempt`: a 0 é a original; as seguintes ganham `:reenvio-N`. */
export function attemptMessageKey(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}:reenvio-${attempt}`;
}

export type SendToAllResult = {
  /** Nada ficou para tentar de novo: cada pessoa recebeu, já tinha recebido ou foi bloqueada de vez. */
  delivered: boolean;
  /** Quem recebeu de fato (agora ou numa rodada anterior). */
  sent: number;
  /** Bloqueado de vez pelo provedor (bounce ou spam) ou por descadastro; não conta como enviado. */
  skipped: number;
  /** Falha que a próxima rodada tenta de novo. */
  failed: number;
};

/**
 * Envia a mesma mensagem para cada pessoa, com `messageKey` por destinatário.
 * Envio pulado não é envio: ele não entra em `sent`, e quem chama decide o que
 * dizer quando ninguém recebeu. `delivered: true` só quer dizer que não sobrou
 * nada para a próxima rodada, que reenvia só para quem falhou. Uma chave presa
 * em desfecho desconhecido segue para a próxima (`UNKNOWN_RESEND_LIMIT`).
 */
export async function sendToAll(input: {
  category: AdminCategory;
  recipients: readonly string[];
  messageKey: (recipientKey: string) => string;
  /** Monta o e-mail; o link de descadastro daquela pessoa vem junto, para quem quiser mostrar. */
  render: (unsubscribeUrl: string) => Promise<{ html: string; text: string; subject: string }>;
}): Promise<SendToAllResult> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const recipient of input.recipients) {
    const unsubscribeUrl = emailUnsubscribeUrl(recipient, input.category);
    try {
      const { html, text, subject } = await input.render(unsubscribeUrl);
      const base = input.messageKey(recipientKey(recipient));
      let result: DispatchResult | null = null;
      for (let attempt = 0; attempt <= UNKNOWN_RESEND_LIMIT; attempt++) {
        result = await getEmails().sendEmail({
          to: recipient,
          category: input.category,
          messageKey: attemptMessageKey(base, attempt),
          subject,
          html,
          text,
          unsubscribeUrl,
        });
        if (result.ok || result.status !== "deferred" || result.reason !== "outcome-unknown") break;
      }
      if (!result) failed += 1;
      else if (result.ok) sent += 1;
      else if (result.status === "skipped") skipped += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      reportOperationalError("alert.delivery_failed", error, { category: input.category });
    }
  }
  return { delivered: failed === 0, sent, skipped, failed };
}
