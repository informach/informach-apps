import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const defaultCspEnforce = process.env.NODE_ENV === "production" ? "1" : "0";

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
    /**
     * Quando "1", relaxa rate limits dos endpoints OTP/signup do Better Auth
     * para Playwright/E2E. Bloqueado em produção pelo guard pós-parse abaixo.
     */
    E2E_RELAX_AUTH_RATE_LIMITS: z.enum(["1"]).optional(),
    CRON_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    STRIPE_SECRET_KEY: z
      .string()
      .regex(
        /^(sk|rk)_(test|live)_/,
        "STRIPE_SECRET_KEY must start with 'sk_test_'/'sk_live_' (full access) or 'rk_test_'/'rk_live_' (restricted, recommended for production — see packages/billing/PRODUCTION.md §6.1)",
      ),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with 'whsec_'"),
    STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
    /**
     * Selects which Price ID column to use from `Product.stripePriceId.{dev,prod}`.
     * Defaults to "prod" when NODE_ENV=production, else "dev". Can be overridden
     * to test prod prices in staging or vice-versa.
     */
    STRIPE_MODE: z.enum(["dev", "prod"]).optional(),
    /**
     * OpenRouter — gateway único de IA do app. **Opcional**: features de IA
     * (matérias por voz/imagem) só funcionam quando setada; caso contrário
     * o route guard `withAiRouteGuards` devolve 503 `AI_DISABLED`. Permite
     * subir dev/staging sem chave da OpenRouter enquanto o resto do app é
     * 100% funcional (auth, billing, atividades, calendário etc).
     */
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    AGENDA_TRIAL_DAILY_BUDGET: z.coerce.number().int().min(1).max(10000).default(100),
    /**
     * Domínio que recebe recado por e-mail (`recados+<token>@<domínio>`).
     *
     * Opcional: sem ele a feature simplesmente não existe na interface, em vez
     * de existir e falhar. Depende de MX apontado para o SendGrid e de um
     * Inbound Parse configurado — ver o guia do app, §8.
     */
    INBOUND_EMAIL_DOMAIN: z.string().min(3).optional(),
    /** `usuario:senha` do Basic Auth que o Inbound Parse envia na URL. */
    INBOUND_EMAIL_BASIC_AUTH: z.string().min(8).optional(),
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** Atribuição opcional para o leaderboard do OpenRouter (header HTTP-Referer). */
    OPENROUTER_HTTP_REFERER: z.string().url().optional(),
    /** Atribuição opcional (header X-OpenRouter-Title). */
    OPENROUTER_X_TITLE: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
    MASTRA_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /**
     * Quando "1", o proxy emite `Content-Security-Policy` (enforce). Default:
     * enforce em produção, report-only fora dela. Para um rollout observado,
     * configure explicitamente `CSP_ENFORCE=0` no ambiente de staging/produção.
     */
    CSP_ENFORCE: z.enum(["0", "1"]).default(defaultCspEnforce),
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
    AGENDA_TRIAL_DAILY_BUDGET: process.env.AGENDA_TRIAL_DAILY_BUDGET,
    INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN,
    INBOUND_EMAIL_BASIC_AUTH: process.env.INBOUND_EMAIL_BASIC_AUTH,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
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

  if (env.NODE_ENV === "production") {
    const authUrl = new URL(env.BETTER_AUTH_URL);
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);

    if (authUrl.protocol !== "https:" || appUrl.protocol !== "https:") {
      throw new Error(
        "BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must use HTTPS when NODE_ENV=production",
      );
    }

    if (authUrl.origin !== appUrl.origin) {
      throw new Error(
        "BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must share the same origin in production",
      );
    }
  }

  if (env.NODE_ENV === "production" && env.E2E_RELAX_AUTH_RATE_LIMITS === "1") {
    throw new Error(
      "E2E_RELAX_AUTH_RATE_LIMITS must NOT be set in production — it disables anti-brute-force protections.",
    );
  }

  // Warn (não throw) se OPENROUTER_API_KEY não estiver setada em produção:
  // features de IA são opt-in (route guard devolve 503 AI_DISABLED), então
  // o app sobe sem ela. Mas em produção esperamos a chave — registrar
  // ruidosamente para evitar IA desligada por config faltando.
  if (env.NODE_ENV === "production" && !env.OPENROUTER_API_KEY) {
    // biome-ignore lint/suspicious/noConsole: boot-time warn; logger depende de env.ts (ciclo)
    console.warn(
      "[env] OPENROUTER_API_KEY not set in production — AI features will return 503 AI_DISABLED",
    );
  }
}
