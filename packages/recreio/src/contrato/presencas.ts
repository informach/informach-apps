import { z } from "zod";
import { PerfilIdSchema, SessaoDeJogoIdSchema, UuidSchema } from "../dominio/ids";

export const PRESENCA_DO_ANFITRIAO_TTL_MS = 30_000;
export const JANELA_DA_PRESENCA_MS = 24 * 60 * 60_000;
export const RETENCAO_DA_PRESENCA_MS = 30 * 24 * 60 * 60_000;
export const AtestadoDeEntradaSchema = z.strictObject({
  operacao: z.literal("entrar"),
  cerca: z.number().int().min(0).max(2147483647),
  sid: SessaoDeJogoIdSchema,
  perfilId: PerfilIdSchema,
  chaveDeEntrada: UuidSchema,
});
export const AtestadoDeSaidaSchema = z.strictObject({
  operacao: z.literal("sair"),
  cerca: z.number().int().min(0).max(2147483647),
  presencaId: UuidSchema,
});
export const AtestadoDePresencaSchema = z.discriminatedUnion("operacao", [
  AtestadoDeEntradaSchema,
  AtestadoDeSaidaSchema,
]);
export type AtestadoDePresenca = z.infer<typeof AtestadoDePresencaSchema>;
export type AtestadoDeEntrada = z.infer<typeof AtestadoDeEntradaSchema>;
export type AtestadoDeSaida = z.infer<typeof AtestadoDeSaidaSchema>;
/** Recibo técnico; o prazo da posse e a autoridade atual continuam obrigatórios para visitas. */
export const ReciboDePresencaSchema = z.strictObject({
  presencaId: UuidSchema,
  estado: z.enum(["active", "closed"]),
  expiraEm: z.iso.datetime(),
  janelaAte: z.iso.datetime(),
});
export type ReciboDePresenca = z.infer<typeof ReciboDePresencaSchema>;
