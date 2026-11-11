import { z } from "zod";

export const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SENDGRID_API_KEY: z.string().min(1),
  SENDGRID_FROM: z.string().min(3),
  EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("live"),
  EMAIL_SANDBOX_DIR: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  /**
   * `fechado`: só entra em jogo quem a equipe convidou (alfa). `aberto`: o
   * portal deixa de avisar que o acesso é por convite. O direito de jogar em
   * si é decidido no servidor, por `decidirAcesso`, nos lotes seguintes.
   */
  RECREIO_ACCESS_MODE: z.enum(["fechado", "aberto"]).default("fechado"),
});

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(input: NodeJS.ProcessEnv): Environment {
  // Report names only: Zod issues can otherwise expose rejected secret values.
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
  if (input.RAILWAY_ENVIRONMENT_ID || (value.NODE_ENV === "production" && !local)) {
    if (input.RECREIO_ISOLATED_TEST === "1")
      throw new Error("Isolated tests cannot run on a deployed service.");
    if (
      appUrl.protocol !== "https:" ||
      local ||
      value.BETTER_AUTH_URL !== appUrl.origin ||
      value.NEXT_PUBLIC_APP_URL !== appUrl.origin
    )
      throw new Error("Production app URLs must match and use HTTPS origins.");
    if (value.EMAIL_SANDBOX_MODE !== "live") throw new Error("Production requires live email.");
    if (!value.REDIS_URL || !value.SENTRY_DSN || value.SENTRY_DSN !== value.NEXT_PUBLIC_SENTRY_DSN)
      throw new Error("Production requires Redis and Sentry.");
  }
  return value;
}
