import { z } from "zod";

const sentryDsn = z
  .union([
    z.url({ protocol: /^https$/ }).refine((value) => {
      if (!URL.canParse(value)) return false;
      const dsn = new URL(value);
      return Boolean(dsn.username) && !dsn.password && /\/\d+$/.test(dsn.pathname);
    }, "Sentry requires an HTTPS DSN with public key and project ID"),
    z.literal(""),
  ])
  .default("");

/** Lista separada por vírgula, sem espaços extras e sem itens vazios. */
const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3003"),
    BETTER_AUTH_SECRET: z.string().min(32),
    DATABASE_URL: z.string().min(1),
    /** Usuário de banco só de leitura. Sem ele, a conexão de consultas abre em modo só leitura. */
    READONLY_DATABASE_URL: z.string().default(""),
    /** Redis dos apps, para listar e encerrar as sessões guardadas fora do Postgres. */
    REDIS_URL: z.string().default(""),
    SENDGRID_API_KEY: z.string().default(""),
    SENDGRID_FROM: z.string().default("Bastidores Informach <nao-responda@informach.com.br>"),
    EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("sandbox"),
    EMAIL_SANDBOX_DIR: z.string().default("./tmp/emails"),
    CRON_SECRET: z.string().min(32),
    /** Endereços dos serviços conferidos pelo painel, em JSON `{ "cozya": "https://..." }`. */
    ADMIN_SERVICE_URLS: z.string().default(""),
    /** Monta os links do Stripe para o modo certo (test ou live). */
    STRIPE_MODE: z.enum(["dev", "prod"]).default("dev"),
    /** Organização do Sentry para os links de cada app (fase 3). */
    SENTRY_ORG_SLUG: z.string().default(""),
    /** Token de leitura do Sentry (escopo event:read), opcional, para contar erros abertos. */
    SENTRY_READ_TOKEN: z.string().default(""),
    /**
     * Quem recebe os avisos de queda de serviço, além das contas owner. O resumo
     * da semana, que traz receita, vai só para as contas owner.
     */
    ADMIN_ALERT_EMAILS: csv,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SENTRY_DSN: sentryDsn,
  })
  .superRefine((env, ctx) => {
    const origin = URL.canParse(env.NEXT_PUBLIC_APP_URL) ? new URL(env.NEXT_PUBLIC_APP_URL) : null;
    if (origin && origin.origin !== env.NEXT_PUBLIC_APP_URL)
      ctx.addIssue({
        code: "custom",
        message: "Bastidores URL must be a canonical origin",
        path: ["NEXT_PUBLIC_APP_URL"],
      });
    if (env.NODE_ENV !== "production") return;
    if (origin?.protocol !== "https:")
      ctx.addIssue({
        code: "custom",
        message: "Production Bastidores URL requires HTTPS",
        path: ["NEXT_PUBLIC_APP_URL"],
      });
    if (env.EMAIL_SANDBOX_MODE !== "live")
      ctx.addIssue({
        code: "custom",
        message: "Production email must be live",
        path: ["EMAIL_SANDBOX_MODE"],
      });
    if (!env.SENDGRID_API_KEY)
      ctx.addIssue({
        code: "custom",
        message: "Live email requires a provider key",
        path: ["SENDGRID_API_KEY"],
      });
    if (!env.REDIS_URL)
      ctx.addIssue({
        code: "custom",
        message: "Production needs the apps' Redis to revoke their sessions",
        path: ["REDIS_URL"],
      });
  });

export type AdminEnv = z.infer<typeof envSchema>;

let cached: AdminEnv | undefined;
export function getEnv(): AdminEnv {
  cached ??= envSchema.parse(process.env);
  return cached;
}
