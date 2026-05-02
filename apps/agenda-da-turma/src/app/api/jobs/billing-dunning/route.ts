import { APPS } from "@informach/config";
import { db } from "@informach/db";
import { customers, organizations, users } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { renderTemplate } from "@informach/emails/templates";
import { and, eq } from "drizzle-orm";
import { billing } from "@/lib/billing";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const APP_HOSTNAME = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const MAX_DUNNING_ATTEMPTS = 3;

/** Cron sweeper — recommended cadence: every 6h. Sends dunning emails for past_due subs. */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await billing.retryDunningEmails({
    maxAttempts: MAX_DUNNING_ATTEMPTS,
    cooldownHours: 24,
    send: async ({ subscriptionId, subject, invoiceId, attempt }) => {
      const recipient = await resolveDunningRecipient(subject);
      if (!recipient) {
        logger.warn(
          { subscriptionId, subjectType: subject.type, subjectId: subject.id },
          "billing.dunning.recipient_not_found",
        );
        return;
      }
      const unsubscribeUrl = buildUnsubscribeUrlFor(recipient.unsubscribeIdentifier);
      const updatePaymentUrl = `${env.NEXT_PUBLIC_APP_URL}/admin/billing`;
      const {
        html,
        text,
        subject: emailSubject,
      } = await renderTemplate("billing.payment-failed", {
        appName: APPS.agendaDaTurma.name,
        attempt,
        maxAttempts: MAX_DUNNING_ATTEMPTS,
        updatePaymentUrl,
        unsubscribeUrl,
        unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
      });
      await emails.sendEmail({
        to: recipient.email,
        category: "billing.payment-failed",
        // Idempotency: same invoice + same attempt = same email never sent twice.
        messageKey: `dunning_${invoiceId}_${attempt}`,
        unsubscribeUrl,
        unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
        userId: subject.type === "user" ? subject.id : undefined,
        subject: emailSubject,
        html,
        text,
      });
    },
  });
  if (result.scanned > 0) {
    logger.info(result, "billing.cron.dunning");
  }
  return Response.json(result);
}

type DunningRecipient = {
  email: string;
  /** Identifier used to build the unsubscribe HMAC token (email for users, slug for orgs). */
  unsubscribeIdentifier: string;
};

async function resolveDunningRecipient(subject: {
  type: "user" | "organization";
  id: string;
}): Promise<DunningRecipient | null> {
  if (subject.type === "user") {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, subject.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { email: row.email, unsubscribeIdentifier: row.email };
  }
  // Organization subject — billing email is the customer.email persisted at
  // checkout time. Joined with organizations.slug for the unsubscribe identifier.
  const rows = await db
    .select({ email: customers.email, slug: organizations.slug })
    .from(customers)
    .innerJoin(organizations, eq(organizations.id, customers.subjectId))
    .where(
      and(
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "organization"),
        eq(customers.subjectId, subject.id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { email: row.email, unsubscribeIdentifier: row.slug };
}

function buildUnsubscribeUrlFor(identifier: string): string {
  const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, "billing.payment-failed");
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
}
