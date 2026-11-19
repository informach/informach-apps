import { z } from "zod";
import { EdicaoDaAparenciaSchema } from "../comandos/aparencia";
import { ReferenciaDaTravaSchema } from "../comandos/obra";
import { PinturaDoMovelSchema } from "../comandos/pintura";
import type { RelacaoId } from "../dominio/ids";
import {
  FASES,
  type Familia,
  type Gravidez,
  type Morador,
  type Objeto,
  type Pedido,
  type ReciboDeFundacao,
  type Relacao,
} from "../dominio/tipos";

export const inteiro = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const assinado = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const texto = z.string().max(512);
export const identidade = <P extends string>(prefixo: P) =>
  z.custom<`${P}_${string}`>(
    (v) => typeof v === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9_-]{1,64}$`).test(v),
  );
export const familiaId = identidade("fam"),
  moradorId = identidade("mor"),
  loteId = identidade("lote"),
  objetoId = identidade("obj"),
  gravidezId = identidade("gra"),
  memoriaId = identidade("mem");
const relacaoId = z.custom<RelacaoId>(
  (v) => typeof v === "string" && /^rel:[A-Za-z0-9_:-]{1,256}$/.test(v),
);
const ponto = z.tuple([assinado, assinado]);
const local = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("lote"), loteId, andar: assinado, pos: ponto, frente: z.number() }),
  z.strictObject({ t: z.literal("objeto"), loteId, objetoId, ponto: texto }),
  z.strictObject({ t: z.literal("colo"), de: moradorId }),
  z.strictObject({ t: z.literal("fora"), motivo: z.enum(["avulso", "visita_encerrada"]) }),
]);
const movimento = z.strictObject({
  rota: z.array(ponto).max(8192),
  inicioTick: inteiro,
  mmPorTick: inteiro,
  v: inteiro,
});
export const FamiliaDuravelSchema = z.toZod<Familia>()(
  z.strictObject({
    id: familiaId,
    nome: texto,
    loteId: loteId.nullable(),
    fundo: assinado,
    vidaMs: inteiro,
    versao: inteiro.positive(),
  }),
);
export const MoradorDuravelSchema = z.toZod<Morador>()(
  z.strictObject({
    id: moradorId,
    mundoId: texto,
    familiaId: familiaId.nullable(),
    versao: inteiro.positive(),
    nome: texto,
    fase: z.enum(FASES),
    idadeNaFaseMs: inteiro,
    origem: z.strictObject({ gravidezId: gravidezId.optional() }),
    aparencia: z.strictObject({
      edicao: EdicaoDaAparenciaSchema.optional(),
      linha: z.enum(["f", "m"]),
      corpo: texto,
      pele: inteiro.max(0xffffff),
      cabelo: texto,
      roupa: texto,
      semente: inteiro.max(0xffffffff),
    }),
    local,
    movimento: movimento.nullable(),
    necessidades: z.record(texto, inteiro),
    sensacoes: z.array(z.strictObject({ id: texto, ateTick: inteiro })).max(1024),
    tracos: z.array(texto).max(1024),
    habilidades: z.record(texto, z.number()),
    relacoes: z.array(relacaoId).max(8192),
    fila: z.array(identidade("aca")).max(8192),
    acaoAtual: identidade("aca").nullable(),
    carteira: assinado,
    preferidoDe: texto.optional(),
  }),
);
export const RelacaoDuravelSchema = z.toZod<Relacao>()(
  z.strictObject({
    id: relacaoId,
    a: moradorId,
    b: moradorId,
    versao: inteiro.positive(),
    eixos: z.strictObject({ amizade: assinado, romance: assinado, confianca: assinado }),
    casal: z.enum(["nenhum", "namoro", "casamento", "ex"]),
    parentesco: z.union([
      z.null(),
      z.strictObject({ tipo: z.literal("genitor"), de: moradorId }),
      z.strictObject({ tipo: z.literal("irmaos") }),
    ]),
    marcos: z.array(memoriaId).max(8192),
  }),
);
export const GravidezDuravelSchema = z.toZod<Gravidez>()(
  z.strictObject({
    id: gravidezId,
    gestanteId: moradorId,
    outroGenitorId: moradorId.nullable(),
    familiaId,
    inicioVidaMs: inteiro,
    previstaVidaMs: inteiro,
    sementeDoBebe: inteiro.max(0xffffffff),
    bebeId: moradorId,
    estado: z.enum(["em_curso", "concluida"]),
  }),
);
export const PedidoDuravelSchema = z.toZod<Pedido>()(
  z.strictObject({
    id: identidade("ped"),
    tipo: z.enum(["namoro", "casamento", "morar_junto", "bebe"]),
    de: moradorId,
    para: moradorId,
    autor: texto.nullable(),
    criadoTick: inteiro,
    estado: z.enum(["aberto", "aceito", "recusado"]),
    motivo: texto.nullable(),
  }),
);
export const ObjetoDuravelSchema = z.toZod<Objeto>()(
  z.strictObject({
    id: objetoId,
    loteId,
    catalogo: texto,
    versao: inteiro.positive(),
    revisao: inteiro.positive(),
    pos: z.tuple([assinado, assinado, assinado]),
    andar: assinado,
    giro: assinado,
    cor: inteiro.max(0xffffff),
    pintura: PinturaDoMovelSchema.nullable(),
    ocupacao: z.record(texto, moradorId),
  }),
);
const obra = z.strictObject({
  referencia: ReferenciaDaTravaSchema,
  alvo: z.strictObject({
    familiaId,
    loteId,
    peca: z.strictObject({ id: objetoId, revisao: inteiro }).nullable(),
    regioes: z
      .array(
        z.strictObject({
          andar: assinado,
          retangulo: z.tuple([assinado, assinado, assinado, assinado]).readonly(),
        }),
      )
      .max(8192)
      .readonly(),
  }),
  prazoMs: inteiro,
});
export const FundacaoDuravelSchema = z.toZod<ReciboDeFundacao>()(
  z.strictObject({
    comandoId: texto,
    autor: texto,
    familiaId,
    resultado: z.strictObject({
      ok: z.literal(true),
      comandoId: texto,
      tick: inteiro,
      versoes: z.record(texto, inteiro),
      repetido: z.literal(true).optional(),
      edicao: z.strictObject({ proximaSequencia: inteiro.nullable() }).optional(),
      obra: obra.optional(),
    }),
  }),
);
