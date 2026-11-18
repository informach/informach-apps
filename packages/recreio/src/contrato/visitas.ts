import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema, UuidSchema } from "../dominio/ids";

export const CONVITES_DE_VISITA_PENDENTES_MAX = 64;
export const RECIBOS_DE_VISITA_POR_PERFIL_MAX = 1000;
export const NovoConviteDeVisitaSchema = z.strictObject({
  mundoId: MundoIdSchema,
  perfilId: PerfilIdSchema,
  presencaId: UuidSchema,
  pedidoId: UuidSchema,
});
export type NovoConviteDeVisita = z.infer<typeof NovoConviteDeVisitaSchema>;
/** Fato técnico recuperável; não comprova presença atual, aprovação ou entrada permitida. */
export const ReciboDeConviteDeVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  mundoId: MundoIdSchema,
  jogo: z.string().min(1).max(64),
  estado: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  criadoEm: z.iso.datetime(),
  expiraEm: z.iso.datetime(),
});
export type ReciboDeConviteDeVisita = z.infer<typeof ReciboDeConviteDeVisitaSchema>;
export const AprovacaoParentalDeVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  versaoDaPolitica: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
export type AprovacaoParentalDeVisita = z.infer<typeof AprovacaoParentalDeVisitaSchema>;
export const AprovacaoDoMundoParaVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  versaoDaGestao: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
export type AprovacaoDoMundoParaVisita = z.infer<typeof AprovacaoDoMundoParaVisitaSchema>;
