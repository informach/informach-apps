import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema, SessaoDeJogoIdSchema, UuidSchema } from "../dominio/ids";

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
export const ConsultaDePresencaSchema = AtestadoDeEntradaSchema.omit({ operacao: true });
export const PresencaConsultadaSchema = z.strictObject({
  presenca: ReciboDePresencaSchema.nullable(),
});
export type ConsultaDePresenca = z.infer<typeof ConsultaDePresencaSchema>;
export type PresencaConsultada = z.infer<typeof PresencaConsultadaSchema>;

export const PRESENCAS_POR_RENOVACAO_MAX = 64;
export const RenovacaoDePresencaSchema = z.strictObject({
  mundoId: MundoIdSchema,
  cerca: z.number().int().min(0).max(2147483647),
  presencaId: UuidSchema,
  sid: SessaoDeJogoIdSchema,
  perfilId: PerfilIdSchema,
});
export type RenovacaoDePresenca = z.infer<typeof RenovacaoDePresencaSchema>;
export const RenovacaoDePresencasSchema = z.strictObject({
  presencas: z
    .array(RenovacaoDePresencaSchema)
    .min(1)
    .max(PRESENCAS_POR_RENOVACAO_MAX)
    .refine((p) => new Set(p.map((i) => i.presencaId)).size === p.length, "Presença repetida"),
});
export const PresencaRenovadaSchema = z.discriminatedUnion("estado", [
  z.strictObject({ presencaId: UuidSchema, estado: z.literal("ok"), expiraEm: z.iso.datetime() }),
  z.strictObject({ presencaId: UuidSchema, estado: z.literal("perdida") }),
]);
export type PresencaRenovada = z.infer<typeof PresencaRenovadaSchema>;
export const RespostaDaRenovacaoDePresencasSchema = z.strictObject({
  presencas: z.array(PresencaRenovadaSchema).min(1).max(PRESENCAS_POR_RENOVACAO_MAX),
});
