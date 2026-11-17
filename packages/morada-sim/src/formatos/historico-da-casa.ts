import { z } from "zod";
import { ReciboDeEdicaoSchema } from "../comandos/edicao";
import { PinturaDoMovelSchema } from "../comandos/pintura";
import type { PerfilId } from "../dominio/ids";
import {
  origemCompativel,
  PASSOS_NO_MUNDO,
  PASSOS_POR_AUTOR,
  type PassoDaCasa,
  type PecaNoHistorico,
} from "../sistemas/historico-da-casa";

const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const versao = inteiro.positive();
const entidade = <P extends string>(prefixo: P) =>
  z.custom<`${P}_${string}`>(
    (valor) =>
      typeof valor === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9_-]{1,64}$`).test(valor),
  );
const PecaNoHistoricoSchema: z.ZodType<PecaNoHistorico> = z.strictObject({
  id: entidade("obj"),
  loteId: entidade("lote"),
  catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  versao,
  pos: z.tuple([inteiro.max(1_000_000), inteiro.max(1_000_000), inteiro.max(1_000_000)]),
  andar: inteiro.max(2),
  giro: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  cor: inteiro.max(0xffffff),
  pintura: PinturaDoMovelSchema.nullable(),
});
const PassoDaCasaSchema: z.ZodType<PassoDaCasa> = z
  .strictObject({
    chave: z.string().min(1).max(64),
    autor: z.string().regex(/^[A-Za-z0-9_-]{1,44}$/),
    sequencia: versao,
    ordem: versao,
    familiaId: entidade("fam"),
    loteId: entidade("lote"),
    tipo: z.enum(["comprar", "mover", "pintar", "vender"]),
    antes: PecaNoHistoricoSchema.nullable(),
    depois: PecaNoHistoricoSchema.nullable(),
    delta: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    permissoes: ReciboDeEdicaoSchema.shape.permissoes,
    desfeita: z.boolean(),
    interferida: z.boolean(),
    revisaoEsperada: versao,
  })
  .refine(origemCompativel, { message: "Origem incompatível do histórico" });

/** O histórico é obrigatório no V3 ainda não publicado; não é reconstruído de recibos podados. */
export const HistoricoDaCasaSchema = z
  .array(PassoDaCasaSchema)
  .max(PASSOS_NO_MUNDO)
  .superRefine((passos, ctx) => {
    const chaves = new Set<string>();
    const autores = new Map<
      PerfilId,
      { quantidade: number; sequencia: number; desfeita: boolean }
    >();
    let ordem = 0;
    for (const [indice, passo] of passos.entries()) {
      const anterior = autores.get(passo.autor);
      if (
        chaves.has(passo.chave) ||
        passo.ordem <= ordem ||
        passo.revisaoEsperada < passo.ordem ||
        (anterior &&
          (anterior.quantidade >= PASSOS_POR_AUTOR ||
            passo.sequencia <= anterior.sequencia ||
            (anterior.desfeita && !passo.desfeita)))
      )
        ctx.addIssue({ code: "custom", path: [indice], message: "Cadeia inválida do histórico" });
      chaves.add(passo.chave);
      ordem = passo.ordem;
      autores.set(passo.autor, {
        quantidade: (anterior?.quantidade ?? 0) + 1,
        sequencia: passo.sequencia,
        desfeita: passo.desfeita,
      });
    }
  });
