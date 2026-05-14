import { logAuditEvent } from "@informach/auth";
import { createBillingService, type SubjectRef } from "@informach/billing";
import { APPS, isStripePriceIdConfigured, PRODUCTS, type Product } from "@informach/config";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { unsubscribeMailto } from "./email-identity";
import { emails } from "./emails";
import { env } from "./env";
import { logger } from "./logger";
import { packageLogger } from "./observability";

const stripeMode = env.STRIPE_MODE ?? (env.NODE_ENV === "production" ? "prod" : "dev");
const agendaProducts = PRODUCTS.filter((p) => p.app === APPS.agendaDaTurma.slug);

assertProductionStripeCatalogConfigured(agendaProducts);

/**
 * Single-user: o subject de billing sempre é `user`. Resolvemos o e-mail
 * direto da tabela `core.users`. Quando (no futuro) adicionarmos perfis de
 * filhos, eles ficarão num schema próprio do Agenda — não trocam o subject
 * de billing, que continua sendo o usuário responsável.
 */
async function resolveSubjectEmail(subject: SubjectRef): Promise<string> {
  if (subject.type !== "user") {
    throw new Error(
      `@informach/agenda-da-turma: subject.type='${subject.type}' não suportado (single-user)`,
    );
  }
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, subject.id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`@informach/agenda-da-turma: user ${subject.id} not found`);
  }
  return row.email;
}

export const billing = createBillingService({
  provider: "stripe",
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  db,
  appName: APPS.agendaDaTurma.name,
  app: APPS.agendaDaTurma.slug,
  publicAppUrl: env.NEXT_PUBLIC_APP_URL,
  products: agendaProducts,
  organizationsEnabled: false,
  stripeMode,
  resolveSubjectEmail,
  logger: packageLogger,
  // Email integration: webhook handlers fire transactional billing.* emails.
  // The dunning sweeper (`api/jobs/billing-dunning`) does its own send for
  // `billing.payment-failed`; the 4 handlers here cover payment-success,
  // subscription-renewed, subscription-canceled, credits-purchased.
  sendEmail: emails.sendEmail,
  renderTemplate: emails.renderTemplate,
  manageBillingUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  buildUnsubscribeUrl: (identifier, category) => {
    const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, category);
    return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
  },
  unsubscribeMailto,
  onAudit: (event) => {
    // Fire-and-forget: audit emit must never block the billing call.
    logAuditEvent(event.eventType, event.actorId, event.payload).catch((err) => {
      logger.error(
        {
          eventType: event.eventType,
          error: err instanceof Error ? err.message : String(err),
        },
        "billing.audit.persist_failed",
      );
    });
  },
});

export type DunningRecipient = {
  email: string;
  /** Identifier used to build the unsubscribe HMAC token. */
  unsubscribeIdentifier: string;
};

export async function resolveDunningRecipient(
  subject: SubjectRef,
): Promise<DunningRecipient | null> {
  if (subject.type !== "user") {
    throw new Error(
      `@informach/agenda-da-turma: subject.type='${subject.type}' não suportado (single-user)`,
    );
  }
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, subject.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { email: row.email, unsubscribeIdentifier: row.email };
}

export function buildBillingDunningUnsubscribeUrl(identifier: string): string {
  const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, "billing.payment-failed");
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
}

function assertProductionStripeCatalogConfigured(products: readonly Product[]) {
  if (env.NODE_ENV !== "production" || stripeMode !== "prod") return;

  const missingProductIds = products
    .filter((product) => !isStripePriceIdConfigured(product.stripePriceId.prod))
    .map((product) => product.id);

  if (missingProductIds.length > 0) {
    throw new Error(
      `Agenda da Turma Stripe production Price IDs are not configured: ${missingProductIds.join(", ")}`,
    );
  }
}
