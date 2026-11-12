import { createPrivateKey, createPublicKey } from "node:crypto";
import { z } from "zod";

/** Um mapa em JSON numa variável de ambiente; ausente ou vazio vale `{}`. */
function mapaJson<Valor>(valor: z.ZodType<Valor>) {
  return z
    .string()
    .optional()
    .transform((bruto, contexto): Record<string, Valor> => {
      if (bruto === undefined || bruto.trim() === "") return {};
      let lido: unknown;
      try {
        lido = JSON.parse(bruto);
      } catch {
        contexto.addIssue({ code: "custom", message: "JSON" });
        return z.NEVER;
      }
      const mapa = z.record(z.string().min(1).max(40), valor).safeParse(lido);
      if (!mapa.success) {
        contexto.addIssue({ code: "custom", message: "forma" });
        return z.NEVER;
      }
      return mapa.data;
    });
}

const OrigensDoJogoSchema = z.strictObject({
  /** Origem do WebSocket das instâncias do jogo. */
  ws: z.string().min(1),
  /** Origem de onde o cliente do jogo baixa a arte, se não for a do portal. */
  assets: z.string().min(1).optional(),
});
export type OrigensDoJogo = z.infer<typeof OrigensDoJogoSchema>;

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
   * si é decidido no servidor, por `decidirAcesso`.
   */
  RECREIO_ACCESS_MODE: z.enum(["fechado", "aberto"]).default("fechado"),
  /**
   * Chave privada Ed25519 (PKCS8, PEM) que assina o ingresso e a sessão de
   * jogo. Pode chegar com `\n` escapado. Fora de produção, sem ela o app gera
   * um par descartável ao subir. A pública do JWKS sai desta mesma chave.
   */
  RECREIO_TOKEN_PRIVATE_KEY: z.string().min(1).optional(),
  /** O `kid` da chave atual. Obrigatório sempre que a chave é informada. */
  RECREIO_TOKEN_KEY_ID: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional(),
  /** Chaves públicas antigas (kid para SPKI em PEM) que o JWKS ainda serve na rotação. */
  RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: mapaJson(z.string().min(1)),
  /** Segredo de cada jogo na API das instâncias (id do jogo para segredo). */
  RECREIO_HOST_SECRETS: mapaJson(z.string().min(32)),
  /** Origens de cada jogo (id do jogo para `{ ws, assets? }`). */
  RECREIO_GAME_ORIGINS: mapaJson(OrigensDoJogoSchema),
  /** Segredo do agendador para `/api/jobs/*`. */
  CRON_SECRET: z.string().min(32).optional(),
});

export type Environment = z.infer<typeof schema>;

const LOCAIS = ["localhost", "127.0.0.1", "[::1]"];

function pem(valor: string): string {
  return valor.replace(/\\n/g, "\n").trim();
}

function chavePrivadaEd25519(valor: string): boolean {
  try {
    const chave = createPrivateKey({ key: pem(valor), format: "pem" });
    return chave.asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

function chavePublicaEd25519(valor: string): boolean {
  // `createPublicKey` aceitaria uma chave privada e derivaria a pública dela.
  if (!pem(valor).startsWith("-----BEGIN PUBLIC KEY-----")) return false;
  try {
    return createPublicKey({ key: pem(valor), format: "pem" }).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

/**
 * Uma origem do jogo: só esquema e host, sem caminho. Em produção, `wss:` ou
 * `https:`; fora dela, também `ws://localhost` e `http://localhost`.
 */
function origemValida(valor: string, seguro: string, local: string, producao: boolean): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return false;
  if (url.protocol === seguro) return true;
  return !producao && url.protocol === local && LOCAIS.includes(url.hostname);
}

export function validateEnvironment(input: NodeJS.ProcessEnv): Environment {
  // Report names only: Zod issues can otherwise expose rejected secret values.
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
  const local = LOCAIS.includes(appUrl.hostname);
  const producao = Boolean(
    input.RAILWAY_ENVIRONMENT_ID || (value.NODE_ENV === "production" && !local),
  );
  if (producao) {
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
    if (!value.RECREIO_TOKEN_PRIVATE_KEY)
      throw new Error("Production requires RECREIO_TOKEN_PRIVATE_KEY.");
    if (!value.CRON_SECRET) throw new Error("Production requires CRON_SECRET.");
  }
  // As mensagens abaixo citam só o nome da variável, nunca o conteúdo.
  if (value.RECREIO_TOKEN_PRIVATE_KEY) {
    if (!chavePrivadaEd25519(value.RECREIO_TOKEN_PRIVATE_KEY))
      throw new Error("RECREIO_TOKEN_PRIVATE_KEY must be an Ed25519 private key (PKCS8 PEM).");
    if (!value.RECREIO_TOKEN_KEY_ID)
      throw new Error("RECREIO_TOKEN_KEY_ID is required with RECREIO_TOKEN_PRIVATE_KEY.");
  }
  for (const [kid, publica] of Object.entries(value.RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS)) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/.test(kid) ||
      kid === value.RECREIO_TOKEN_KEY_ID ||
      !chavePublicaEd25519(publica)
    )
      throw new Error(
        "RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS must map other key ids to Ed25519 public keys (SPKI PEM).",
      );
  }
  for (const origens of Object.values(value.RECREIO_GAME_ORIGINS)) {
    if (
      !origemValida(origens.ws, "wss:", "ws:", producao) ||
      (origens.assets !== undefined && !origemValida(origens.assets, "https:", "http:", producao))
    )
      throw new Error(
        "RECREIO_GAME_ORIGINS must hold origins without a path: wss: and https: (ws://localhost and http://localhost only outside production).",
      );
  }
  return value;
}
