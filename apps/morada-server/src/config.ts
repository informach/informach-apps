import { z } from "zod";

/**
 * Configuração do servidor do Morada. Os erros dizem só o nome da variável,
 * nunca o valor.
 */

const lista = z
  .string()
  .default("")
  .transform((texto) =>
    texto
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** Esquema e host de um endereço que é só origem (sem caminho, consulta ou credencial), ou `null`. */
function origemDe(valor: string, esquemas: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (!esquemas.includes(url.protocol)) return null;
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  return `${url.protocol}//${url.host}`;
}

const Esquema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(0).max(65535).default(3010),
    /**
     * `recreio`: fala com o Recreio de verdade. `falsa`: plataforma em memória,
     * só para desenvolver o jogo sem subir o portal.
     */
    MORADA_PLATAFORMA: z.enum(["recreio", "falsa"]).default("recreio"),
    /** Origem do Recreio, para a API das instâncias e as chaves públicas. */
    RECREIO_API_URL: z.url().optional(),
    /** Segredo desta instância na API das instâncias. */
    RECREIO_HOST_SECRET: z.string().min(32).optional(),
    /** Quem emite as sessões de jogo. Por padrão, a origem do Recreio. */
    RECREIO_EMISSOR: z.url().optional(),
    SENTRY_DSN: z.url().optional(),
    /**
     * Endereço público do WebSocket, igual a `RECREIO_GAME_ORIGINS.morada.ws` no
     * Recreio: só a origem (`wss://host` ou `ws://host:porta`), sem caminho. É o
     * que a instância registra e o endereço que o Recreio entrega ao navegador.
     */
    MORADA_PUBLIC_URL: z.url().optional(),
    /**
     * Origens de página que podem abrir o WebSocket, separadas por vírgula: a
     * origem pública do portal do Recreio, como o navegador a manda.
     */
    MORADA_ORIGENS: lista,
    MORADA_CAPACIDADE: z.coerce.number().int().positive().default(200),
    MORADA_METRICAS_TOKEN: z.string().min(24).optional(),
    /** `prova` encurta gravidez e primeiras fases; é o preset da etapa 1. */
    MORADA_REGRAS: z.enum(["padrao", "prova"]).default("padrao"),
    /**
     * Pasta com os pacotes de arte (`manifest.json` e os GLB que o empacotador
     * `@informach/morada-arte` gravou). Sem ela a rota `/arte/` não existe e o
     * cliente desenha os moradores procedurais.
     */
    MORADA_ARTE_DIR: z.preprocess(
      (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
      z.string().trim().min(1).optional(),
    ),
    RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  })
  .superRefine((env, contexto) => {
    const falta = (nome: string, mensagem = "é obrigatória") =>
      contexto.addIssue({ code: "custom", path: [nome], message: mensagem });

    if (env.MORADA_PLATAFORMA === "falsa") {
      // A plataforma em memória aceita qualquer um: nunca fora do desenvolvimento.
      if (env.NODE_ENV === "production")
        falta("MORADA_PLATAFORMA", "não pode ser falsa em produção");
      return;
    }
    if (!env.RECREIO_API_URL) falta("RECREIO_API_URL");
    else if (origemDe(env.RECREIO_API_URL, ["http:", "https:"]) === null)
      falta("RECREIO_API_URL", "precisa ser uma origem HTTP sem credenciais");
    if (env.RECREIO_EMISSOR && origemDe(env.RECREIO_EMISSOR, ["http:", "https:"]) === null)
      falta("RECREIO_EMISSOR", "precisa ser uma origem HTTP sem credenciais");
    if (!env.RECREIO_HOST_SECRET) falta("RECREIO_HOST_SECRET");
    if (!env.MORADA_PUBLIC_URL) falta("MORADA_PUBLIC_URL");
    else if (origemDe(env.MORADA_PUBLIC_URL, ["ws:", "wss:"]) === null) {
      falta(
        "MORADA_PUBLIC_URL",
        "precisa ser só a origem do WebSocket (ws:// ou wss://, sem caminho)",
      );
    }
    if (env.MORADA_ORIGENS.length === 0) falta("MORADA_ORIGENS");
    else if (
      env.MORADA_ORIGENS.some((origem) => origemDe(origem, ["http:", "https:"]) !== origem)
    ) {
      falta(
        "MORADA_ORIGENS",
        "cada item precisa ser só uma origem (https://host), sem barra no fim",
      );
    }
    if (env.NODE_ENV === "production") {
      if (
        env.RECREIO_API_URL &&
        origemDe(env.RECREIO_API_URL, ["http:", "https:"]) !== null &&
        !env.RECREIO_API_URL.startsWith("https://")
      ) {
        const api = new URL(env.RECREIO_API_URL);
        const interna =
          api.protocol === "http:" && /^[a-z0-9-]+\.railway\.internal$/.test(api.hostname);
        if (!interna)
          falta("RECREIO_API_URL", "precisa ser https ou uma origem privada do Railway");
        if (!env.RECREIO_EMISSOR) falta("RECREIO_EMISSOR", "é obrigatório com a API privada");
      }
      if (env.RECREIO_EMISSOR && !env.RECREIO_EMISSOR.startsWith("https://"))
        falta("RECREIO_EMISSOR", "precisa ser https em produção");
      if (env.MORADA_PUBLIC_URL && !env.MORADA_PUBLIC_URL.startsWith("wss://")) {
        falta("MORADA_PUBLIC_URL", "precisa ser wss em produção");
      }
      if (env.MORADA_ORIGENS.some((origem) => !origem.startsWith("https://"))) {
        falta("MORADA_ORIGENS", "só origens https em produção");
      }
    }
  });

export type Configuracao = z.infer<typeof Esquema>;

export function lerConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const lida = Esquema.safeParse(env);
  if (lida.success) {
    // `ws://host:porta/` e `ws://host:porta` são o mesmo endereço: fica a origem.
    const publica = lida.data.MORADA_PUBLIC_URL;
    const origem = publica ? origemDe(publica, ["ws:", "wss:"]) : null;
    return origem ? { ...lida.data, MORADA_PUBLIC_URL: origem } : lida.data;
  }
  const problemas = lida.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Configuração inválida do servidor do Morada. ${problemas.join("; ")}`);
}
