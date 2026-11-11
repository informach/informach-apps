import { z } from "zod";

// Dia de Estrela never sold a plan of its own: access comes only from the
// family's Compasso coverage, so the app holds no payment credentials.
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
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  CRON_SECRET: z.string().min(32),
  /** Par VAPID do push dos alertas aos pais. Sem ele, os alertas ficam só no Início. */
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
});

export function validateEnvironment(input: NodeJS.ProcessEnv) {
  // Report names only: Zod issues can otherwise expose rejected secret values.
  const parsed = schema.safeParse(
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== "")),
  );
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
  if (!!value.VAPID_PUBLIC_KEY !== !!value.VAPID_PRIVATE_KEY)
    throw new Error("Push requires both VAPID keys or neither.");
  if (input.RAILWAY_ENVIRONMENT_ID || (value.NODE_ENV === "production" && !local)) {
    if (input.COMPASSO_ISOLATED_DATABASE === "1")
      throw new Error("Isolated tests cannot run on a deployed service.");
    if (
      appUrl.protocol !== "https:" ||
      local ||
      value.BETTER_AUTH_URL !== appUrl.origin ||
      value.NEXT_PUBLIC_APP_URL !== appUrl.origin
    )
      throw new Error("Production app URLs must match and use HTTPS origins.");
    if (value.EMAIL_SANDBOX_MODE !== "live") throw new Error("Production requires live email.");
    if (
      !value.REDIS_URL ||
      !value.SENTRY_DSN ||
      value.SENTRY_DSN !== value.NEXT_PUBLIC_SENTRY_DSN ||
      !value.SENDGRID_WEBHOOK_PUBLIC_KEY
    )
      throw new Error("Production requires Redis, Sentry and signed email webhooks.");
    if (!value.VAPID_PUBLIC_KEY)
      throw new Error("Production requires the VAPID keys for parent alerts.");
  }
  return value;
}
