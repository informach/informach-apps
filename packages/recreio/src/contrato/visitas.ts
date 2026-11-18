import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema, SessaoDeJogoIdSchema, UuidSchema } from "../dominio/ids";
import { ConsultaCronologicaSchema, CursorCronologicoSchema } from "./paginacao";
import { ReciboDePresencaSchema } from "./presencas";

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
function concessaoCorrespondeAoRecibo(pedido: {
  convite: { estado: string; mundoId: string };
  visita: { mundoId: string } | null;
}): boolean {
  return (
    (pedido.convite.estado === "accepted") === (pedido.visita !== null) &&
    (pedido.visita === null || pedido.visita.mundoId === pedido.convite.mundoId)
  );
}
export const ResultadoDaDecisaoDeVisitaSchema = z
  .strictObject({
    convite: ReciboDeConviteDeVisitaSchema,
    visita: ReciboDeVisitaSchema.nullable(),
  })
  .refine(concessaoCorrespondeAoRecibo, "Recibo e concessão não correspondem ao mesmo aceite");
export type ResultadoDaDecisaoDeVisita = z.infer<typeof ResultadoDaDecisaoDeVisitaSchema>;
export const ConsultaDeVisitasSchema = ConsultaCronologicaSchema;
export const CaixaDeVisitasSchema = z.strictObject({
  convites: z
    .array(
      ReciboDeConviteDeVisitaSchema.extend({
        perfilId: PerfilIdSchema,
        direcao: z.enum(["enviado", "recebido"]),
        visita: ReciboDeVisitaSchema.nullable(),
      }).refine((item) => concessaoCorrespondeAoRecibo({ convite: item, visita: item.visita })),
    )
    .max(10),
  proximo: CursorCronologicoSchema.nullable(),
});
export type CaixaDeVisitas = z.infer<typeof CaixaDeVisitasSchema>;
const PessoaNaVisitaSchema = z.strictObject({
  apelido: z.string().min(1).max(80),
  avatar: z.string().min(1).max(64),
});
export const DetalheDeConviteDeVisitaSchema = z
  .strictObject({
    direcao: z.enum(["enviado", "recebido"]),
    convite: ReciboDeConviteDeVisitaSchema.extend({
      aguardaMundo: z.boolean(),
      aguardaOrigem: z.boolean(),
      aguardaDestino: z.boolean(),
    }),
    visita: ReciboDeVisitaSchema.nullable(),
    nomeDoMundo: z.string().min(1).max(128),
    origem: PessoaNaVisitaSchema,
    destino: PessoaNaVisitaSchema,
  })
  .refine(concessaoCorrespondeAoRecibo, "Recibo e concessão não correspondem ao mesmo aceite");
export type DetalheDeConviteDeVisita = z.infer<typeof DetalheDeConviteDeVisitaSchema>;
/** Pista própria e efêmera. A emissão ainda precisa conferir toda a autoridade atual. */
export const PresencaParaConviteSchema = z.strictObject({
  jogo: z.string().min(1).max(64),
  mundoId: MundoIdSchema,
  presenca: ReciboDePresencaSchema.extend({ estado: z.literal("active") }).nullable(),
});
export type PresencaParaConvite = z.infer<typeof PresencaParaConviteSchema>;
export const MutacaoDeVisitaSchema = z.discriminatedUnion("operacao", [
  NovoConviteDeVisitaSchema.extend({ operacao: z.literal("emitir") }),
  RespostaAConviteDeVisitaSchema.extend({ operacao: z.literal("responder") }),
  z.strictObject({ operacao: z.literal("consultar"), conviteId: UuidSchema }),
  z.strictObject({ operacao: z.literal("conferir"), conviteId: UuidSchema }),
  z.strictObject({ operacao: z.literal("presenca"), mundoId: MundoIdSchema }),
]);
export interface VisitasDoPerfil {
  /** Presença própria do SID já admitido pelo host; não atesta conexão ou entrada. */
  presenca(mundoId: string): Promise<PresencaParaConvite>;
  listar(apos?: { em: string; id: string }): Promise<CaixaDeVisitas>;
  consultar(conviteId: string): Promise<ResultadoDaDecisaoDeVisita>;
  /** Nomes só sob autorização, amizade, conteúdo e anfitrião atuais. */
  conferir(conviteId: string): Promise<DetalheDeConviteDeVisita>;
  /** Conservar pedido/presença após resposta perdida; não há retry automático. */
  emitir(pedido: z.input<typeof NovoConviteDeVisitaSchema>): Promise<ReciboDeConviteDeVisita>;
  responder(
    conviteId: string,
    acao: "aceitar" | "recusar" | "revogar",
  ): Promise<ResultadoDaDecisaoDeVisita>;
}
export const EncerramentoParentalDeVisitaSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  confirmo: z.literal(true),
});

/** Nunca contém membroId, papel ou participação permanente. */
export const PERMISSAO_DE_VISITA_TTL_MS = 30_000;
export const PERMISSAO_DE_VISITA_MAX_MS = 45_000;
function prazoDeVisitaValido(pedido: { agora: string; permissaoAte: string }) {
  const duracao = Date.parse(pedido.permissaoAte) - Date.parse(pedido.agora);
  return duracao > 0 && duracao <= PERMISSAO_DE_VISITA_MAX_MS;
}
export const EntradaDeVisitanteSchema = z
  .strictObject({
    visitaId: UuidSchema,
    sessaoDeVisitaId: UuidSchema,
    /** Só a instância recebe o vínculo à conexão original do anfitrião. */
    presencaDoAnfitriaoId: UuidSchema,
    permissaoAte: z.iso.datetime(),
    agora: z.iso.datetime(),
    apelido: z.string(),
    avatar: z.string(),
    politica: z.strictObject({
      multiplayer: z.boolean(),
      textoLivre: z.boolean(),
      versao: z.int().nonnegative(),
    }),
  })
  .refine(prazoDeVisitaValido, "Prazo de visita fora da concessão curta");
export type EntradaDeVisitante = z.infer<typeof EntradaDeVisitanteSchema>;
export const PedidoDeEntradaDeVisitaSchema = z.strictObject({
  visitaId: UuidSchema,
  sessaoDeVisitaId: UuidSchema,
  sid: SessaoDeJogoIdSchema,
  perfilId: PerfilIdSchema,
  cerca: z.int().positive(),
});
export const PedidoDeAberturaDeVisitaSchema = z.strictObject({ visitaId: UuidSchema });
export const VisitaAbertaSchema = z.strictObject({
  visitaId: UuidSchema,
  /** Vínculo já preparado deste SID; permite encerrar uma admissão de resposta incerta. */
  sessaoDeVisitaId: UuidSchema,
  mundoId: MundoIdSchema,
  onde: z.literal("servidor"),
  endereco: z.url(),
  schemaVersion: z.int().positive(),
  revisao: z.int().nonnegative(),
});
export type VisitaAberta = z.infer<typeof VisitaAbertaSchema>;

/** Disponível apenas no contexto criado com finalidade de visita confirmada pelo servidor. */
export interface VisitaDoJogador {
  readonly id: string;
  /** Encontra a posse original, sem criar participação permanente ou alocar outra instância. */
  abrir(): Promise<VisitaAberta>;
}

export const VISITAS_POR_RENOVACAO_MAX = 64;
export const RenovacaoDeVisitaSchema = PedidoDeEntradaDeVisitaSchema.extend({
  mundoId: MundoIdSchema,
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
  z
    .strictObject({
      sessaoDeVisitaId: UuidSchema,
      estado: z.literal("ok"),
      permissaoAte: z.iso.datetime(),
      agora: z.iso.datetime(),
    })
    .refine(prazoDeVisitaValido, "Prazo de visita fora da concessão curta"),
  z.strictObject({ sessaoDeVisitaId: UuidSchema, estado: z.literal("perdida") }),
]);
export type VisitaRenovada = z.infer<typeof VisitaRenovadaSchema>;
export const RespostaDaRenovacaoDeVisitasSchema = z.strictObject({
  visitas: z.array(VisitaRenovadaSchema).min(1).max(VISITAS_POR_RENOVACAO_MAX),
});

export const EncerramentoDeSessaoDeVisitaSchema = PedidoDeEntradaDeVisitaSchema.extend({
  motivo: z.enum(["sair", "autoridade_perdida", "entrada_nao_concluida"]),
});
export type EncerramentoDeSessaoDeVisita = z.infer<typeof EncerramentoDeSessaoDeVisitaSchema>;
/** Só fatos de encerramento; não é ACK de salvamento. */
export const SessaoDeVisitaEncerradaSchema = z.strictObject({
  sessaoDeVisitaId: UuidSchema,
  estado: z.literal("closed"),
  sidEncerrado: z.literal(true),
  visitaEncerrada: z.boolean(),
});
export type SessaoDeVisitaEncerrada = z.infer<typeof SessaoDeVisitaEncerradaSchema>;
