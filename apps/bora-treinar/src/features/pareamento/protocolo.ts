import { z } from "zod";

/**
 * Mensagens entre a TV (player) e o celular pareado. O celular roda a câmera e
 * o contador no próprio aparelho e manda só eventos de contagem; nenhuma
 * imagem sai dele.
 */

/** TV → celular: o que está acontecendo no treino agora. */
export const estadoTvSchema = z.object({
  tipo: z.literal("estado"),
  /** exercício em execução; null no descanso ou no fim */
  exerciseId: z.string().max(40).nullable(),
  /** muda a cada passo: o celular zera o contador quando muda */
  passo: z.number().int().min(-1).max(10000),
  pausado: z.boolean(),
  fim: z.boolean(),
  titulo: z.string().max(80),
});

const issues = z.array(z.string().max(80)).max(5);

/** Celular → TV: eventos de contagem. */
export const eventoCelularSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ola") }),
  z.object({ tipo: z.literal("rep"), passo: z.number().int(), issues }),
  z.object({ tipo: z.literal("parcial"), passo: z.number().int(), issues }),
  z.object({
    tipo: z.literal("isometria"),
    passo: z.number().int(),
    segurando: z.boolean(),
    dica: z.string().max(80).nullable(),
  }),
  z.object({
    tipo: z.literal("sinal"),
    confianca: z.number().min(0).max(1),
    progresso: z.number().min(0).max(1),
  }),
]);

export type EstadoTv = z.infer<typeof estadoTvSchema>;
export type EventoCelular = z.infer<typeof eventoCelularSchema>;
export type MensagemPareamento = EstadoTv | EventoCelular;

/** Código curto digitável na TV/celular: sem letras que se confundem (0/O, 1/I/L). */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TAMANHO_CODIGO = 8;
export const codigoSchema = z
  .string()
  .length(TAMANHO_CODIGO)
  .regex(new RegExp(`^[${ALFABETO_CODIGO}]+$`));
