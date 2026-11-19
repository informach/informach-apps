import { z } from "zod";
import { ReciboDeEdicaoSchema } from "../comandos/edicao";
import { CatalogoDePinturasSchema } from "../comandos/pintura";
import type { DadosDoFato, Fato } from "../dominio/fatos";
import { PERMISSOES } from "../dominio/permissoes";
import { FASES } from "../dominio/tipos";
import { ContinuidadeEspacialSchema } from "../espaco/continuidade";
import {
  assinado,
  FamiliaDuravelSchema,
  FundacaoDuravelSchema,
  familiaId,
  GravidezDuravelSchema,
  gravidezId,
  identidade,
  inteiro,
  loteId,
  MoradorDuravelSchema,
  memoriaId,
  moradorId,
  ObjetoDuravelSchema,
  PedidoDuravelSchema,
  RelacaoDuravelSchema,
  texto,
} from "./entidades-duraveis";

/** Exaustivo contra a união do domínio: adicionar um fato exige acrescentar
 * sua forma aqui. Não aceita campos desconhecidos nem substitui o resultado
 * durável por uma intenção ou estado parcial. */
export const DadosDoFatoDuravelSchema = z.toZod<DadosDoFato>()(
  z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("PinturasAdmitidas"), catalogo: CatalogoDePinturasSchema }),
    z.strictObject({
      tipo: z.literal("EdicaoRegistrada"),
      recibo: ReciboDeEdicaoSchema,
      efeito: z
        .strictObject({
          familiaId,
          loteId,
          saldoAnterior: assinado,
          saldo: assinado,
          versaoDaFamiliaAnterior: inteiro,
          versaoDaFamilia: inteiro,
          revisaoDoEspacoAnterior: inteiro,
          revisaoDoEspaco: inteiro,
          revisaoDosObjetosAnterior: inteiro,
          revisaoDosObjetos: inteiro,
          anterior: ObjetoDuravelSchema.nullable(),
          depois: ObjetoDuravelSchema.nullable(),
          continuidade: ContinuidadeEspacialSchema,
        })
        .nullable(),
    }),
    z.strictObject({
      tipo: z.literal("FamiliaFundada"),
      familia: FamiliaDuravelSchema,
      moradores: z.array(MoradorDuravelSchema).max(1024),
      relacoes: z.array(RelacaoDuravelSchema).max(8192),
      recibo: FundacaoDuravelSchema,
    }),
    z.strictObject({
      tipo: z.literal("AcessoConcedido"),
      perfilId: texto,
      familiaId,
      permissoes: z.array(z.enum(PERMISSOES)).max(PERMISSOES.length),
    }),
    z.strictObject({ tipo: z.literal("AcessoRevogado"), perfilId: texto, familiaId }),
    z.strictObject({ tipo: z.literal("PreferidoDefinido"), moradorId, perfilId: texto.nullable() }),
    z.strictObject({
      tipo: z.literal("CasalMudou"),
      a: moradorId,
      b: moradorId,
      casal: z.enum(["nenhum", "namoro", "casamento", "ex"]),
      memoriaId: memoriaId.nullable(),
    }),
    z.strictObject({
      tipo: z.literal("FamiliaMudou"),
      moradorId,
      de: familiaId.nullable(),
      para: familiaId.nullable(),
      loteId: loteId.nullable(),
      memoriaId: memoriaId.nullable(),
    }),
    z.strictObject({
      tipo: z.literal("GravidezIniciada"),
      gravidez: GravidezDuravelSchema,
      memoriaId,
    }),
    z.strictObject({
      tipo: z.literal("NascimentoRegistrado"),
      gravidezId,
      bebe: MoradorDuravelSchema,
      relacoes: z.array(RelacaoDuravelSchema).max(8192),
      memoriaId,
    }),
    z.strictObject({
      tipo: z.literal("FaseMudou"),
      moradorId,
      de: z.enum(FASES),
      para: z.enum(FASES),
      corpo: texto,
      memoriaId,
    }),
    z.strictObject({
      tipo: z.literal("FundoMovimentado"),
      familiaId,
      delta: assinado,
      saldo: assinado,
      motivo: texto,
    }),
    z.strictObject({ tipo: z.literal("PedidoCriado"), pedido: PedidoDuravelSchema }),
    z.strictObject({
      tipo: z.literal("PedidoResolvido"),
      pedidoId: identidade("ped"),
      aceito: z.boolean(),
      motivo: texto.nullable(),
    }),
  ]),
);
export const FatoDuravelSchema = z.toZod<Fato>()(
  z.strictObject({
    id: texto.min(1),
    tick: inteiro,
    familiaId: familiaId.nullable(),
    causa: z.strictObject({ comandoId: texto.nullable(), autor: texto.min(1), motivo: texto }),
    dados: DadosDoFatoDuravelSchema,
  }),
);
export class FalhaDeFatoDuravel extends Error {
  constructor() {
    super("morada.journal.INTEGRIDADE");
  }
}
/** Erro constante: nunca propagar mensagem contendo o JSON privado. A
 * serialização antes do parse tipado detecta chaves duplicadas e texto ambíguo. */
export function lerFatoDoDiario(json: string): Fato {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
    if (JSON.stringify(bruto) !== json) throw new FalhaDeFatoDuravel();
  } catch {
    throw new FalhaDeFatoDuravel();
  }
  const fato = FatoDuravelSchema.safeParse(bruto);
  if (!fato.success) throw new FalhaDeFatoDuravel();
  return fato.data;
}
