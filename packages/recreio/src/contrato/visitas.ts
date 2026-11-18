import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema, SessaoDeJogoIdSchema, UuidSchema } from "../dominio/ids";

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
export const RespostaAConviteDeVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  acao: z.enum(["aceitar", "recusar", "revogar"]),
});
/** Recibo da concessão, sem token ou garantia de admissão atual. */
export const ReciboDeVisitaSchema = z.strictObject({
  visitaId: UuidSchema,
  mundoId: MundoIdSchema,
  estado: z.enum(["active", "revoked", "expired"]),
  expiraEm: z.iso.datetime(),
});
export type ReciboDeVisita = z.infer<typeof ReciboDeVisitaSchema>;
export const ResultadoDaDecisaoDeVisitaSchema = z.strictObject({
  convite: ReciboDeConviteDeVisitaSchema,
  visita: ReciboDeVisitaSchema.nullable(),
});
export type ResultadoDaDecisaoDeVisita = z.infer<typeof ResultadoDaDecisaoDeVisitaSchema>;
export const EncerramentoParentalDeVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  confirmo: z.literal(true),
});

/** Nunca contém membroId, papel ou participação permanente. */
export const EntradaDeVisitanteSchema = z.strictObject({
  visitaId: UuidSchema,
  sessaoDeVisitaId: UuidSchema,
  permissaoAte: z.iso.datetime(),
  apelido: z.string(),
  avatar: z.string(),
  politica: z.strictObject({
    multiplayer: z.boolean(),
    textoLivre: z.boolean(),
    versao: z.int().nonnegative(),
  }),
});
export type EntradaDeVisitante = z.infer<typeof EntradaDeVisitanteSchema>;
export const PedidoDeEntradaDeVisitaSchema = z.strictObject({
  visitaId: UuidSchema,
  sid: SessaoDeJogoIdSchema,
  perfilId: PerfilIdSchema,
  cerca: z.int().positive(),
});
export const PedidoDeAberturaDeVisitaSchema = z.strictObject({ visitaId: UuidSchema });
export const VisitaAbertaSchema = z.strictObject({
  visitaId: UuidSchema,
  mundoId: MundoIdSchema,
  onde: z.literal("servidor"),
  endereco: z.url(),
  schemaVersion: z.int().positive(),
  revisao: z.int().nonnegative(),
});
export type VisitaAberta = z.infer<typeof VisitaAbertaSchema>;

export const VISITAS_POR_RENOVACAO_MAX = 64;
export const RenovacaoDeVisitaSchema = PedidoDeEntradaDeVisitaSchema.extend({
  mundoId: MundoIdSchema,
  sessaoDeVisitaId: UuidSchema,
});
export type RenovacaoDeVisita = z.infer<typeof RenovacaoDeVisitaSchema>;
export const RenovacaoDeVisitasSchema = z.strictObject({
  visitas: z
    .array(RenovacaoDeVisitaSchema)
    .min(1)
    .max(VISITAS_POR_RENOVACAO_MAX)
    .refine(
      (v) =>
        new Set(v.map((p) => p.sid)).size === v.length &&
        new Set(v.map((p) => p.sessaoDeVisitaId)).size === v.length,
      "Sessão de visita repetida",
    ),
});
export const VisitaRenovadaSchema = z.discriminatedUnion("estado", [
  z.strictObject({
    sessaoDeVisitaId: UuidSchema,
    estado: z.literal("ok"),
    permissaoAte: z.iso.datetime(),
  }),
  z.strictObject({ sessaoDeVisitaId: UuidSchema, estado: z.literal("perdida") }),
]);
export type VisitaRenovada = z.infer<typeof VisitaRenovadaSchema>;
export const RespostaDaRenovacaoDeVisitasSchema = z.strictObject({
  visitas: z.array(VisitaRenovadaSchema).min(1).max(VISITAS_POR_RENOVACAO_MAX),
});
