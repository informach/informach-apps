import type { RenderTemplate, SendEmail } from "@informach/emails";
import { type Logger, safeLog } from "./logger";

/**
 * 4 of the 5 `billing.*` email categories. `billing.payment-failed` is sent
 * by the dunning sweeper in the app, not by webhook handlers.
 */
export type BillingEmailCategory =
  | "billing.payment-success"
  | "billing.subscription-renewed"
  | "billing.subscription-canceled"
  | "billing.credits-purchased";

export type BillingEmailRecipient = {
  email: string;
  /**
   * Stable identifier used for the unsubscribe HMAC token. Typically the email
   * itself (matches the auth package convention).
   */
  unsubscribeIdentifier?: string;
  /** When the recipient is a user, pass the id so the email row links back to them. */
  userId?: string;
};

/**
 * Discriminated union of input shapes per category — matches the props of the
 * corresponding React Email component minus the bits this helper computes
 * itself (appName, manageBillingUrl, unsubscribeUrl, unsubscribeMailto).
 */
export type SendBillingEmailInput =
  | {
      category: "billing.payment-success";
      recipient: BillingEmailRecipient;
      messageKey: string;
      productName: string;
      /** Pre-formatted (e.g., "R$ 49,90"). */
      amountFormatted: string;
    }
  | {
      category: "billing.subscription-renewed";
      recipient: BillingEmailRecipient;
      messageKey: string;
      productName: string;
      /** Pre-formatted date (e.g., "01/06/2026"). */
      nextBillingDate: string;
    }
  | {
      category: "billing.subscription-canceled";
      recipient: BillingEmailRecipient;
      messageKey: string;
      productName: string;
      /** Pre-formatted date (e.g., "30/05/2026"). */
      accessUntil: string;
    }
  | {
      category: "billing.credits-purchased";
      recipient: BillingEmailRecipient;
      messageKey: string;
      creditAmount: number;
      balanceAfter: number;
    };

export type BillingEmailDeps = {
  /** Optional. When undefined, sendBillingEmail is a no-op (debug-logged). */
  sendEmail?: SendEmail;
  /** Optional. Required alongside sendEmail. */
  renderTemplate?: RenderTemplate;
  appName: string;
  /**
   * Where the email's CTA points (the app's billing page; users click through
   * to access portal/checkout/dashboard from there).
   */
  manageBillingUrl?: string;
  /** App-provided builder for the One-Click unsubscribe URL. */
  buildUnsubscribeUrl?: (identifier: string, category: BillingEmailCategory) => string;
  unsubscribeMailto?: string;
  logger?: Logger;
};

export type SendBillingEmailResult = {
  sent: boolean;
  /** "ok" when sent; otherwise the reason it was skipped/failed. */
  reason: string;
};

/**
 * Idempotently sends a billing email if the package is configured for it.
 * Returns `{ sent: false, reason: "not_configured" }` when sendEmail/renderTemplate
 * are not provided — the webhook handler still completes successfully because
 * the state change (DB writes) already happened. Same swallow-on-error pattern
 * as audit hooks: an email outage cannot break a webhook ack.
 */
export async function sendBillingEmail(
  deps: BillingEmailDeps,
  input: SendBillingEmailInput,
): Promise<SendBillingEmailResult> {
  if (!deps.sendEmail || !deps.renderTemplate) {
    safeLog(deps.logger, "debug", "billing.email.not_configured", {
      category: input.category,
      to: redactEmail(input.recipient.email),
    });
    return { sent: false, reason: "not_configured" };
  }
  if (!deps.manageBillingUrl) {
    safeLog(deps.logger, "warn", "billing.email.manage_url_missing", {
      category: input.category,
    });
    return { sent: false, reason: "manage_url_missing" };
  }

  const unsubscribeUrl = deps.buildUnsubscribeUrl
    ? deps.buildUnsubscribeUrl(
        input.recipient.unsubscribeIdentifier ?? input.recipient.email,
        input.category,
      )
    : undefined;
  if (!unsubscribeUrl) {
    safeLog(deps.logger, "warn", "billing.email.unsubscribe_url_missing", {
      category: input.category,
    });
    return { sent: false, reason: "unsubscribe_url_missing" };
  }

  let rendered: { html: string; text: string; subject: string };
  try {
    rendered = await renderForCategory(deps, input, {
      manageBillingUrl: deps.manageBillingUrl,
      unsubscribeUrl,
      unsubscribeMailto: deps.unsubscribeMailto,
    });
  } catch (err) {
    safeLog(deps.logger, "error", "billing.email.render_failed", {
      category: input.category,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "render_failed" };
  }

  try {
    await deps.sendEmail({
      to: input.recipient.email,
      category: input.category,
      messageKey: input.messageKey,
      unsubscribeUrl,
      unsubscribeMailto: deps.unsubscribeMailto,
      userId: input.recipient.userId,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    safeLog(deps.logger, "info", "billing.email.sent", {
      category: input.category,
      messageKey: input.messageKey,
      to: redactEmail(input.recipient.email),
    });
    return { sent: true, reason: "ok" };
  } catch (err) {
    safeLog(deps.logger, "error", "billing.email.send_failed", {
      category: input.category,
      messageKey: input.messageKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "send_failed" };
  }
}

async function renderForCategory(
  deps: BillingEmailDeps,
  input: SendBillingEmailInput,
  shared: {
    manageBillingUrl: string;
    unsubscribeUrl: string;
    unsubscribeMailto?: string;
  },
): Promise<{ html: string; text: string; subject: string }> {
  // renderTemplate is checked above; non-null cast is safe here.
  const renderTemplate = deps.renderTemplate as NonNullable<typeof deps.renderTemplate>;
  const baseProps = {
    appName: deps.appName,
    unsubscribeUrl: shared.unsubscribeUrl,
    unsubscribeMailto: shared.unsubscribeMailto,
  };
  switch (input.category) {
    case "billing.payment-success":
      return renderTemplate("billing.payment-success", {
        ...baseProps,
        productName: input.productName,
        amountFormatted: input.amountFormatted,
        manageBillingUrl: shared.manageBillingUrl,
      });
    case "billing.subscription-renewed":
      return renderTemplate("billing.subscription-renewed", {
        ...baseProps,
        productName: input.productName,
        nextBillingDate: input.nextBillingDate,
        manageBillingUrl: shared.manageBillingUrl,
      });
    case "billing.subscription-canceled":
      return renderTemplate("billing.subscription-canceled", {
        ...baseProps,
        productName: input.productName,
        accessUntil: input.accessUntil,
        reactivateUrl: shared.manageBillingUrl,
      });
    case "billing.credits-purchased":
      return renderTemplate("billing.credits-purchased", {
        ...baseProps,
        creditAmount: input.creditAmount,
        balanceAfter: input.balanceAfter,
        dashboardUrl: shared.manageBillingUrl,
      });
  }
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const safeLocal = local.length <= 2 ? local : `${local[0]}***${local[local.length - 1]}`;
  return `${safeLocal}@${domain}`;
}
