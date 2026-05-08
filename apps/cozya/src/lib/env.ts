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
    /**
     * OpenRouter — gateway único para todas as chamadas de IA do cozya
     * (chat, vision, web search, Whisper transcription via /audio/transcriptions
     * OpenAI-compatible). Obrigatório em produção; createEnv falha no boot
     * sem ela. Substituiu OPENAI_API_KEY/ANTHROPIC_API_KEY na migração 2026.
     */
    OPENROUTER_API_KEY: z.string().min(1),
    /** Atribuição opcional para o leaderboard do OpenRouter. */
    OPENROUTER_HTTP_REFERER: z.string().url().optional(),
    OPENROUTER_X_TITLE: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
    MASTRA_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /**
     * Quando "1", o proxy emite `Content-Security-Policy` (enforce).
     * Default "0" → emite `Content-Security-Policy-Report-Only` (não bloqueia,
     * só reporta para o Sentry). Flow recomendado: deploy com "0" por 1 semana,
     * monitorar violações, depois flipar para "1".
     */
    CSP_ENFORCE: z.enum(["0", "1"]).default("0"),
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
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_HTTP_REFERER: process.env.OPENROUTER_HTTP_REFERER,
    OPENROUTER_X_TITLE: process.env.OPENROUTER_X_TITLE,
    LOG_LEVEL: process.env.LOG_LEVEL,
    MASTRA_LOG_LEVEL: process.env.MASTRA_LOG_LEVEL,
    CSP_ENFORCE: process.env.CSP_ENFORCE,
  },
  emptyStringAsUndefined: true,
});

// Runtime guards: server-only. `instrumentation-client.ts` (Sentry init)
// importa este módulo no client, então qualquer acesso a campos `server:` no
// top-level dispara `onInvalidAccess` do @t3-oss/env-nextjs e quebra a
// hidratação do React. O gate `typeof window === "undefined"` é dead-code
// eliminável pelo bundler no client e mantém o fail-closed no server.
if (typeof window === "undefined") {
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    throw new Error("REDIS_URL is required when NODE_ENV=production");
  }

  if (env.NODE_ENV === "production" && env.E2E_RELAX_AUTH_RATE_LIMITS === "1") {
    throw new Error(
      "E2E_RELAX_AUTH_RATE_LIMITS must NOT be set in production — it disables anti-brute-force protections.",
    );
  }
}
