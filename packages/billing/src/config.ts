import type { StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import type { RenderTemplate, SendEmail } from "@informach/emails";
import type { BillingEmailCategory } from "./billing-emails";
import type { Logger } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingAuditEvent, BillingProvider, Product, SubjectRef } from "./types";

/**
 * Public config passed to {@link createBillingService}. Apps validate env vars
 * with Zod and forward them here — packages must never read process.env directly.
 */
export type BillingServiceConfig = {
  provider: BillingProvider;
  /** Required when provider === "stripe" and providerClient is not injected. */
  stripeSecretKey?: string;
  /** Required when provider === "stripe" and providerClient is not injected. */
  stripeWebhookSecret?: string;
  db: Database;
  appName: string;
  /**
   * Slug que identifica este app dentro do banco de billing
   * (ex.: "cozya", "agenda-da-turma"). Usado como app-scope em
   * `billing.customers.app` e `billing.credit_ledger.app`, isolando
   * customers e saldos de créditos entre apps que compartilham o
   * mesmo subject (ex.: mesmo `user.id` em Cozya e Agenda da Turma).
   * Não é o `appName` (display) — esse é o slug do banco.
   */
  app: string;
  publicAppUrl: string;
  /** Products this app sells. Filter from @informach/config PRODUCTS by app. */
  products: readonly Product[];
  /** When false, `subject.type === "organization"` is rejected. */
  organizationsEnabled: boolean;
  /** Selects which Stripe Price IDs to use from `Product.stripePriceId.{dev,prod}`. */
  stripeMode: StripeMode;
  /**
   * Resolves the customer's email from a subject. Apps implement this:
   *  - subject.type='user'    → SELECT email FROM core.users WHERE id=subject.id
   *  - subject.type='organization' → app-specific (e.g., owner's email or org.metadata)
   */
  resolveSubjectEmail: (subject: SubjectRef) => Promise<string>;
  logger?: Logger;
  /** Audit hook. Apps wire this to logAuditEvent (auth.events table). */
  onAudit?: (event: BillingAuditEvent) => void;
  // ───────────────────────────────────────────────────────────────────────
  // Email integration (optional). When `sendEmail` + `renderTemplate` are
  // both provided, webhook handlers fire transactional emails via these.
  // When ANY of the email-related fields below is missing, billing emails
  // are no-ops — webhook handlers still complete (state changes happen).
  // ───────────────────────────────────────────────────────────────────────
  sendEmail?: SendEmail;
  renderTemplate?: RenderTemplate;
  /** App billing page URL — used as the CTA target on every billing email. */
  manageBillingUrl?: string;
  /** App-provided HMAC unsubscribe URL builder (same pattern as auth). */
  buildUnsubscribeUrl?: (identifier: string, category: BillingEmailCategory) => string;
  unsubscribeMailto?: string;
  /**
   * Inject a custom provider client (used by tests). When omitted, the service
   * builds the appropriate provider from `provider` + secrets above.
   */
  providerClient?: BillingProviderClient;
};
