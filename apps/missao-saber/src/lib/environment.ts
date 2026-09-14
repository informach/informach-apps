import { isStripePriceIdConfigured } from "@informach/config";
import { z } from "zod";

export const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SENDGRID_API_KEY: z.string().min(1),
  SENDGRID_FROM: z.string().min(3),
  SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().default(""),
  EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("live"),
  EMAIL_SANDBOX_DIR: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_MODE: z.enum(["dev", "prod"]).default("dev"),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().default(""),
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(32),
  MISSAO_CONTENT_MANAGER_IDS: z.string().default(""),
  MISSAO_CONTENT_MANAGER_EMAILS: z.string().default(""),
  MISSAO_METRICS_EXCLUDED_EMAILS: z.string().default(""),
  MISSAO_INDIVIDUAL_MONTHLY_PRICE: z.string().default(""),
  MISSAO_INDIVIDUAL_ANNUAL_PRICE: z.string().default(""),
  MISSAO_FAMILY_MONTHLY_PRICE: z.string().default(""),
  MISSAO_FAMILY_ANNUAL_PRICE: z.string().default(""),
});

export function validateEnvironment(input: NodeJS.ProcessEnv) {
  // Report names only: Zod issues can otherwise expose rejected secret values.
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
  if (value.STRIPE_MODE === "prod" && !/^(sk|rk)_live_/.test(value.STRIPE_SECRET_KEY))
    throw new Error("Live billing requires a live Stripe key.");
  if (value.STRIPE_MODE === "dev" && !/^(sk|rk)_test_/.test(value.STRIPE_SECRET_KEY))
    throw new Error("Local billing requires a test Stripe key.");
  if (input.RAILWAY_ENVIRONMENT_ID || (value.NODE_ENV === "production" && !local)) {
    if (input.MISSAO_ISOLATED_TEST === "1")
      throw new Error("Isolated tests cannot run on a deployed service.");
    if (
      appUrl.protocol !== "https:" ||
      local ||
      value.BETTER_AUTH_URL !== appUrl.origin ||
      value.NEXT_PUBLIC_APP_URL !== appUrl.origin
    )
      throw new Error("Production app URLs must match and use HTTPS origins.");
    if (value.STRIPE_MODE !== "prod" || value.EMAIL_SANDBOX_MODE !== "live")
      throw new Error("Production requires live billing and email.");
    if (
      !value.REDIS_URL ||
      !value.SENTRY_DSN ||
      value.SENTRY_DSN !== value.NEXT_PUBLIC_SENTRY_DSN ||
      !value.SENDGRID_WEBHOOK_PUBLIC_KEY
    )
      throw new Error("Production requires Redis, Sentry and signed email webhooks.");
    if (
      !value.STRIPE_PORTAL_CONFIGURATION_ID.startsWith("bpc_") ||
      [
        value.MISSAO_INDIVIDUAL_MONTHLY_PRICE,
        value.MISSAO_INDIVIDUAL_ANNUAL_PRICE,
        value.MISSAO_FAMILY_MONTHLY_PRICE,
        value.MISSAO_FAMILY_ANNUAL_PRICE,
      ].some((price) => !isStripePriceIdConfigured(price))
    )
      throw new Error("Production requires all four prices and an app-specific billing portal.");
  }
  return value;
}
