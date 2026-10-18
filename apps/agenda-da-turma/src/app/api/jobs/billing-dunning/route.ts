import { APPS } from "@informach/config";
import { renderTemplate } from "@informach/emails/templates";
import { billing, buildBillingDunningUnsubscribeUrl, resolveDunningRecipient } from "@/lib/billing";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { unsubscribeMailto } from "@/lib/email-identity";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { recordJob } from "@/lib/job-runs";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_DUNNING_ATTEMPTS = 3;

/** Cron sweeper — recommended cadence: every 6h. Sends dunning emails for past_due subs. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const result = await recordJob("billing-dunning", () =>
    billing.retryDunningEmails({
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
        const unsubscribeUrl = buildBillingDunningUnsubscribeUrl(recipient.unsubscribeIdentifier);
        const updatePaymentUrl = `${env.NEXT_PUBLIC_APP_URL}/settings/billing`;
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
          unsubscribeMailto,
        });
        await emails.sendEmail({
          to: recipient.email,
          category: "billing.payment-failed",
          // Idempotency: same invoice + same attempt = same email never sent twice.
          messageKey: `dunning_${invoiceId}_${attempt}`,
          unsubscribeUrl,
          unsubscribeMailto,
          userId: subject.type === "user" ? subject.id : undefined,
          subject: emailSubject,
          html,
          text,
        });
      },
    }),
  );
  if (result.scanned > 0) {
    logger.info(result, "billing.cron.dunning");
  }
  return Response.json(result);
}
