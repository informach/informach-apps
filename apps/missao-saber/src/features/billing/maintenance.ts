import "server-only";
import { buildUnsubscribeUrl, emails } from "@/lib/emails";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { billingEmail } from "./repository";
import { billing } from "./service";

export async function maintainBilling(
  cursors: {
    reconciliation?: string;
    dunning?: string;
    batchSize?: number;
    reconciliationDone?: boolean;
    dunningDone?: boolean;
  } = {},
) {
  const reconciliation = cursors.reconciliationDone
    ? { scanned: 0, reconciled: 0, mismatches: 0, errors: 0, nextCursor: undefined }
    : await billing.reconcileSubscriptions({
        batchSize: cursors.batchSize ?? 100,
        afterId: cursors.reconciliation,
      });
  const dunning = cursors.dunningDone
    ? { scanned: 0, sent: 0, skipped: 0, nextCursor: undefined }
    : await billing.retryDunningEmails({
        maxAttempts: 3,
        cooldownHours: 24,
        batchSize: cursors.batchSize ?? 100,
        afterId: cursors.dunning,
        send: async ({ subject, invoiceId, attempt }) => {
          assertAllowed(subject.type === "user", "SUBJECT", "Unsupported subject");
          const email = await billingEmail(subject.id);
          const unsubscribeUrl = buildUnsubscribeUrl(email, "billing.payment-failed");
          const message = await emails.renderTemplate("billing.payment-failed", {
            appName: "Missão Saber",
            attempt,
            maxAttempts: 3,
            updatePaymentUrl: `${env.NEXT_PUBLIC_APP_URL}/familia`,
            unsubscribeUrl,
          });
          const result = await emails.sendEmail({
            to: email,
            category: "billing.payment-failed",
            messageKey: `missao_dunning_${invoiceId}_${attempt}`,
            userId: subject.id,
            unsubscribeUrl,
            ...message,
          });
          if (result.ok) return;
          if (result.status === "skipped") return { status: "suppressed" as const };
          // Failed/deferred deliveries keep the same message key and retry number.
          // The email dispatcher owns transport retries and delivery idempotency.
          throw new Error("Dunning delivery not confirmed");
        },
      });
  return { reconciliation, dunning };
}
