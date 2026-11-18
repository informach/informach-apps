import { z } from "zod";
import { PerfilIdSchema, UuidSchema } from "../dominio/ids";
import {
  type AcompanhamentoDeDenuncias,
  type DenunciaDeContato,
  DenunciaDeContatoSchema,
  type DenunciaRecebida,
  type RecursoRecebido,
  type RevisaoDeDenuncia,
} from "./denuncias";
import type { ParticipantesDoMundo } from "./participantes";

export const CodigoDeAmigoSchema = z
  .string()
  .max(48)
  .transform((v) => v.trim().toUpperCase().replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{12}$/));
export const NovoPedidoDeAmizadeSchema = z.strictObject({
  codigo: CodigoDeAmigoSchema,
  pedidoId: UuidSchema,
});
export type NovoPedidoDeAmizade = z.infer<typeof NovoPedidoDeAmizadeSchema>;
export const ProtecaoDeContatoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
  /** Necessário para reduzir uma proteção; recusa uma tela que ficou antiga. */
  anterior: z.strictObject({ bloqueado: z.boolean(), silenciado: z.boolean() }).optional(),
});
export type ProtecaoDeContato = z.infer<typeof ProtecaoDeContatoSchema>;
export const PreferenciaDePresencaSchema = z.enum(["online", "friends", "invisible"]);
export const MutacaoSocialSchema = z.discriminatedUnion("operacao", [
  z.strictObject({ operacao: z.literal("presenca"), presenca: PreferenciaDePresencaSchema }),
  z.strictObject({ operacao: z.literal("codigo") }),
  NovoPedidoDeAmizadeSchema.extend({ operacao: z.literal("pedir") }),
  z.strictObject({ operacao: z.literal("aceitar"), pedidoId: UuidSchema }),
  z.strictObject({
    operacao: z.literal("encerrar"),
    pedidoId: UuidSchema,
    acao: z.enum(["recusar", "revogar"]),
  }),
  ProtecaoDeContatoSchema.extend({ operacao: z.literal("proteger") }),
  z.strictObject({ operacao: z.literal("remover"), perfilId: PerfilIdSchema }),
  DenunciaDeContatoSchema.extend({ operacao: z.literal("denunciar") }),
]);
export const CodigoDeAmigoEmitidoSchema = z.strictObject({
  codigoId: UuidSchema,
  codigo: CodigoDeAmigoSchema,
  expiraEm: z.iso.datetime(),
});
export const PedidoDeAmizadeCriadoSchema = z.strictObject({
  pedidoId: UuidSchema,
  estado: z.enum(["pending", "accepted", "rejected", "revoked", "expired"]),
  repetido: z.boolean(),
});
export const AceiteDeAmizadeSchema = z.strictObject({
  pedidoId: UuidSchema,
  estado: z.enum(["pending", "accepted"]),
});
export const PedidoDeAmizadeEncerradoSchema = z.strictObject({
  pedidoId: UuidSchema,
  estado: z.enum(["rejected", "revoked"]),
});
export const ProtecaoSocialSalvaSchema = z.strictObject({
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
});
export const AmizadeRemovidaSchema = z.strictObject({ removida: z.literal(true) });
export const PresencaSocialSalvaSchema = z.strictObject({ presenca: PreferenciaDePresencaSchema });
export const ConsultaSocialSchema = z.strictObject({ apos: PerfilIdSchema.optional() });
export const ContatoSocialSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  apelido: z.string().nullable(),
  avatar: z.string().nullable(),
  amizade: z.boolean(),
  podeRemover: z.boolean(),
  online: z.boolean(),
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
  pedido: z
    .strictObject({
      id: UuidSchema,
      direcao: z.enum(["enviado", "recebido"]),
      aceito: z.boolean(),
      expiraEm: z.iso.datetime(),
      aguardaAprovacao: z.boolean(),
    })
    .nullable(),
});
export type ContatoSocial = z.infer<typeof ContatoSocialSchema>;
export const ListaSocialSchema = z.strictObject({
  podeCriarContatos: z.boolean(),
  presencaEditavel: z.boolean(),
  contatos: z.array(ContatoSocialSchema).max(10),
  proximo: PerfilIdSchema.nullable(),
  presenca: PreferenciaDePresencaSchema,
});
export type ListaSocial = z.infer<typeof ListaSocialSchema>;
export interface SocialDoPerfil {
  /** Presente apenas quando cliente e servidor negociaram os novos recibos. */
  convitesDeMundo?: import("./convites-dirigidos").ConvitesDirigidosDoPerfil;
  /** Apenas participantes atuais de um mundo do próprio perfil e do jogo da sessão. */
  participantes(mundoId: string, apos?: string): Promise<ParticipantesDoMundo>;
  listar(apos?: string): Promise<ListaSocial>;
  presenca(modo: ListaSocial["presenca"]): Promise<z.infer<typeof PresencaSocialSalvaSchema>>;
  /** Código mostrado uma vez; nova emissão revoga o anterior. */
  codigo(): Promise<z.infer<typeof CodigoDeAmigoEmitidoSchema>>;
  /** Preserve pedidoId para recuperar a mesma tentativa após resposta perdida. */
  pedir(codigo: string, pedidoId: string): Promise<z.infer<typeof PedidoDeAmizadeCriadoSchema>>;
  aceitar(pedidoId: string): Promise<z.infer<typeof AceiteDeAmizadeSchema>>;
  encerrar(
    pedidoId: string,
    acao: "recusar" | "revogar",
  ): Promise<z.infer<typeof PedidoDeAmizadeEncerradoSchema>>;
  proteger(entrada: ProtecaoDeContato): Promise<z.infer<typeof ProtecaoSocialSalvaSchema>>;
  remover(perfilId: string): Promise<void>;
  /** Preserve denunciaId para recuperar o protocolo após perda da resposta. */
  denunciar(entrada: DenunciaDeContato): Promise<DenunciaRecebida>;
  /** Somente protocolos do perfil atual; nunca a identidade da outra ponta. */
  denuncias(protocolo?: string): Promise<AcompanhamentoDeDenuncias>;
  reverDenuncia(entrada: RevisaoDeDenuncia): Promise<RecursoRecebido>;
}
