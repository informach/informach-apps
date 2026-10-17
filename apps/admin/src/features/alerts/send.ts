import "server-only";
import { createHash } from "node:crypto";
import type { EmailCategory } from "@informach/emails";
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
 * Envia a mesma mensagem para cada pessoa, com `messageKey` por destinatário.
 * Devolve `delivered: true` só se todas saíram (ou já tinham saído, ou foram
 * bloqueadas de propósito); qualquer falha deixa para a próxima rodada, que
 * reenvia só para quem faltou.
 */
export async function sendToAll(input: {
  category: AdminCategory;
  recipients: readonly string[];
  messageKey: (recipientKey: string) => string;
  /** Monta o e-mail já com o link de descadastro daquela pessoa. */
  render: (unsubscribeUrl: string) => Promise<{ html: string; text: string; subject: string }>;
}): Promise<{ delivered: boolean; sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const recipient of input.recipients) {
    const unsubscribeUrl = emailUnsubscribeUrl(recipient, input.category);
    try {
      const { html, text, subject } = await input.render(unsubscribeUrl);
      const result = await getEmails().sendEmail({
        to: recipient,
        category: input.category,
        messageKey: input.messageKey(recipientKey(recipient)),
        subject,
        html,
        text,
        unsubscribeUrl,
      });
      if (result.ok || result.status === "skipped") sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      reportOperationalError("alert.delivery_failed", error, { category: input.category });
    }
  }
  return { delivered: failed === 0, sent, failed };
}
