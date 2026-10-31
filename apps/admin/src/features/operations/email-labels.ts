import type { EmailCategory } from "@informach/emails";

/**
 * Nome em português de cada categoria de e-mail, agrupando as que a equipe lê
 * como uma coisa só (os dois jeitos de confirmar e-mail, por exemplo). Só
 * categoria e situação aparecem no Bastidores; assunto, corpo e destinatário
 * nunca são lidos. O `satisfies` exige toda categoria do pacote de e-mails:
 * categoria nova sem rótulo não compila.
 */
const CATEGORY_LABELS: Record<string, string> = {
  "auth.verify-email": "Confirmação de e-mail",
  "auth.verify-email-otp": "Confirmação de e-mail",
  "auth.sign-in-otp": "Código de acesso",
  "auth.magic-link": "Link de acesso",
  "auth.forget-password-otp": "Troca de senha",
  "auth.password-reset": "Troca de senha",
  "auth.invitation": "Convite",
  "auth.account-deletion": "Exclusão de conta",
  "auth.signup-attempt-on-existing": "Aviso de cadastro repetido",
  "auth.two-factor-setup-otp": "Ativação das duas etapas",
  "billing.payment-success": "Recibos e cobrança",
  "billing.payment-failed": "Recibos e cobrança",
  "billing.subscription-renewed": "Recibos e cobrança",
  "billing.subscription-canceled": "Recibos e cobrança",
  "billing.credits-purchased": "Recibos e cobrança",
  "billing.credits-warning": "Aviso de créditos",
  "agenda.routine": "Lembretes e resumo da Agenda",
  "missao.weekly-report": "Resumo semanal da Missão Saber",
  "bora.reminder": "Lembrete de treino do Bora Treinar",
  "bora.weekly-summary": "Resumo semanal do Bora Treinar",
  "admin.alert": "Avisos do Bastidores",
  "admin.weekly-summary": "Resumo da semana do Bastidores",
} satisfies Record<EmailCategory, string>;

export function emailCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? "Outros e-mails";
}

/**
 * Situação do envio reduzida ao que importa para a equipe. `failed` com nova
 * tentativa marcada ainda pode chegar; sem nova tentativa, desistimos.
 */
export type EmailOutcome = "delivered" | "sent" | "retrying" | "lost" | "skipped";

export function emailOutcome(status: string, retryScheduled: boolean): EmailOutcome {
  switch (status) {
    case "delivered":
      return "delivered";
    case "sent":
      return "sent";
    case "pending":
    case "sending":
    case "unknown":
      return "retrying";
    case "failed":
      return retryScheduled ? "retrying" : "lost";
    case "skipped":
      return "skipped";
    default:
      // bounced, dropped, complained
      return "lost";
  }
}
