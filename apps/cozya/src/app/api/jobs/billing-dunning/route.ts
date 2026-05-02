import { APPS } from "@informach/config";
import { db } from "@informach/db";
import { users } from "@informach/db/schema";
import { buildUnsubscribeToken } from "@informach/emails";
import { renderTemplate } from "@informach/emails/templates";
import { eq } from "drizzle-orm";
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
      // Cozya is single-user — subject.type is always "user" here.
      if (subject.type !== "user") {
        logger.warn(
          { subscriptionId, subjectType: subject.type },
          "billing.dunning.unexpected_subject_type",
        );
        return;
      }
      const userRows = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, subject.id))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        logger.warn({ subscriptionId, userId: subject.id }, "billing.dunning.user_not_found");
        return;
      }
      const unsubscribeUrl = buildUnsubscribeUrlFor(user.email);
      const updatePaymentUrl = `${env.NEXT_PUBLIC_APP_URL}/settings/billing`;
      const {
        html,
        text,
        subject: emailSubject,
      } = await renderTemplate("billing.payment-failed", {
        appName: APPS.cozya.name,
        attempt,
        maxAttempts: MAX_DUNNING_ATTEMPTS,
        updatePaymentUrl,
        unsubscribeUrl,
        unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
      });
      await emails.sendEmail({
        to: user.email,
        category: "billing.payment-failed",
        messageKey: `dunning_${invoiceId}_${attempt}`,
        unsubscribeUrl,
        unsubscribeMailto: `unsubscribe@${APP_HOSTNAME}`,
        userId: subject.id,
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

function buildUnsubscribeUrlFor(identifier: string): string {
  const token = buildUnsubscribeToken(env.BETTER_AUTH_SECRET, identifier, "billing.payment-failed");
  return `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?t=${token}`;
}
