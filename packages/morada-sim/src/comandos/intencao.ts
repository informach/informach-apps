import { z } from "zod";
import type { AcaoId, FamiliaId, MoradorId, ObjetoId, PedidoId } from "../dominio/ids";
import { PERMISSOES } from "../dominio/permissoes";

/**
 * Tudo o que entra na simulação. O cliente não muda o mundo: ele pede, com uma
 * intenção, e a simulação valida e decide. Cada intenção tem um id; repetir a
 * mesma não faz de novo.
 */

const idDe = <T extends string>(prefixo: string) =>
  z.custom<T>((valor) => typeof valor === "string" && valor.startsWith(`${prefixo}_`), {
    message: `id de ${prefixo} inválido`,
  });

const moradorId = idDe<MoradorId>("mor");
const objetoId = idDe<ObjetoId>("obj");
const acaoId = idDe<AcaoId>("aca");
const pedidoId = idDe<PedidoId>("ped");
const familiaId = idDe<FamiliaId>("fam");
const mm = z.number().int().min(-1_000_000).max(1_000_000);

export const AlvoSchema = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("objeto"), objetoId }),
  z.strictObject({ t: z.literal("morador"), moradorId }),
  z.strictObject({ t: z.literal("proprio") }),
  z.strictObject({ t: z.literal("ponto"), pos: z.tuple([mm, mm]), andar: z.number().int().min(0) }),
]);

export const TIPOS_DE_PEDIDO = ["namoro", "casamento", "morar_junto", "bebe"] as const;
const velocidade = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const AcaoPedidaSchema = z.discriminatedUnion("t", [
  /** Pede o controle do morador da intenção. */
  z.strictObject({ t: z.literal("reservar") }),
  z.strictObject({ t: z.literal("liberar") }),
  z.strictObject({ t: z.literal("definir_preferido"), valor: z.boolean() }),
  z.strictObject({
    t: z.literal("ir_para"),
    pos: z.tuple([mm, mm]),
    andar: z.number().int().min(0),
  }),
  z.strictObject({
    t: z.literal("interagir"),
    interacao: z.string().min(1).max(40),
    alvo: AlvoSchema,
  }),
  /** Cuidado com um bebê: quem executa é escolhido pela simulação, se não for dito. */
  z.strictObject({
    t: z.literal("cuidar"),
    bebeId: moradorId,
    cuidado: z.string().min(1).max(40),
    executorId: moradorId.optional(),
  }),
  z.strictObject({ t: z.literal("cancelar_acao"), acaoId }),
  z.strictObject({ t: z.literal("propor"), tipo: z.enum(TIPOS_DE_PEDIDO), alvoId: moradorId }),
  z.strictObject({ t: z.literal("responder_pedido"), pedidoId, aceita: z.boolean() }),
  z.strictObject({ t: z.literal("votar_velocidade"), velocidade }),
  z.strictObject({ t: z.literal("convidar_visita"), alvoId: moradorId }),
]);
export type AcaoPedida = z.infer<typeof AcaoPedidaSchema>;

export const IntencaoSchema = z.strictObject({
  /** Gerado pelo cliente. É a chave da idempotência. */
  comandoId: z.string().min(8).max(64),
  mundoId: z.string().min(1).max(64),
  /** `null` em comando do mundo, que não é de um morador. */
  moradorId: moradorId.nullable(),
  acao: AcaoPedidaSchema,
  /** Versão do morador que o cliente viu; 0 quando tanto faz. */
  versaoEsperada: z.number().int().nonnegative(),
});
export type Intencao = z.infer<typeof IntencaoSchema>;

/**
 * As entradas que não vêm de um jogador: o servidor avisa quem entrou, quem
 * caiu e que horas são. O relógio real chega sempre como dado.
 */
export const EntradaSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("intencao"),
    sessaoId: z.string().min(1),
    intencao: IntencaoSchema,
  }),
  z.strictObject({
    t: z.literal("sessao_entrou"),
    sessaoId: z.string().min(1),
    perfilId: z.string().min(1),
  }),
  z.strictObject({
    t: z.literal("sessao_caiu"),
    sessaoId: z.string().min(1),
    agoraMs: z.number().int().nonnegative(),
  }),
  z.strictObject({ t: z.literal("sessao_voltou"), sessaoId: z.string().min(1) }),
  z.strictObject({ t: z.literal("sessao_saiu"), sessaoId: z.string().min(1) }),
  /** Libera as reservas de quem caiu e não voltou a tempo. */
  z.strictObject({ t: z.literal("expirar"), agoraMs: z.number().int().nonnegative() }),
  /** O Recreio autorizou este perfil a jogar a família. */
  z.strictObject({
    t: z.literal("conceder_acesso"),
    perfilId: z.string().min(1),
    familiaId,
    permissoes: z.array(z.enum(PERMISSOES)).min(1),
  }),
  z.strictObject({ t: z.literal("revogar_acesso"), perfilId: z.string().min(1), familiaId }),
  /** Dia real, em dias desde a época, para o teto da política de avanço limitado. */
  z.strictObject({ t: z.literal("dia_real"), dia: z.number().int().nonnegative() }),
]);
export type Entrada = z.infer<typeof EntradaSchema>;
