import "server-only";
import { logAuditEvent } from "@informach/auth";
import { db, eq, inArray } from "@informach/db";
import { users } from "@informach/db/schema";
import {
  buildUnsubscribeToken,
  createEmailService,
  type EmailAuditEvent,
  type EmailCategory,
  type SendEmail,
} from "@informach/emails";
import { processUnsubscribe } from "@informach/emails/unsubscribe";
import { getEnv } from "./env";
import { packageLogger, reportOperationalError } from "./observability";
import { isStaffRole } from "./roles";

const audit = (event: EmailAuditEvent) => {
  void logAuditEvent(event.eventType, event.actorId, event.payload).catch((error) =>
    reportOperationalError("email.audit_persistence_failed", error, {
      eventType: event.eventType,
      actorId: event.actorId,
      payloadKeys: Object.keys(event.payload),
    }),
  );
};

let instance: ReturnType<typeof createEmailService> | undefined;
export function getEmails() {
  const env = getEnv();
  instance ??= createEmailService({
    db,
    apiKey: env.SENDGRID_API_KEY,
    defaultFrom: env.SENDGRID_FROM,
    mode: env.EMAIL_SANDBOX_MODE,
    sandboxDir: env.EMAIL_SANDBOX_DIR,
    logger: packageLogger,
    onAudit: audit,
  });
  return instance;
}

/**
 * As contas são compartilhadas entre os apps, e as rotas de autenticação do
 * Bastidores aceitam qualquer e-mail. Para que alguém de fora não receba código
 * com o nome do Bastidores (nem descubra que ele existe), os e-mails de
 * autenticação só saem para contas com papel owner ou admin. Para os demais, a
 * resposta é a mesma de um envio bem-sucedido.
 */
export const sendStaffOnlyEmail: SendEmail = async (input) => {
  const recipient = input.to.trim().toLowerCase();
  const [account] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, recipient))
    .limit(1);
  if (!account || !isStaffRole(account.role)) {
    return { ok: false, status: "skipped", deliveryId: "", reason: "not_staff" };
  }
  return getEmails().sendEmail(input);
};

/** Endereços das contas owner, para avisos e resumo da semana. */
export async function ownerEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.role, ["owner"]));
  return rows.map((row) => row.email);
}

export function emailUnsubscribeUrl(identifier: string, category: EmailCategory) {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category)}`;
}

export async function unsubscribeEmail(token: string | null) {
  if (!token || token.length > 2048) return { ok: false as const };
  return processUnsubscribe({ db, secret: getEnv().BETTER_AUTH_SECRET, onAudit: audit }, token);
}
