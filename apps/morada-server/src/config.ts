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
    /** Endereço público do WebSocket, exatamente como está cadastrado no Recreio. */
    MORADA_PUBLIC_URL: z.url().optional(),
    /** Origens de página que podem abrir o WebSocket, separadas por vírgula. */
    MORADA_ORIGENS: lista,
    MORADA_CAPACIDADE: z.coerce.number().int().positive().default(200),
    MORADA_METRICAS_TOKEN: z.string().min(24).optional(),
    /** `prova` encurta gravidez e primeiras fases; é o preset da etapa 1. */
    MORADA_REGRAS: z.enum(["padrao", "prova"]).default("padrao"),
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
    if (!env.RECREIO_HOST_SECRET) falta("RECREIO_HOST_SECRET");
    if (!env.MORADA_PUBLIC_URL) falta("MORADA_PUBLIC_URL");
    if (env.MORADA_ORIGENS.length === 0) falta("MORADA_ORIGENS");
    if (env.NODE_ENV === "production") {
      if (env.RECREIO_API_URL && !env.RECREIO_API_URL.startsWith("https://")) {
        falta("RECREIO_API_URL", "precisa ser https em produção");
      }
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
  if (lida.success) return lida.data;
  const problemas = lida.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Configuração inválida do servidor do Morada. ${problemas.join("; ")}`);
}
