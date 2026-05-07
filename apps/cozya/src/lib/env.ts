import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SENTRY_DSN: z.string().url().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (use `openssl rand -base64 32`)"),
    BETTER_AUTH_URL: z.string().url(),
    SENDGRID_API_KEY: z.string().min(1),
    SENDGRID_FROM: z.string().email(),
    SENDGRID_WEBHOOK_PUBLIC_KEY: z.string().min(1).optional(),
    EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("live"),
    EMAIL_SANDBOX_DIR: z.string().default("./tmp/integration_emails"),
    E2E_RELAX_AUTH_RATE_LIMITS: z.enum(["1"]).optional(),
    CRON_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    STRIPE_SECRET_KEY: z
      .string()
      .startsWith("sk_", "STRIPE_SECRET_KEY must start with 'sk_test_' or 'sk_live_'"),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with 'whsec_'"),
    STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
    /**
     * Selects which Price ID column to use from `Product.stripePriceId.{dev,prod}`.
     */
    STRIPE_MODE: z.enum(["dev", "prod"]).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
    MASTRA_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    SENTRY_DSN: process.env.SENTRY_DSN,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM: process.env.SENDGRID_FROM,
    SENDGRID_WEBHOOK_PUBLIC_KEY: process.env.SENDGRID_WEBHOOK_PUBLIC_KEY,
    EMAIL_SANDBOX_MODE: process.env.EMAIL_SANDBOX_MODE,
    EMAIL_SANDBOX_DIR: process.env.EMAIL_SANDBOX_DIR,
    E2E_RELAX_AUTH_RATE_LIMITS: process.env.E2E_RELAX_AUTH_RATE_LIMITS,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_MODE: process.env.STRIPE_MODE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
    MASTRA_LOG_LEVEL: process.env.MASTRA_LOG_LEVEL,
  },
  emptyStringAsUndefined: true,
});
