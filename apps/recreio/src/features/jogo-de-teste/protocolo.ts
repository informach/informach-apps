import { z } from "zod";

/**
 * O que o cliente e o servidor do jogo de teste dizem um ao outro, em quadros
 * de texto com JSON. O cliente fica em `cliente.ts`; o servidor, em
 * `e2e/servidor`. O jogo é um contador por mundo com a lista de quem está
 * presente: pequeno de propósito, mas passa por tudo o que um jogo de verdade
 * passa na plataforma.
 */

/** Maior quadro aceito, dos dois lados. Um token de sessão tem bem menos que isso. */
export const QUADRO_MAX_BYTES = 8 * 1024;

/** Quanto o servidor espera o primeiro quadro (`entrar`) antes de fechar a conexão. */
export const PRAZO_PARA_ENTRAR_MS = 5_000;

// --- Do cliente para o servidor ---

export const DoClienteSchema = z.discriminatedUnion("t", [
  /** O primeiro quadro: a sessão de jogo e o mundo. O token nunca vai no endereço. */
  z.strictObject({ t: z.literal("entrar"), token: z.string().min(1), mundoId: z.uuid() }),
  /** Somar 1. O `id` é do comando: repetir o mesmo comando não soma duas vezes. */
  z.strictObject({ t: z.literal("somar"), id: z.uuid() }),
  /** A sessão foi renovada: o servidor passa a valer pelo prazo do token novo. */
  z.strictObject({ t: z.literal("renovar"), token: z.string().min(1) }),
]);
export type DoCliente = z.infer<typeof DoClienteSchema>;

// --- Do servidor para o cliente ---

export const PresenteSchema = z.strictObject({
  /** O id de membro no mundo. O servidor do jogo não repassa o id do perfil. */
  id: z.uuid(),
  apelido: z.string(),
});
export type Presente = z.infer<typeof PresenteSchema>;

export const DoServidorSchema = z.discriminatedUnion("t", [
  /** O mundo inteiro, a cada mudança: é pequeno o bastante para não precisar de diferenças. */
  z.strictObject({
    t: z.literal("estado"),
    contador: z.number().int().nonnegative(),
    presentes: z.array(PresenteSchema),
  }),
  /**
   * A conexão vai fechar, e por quê. O código é um dos códigos de erro do
   * Recreio; `motivo` acompanha `SESSAO_ENCERRADA`.
   */
  z.strictObject({ t: z.literal("fim"), codigo: z.string(), motivo: z.string().optional() }),
]);
export type DoServidor = z.infer<typeof DoServidorSchema>;

/**
 * Fins que não são da pessoa nem da sessão: a instância ainda não tem (ou
 * perdeu) a posse do mundo, ou o Recreio não respondeu. O cliente abre o mundo
 * de novo e tenta outra vez.
 */
export const FINS_PASSAGEIROS: readonly string[] = [
  "POSSE_PERDIDA",
  "POSSE_DE_OUTRA_INSTANCIA",
  "SEM_INSTANCIA",
  "INDISPONIVEL",
];

/** Um quadro recebido, conferido contra o esquema; `null` se não for do protocolo. */
export function lerQuadro<T>(esquema: z.ZodType<T>, texto: string): T | null {
  if (texto.length > QUADRO_MAX_BYTES) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  const lido = esquema.safeParse(bruto);
  return lido.success ? lido.data : null;
}
