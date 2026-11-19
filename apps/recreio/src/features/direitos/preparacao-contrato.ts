import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";
import { FinanceiroDoEncerramentoSchema } from "./encerramento-contrato";

export const MAX_MUNDOS_DOS_DIREITOS = 512;

const idsOrdenados = z
  .array(PerfilIdSchema.refine((id) => id === id.toLowerCase()))
  .max(256)
  .refine(
    (ids) => ids.every((id, indice) => indice === 0 || (ids[indice - 1] ?? "") < id),
    "Escolha cada perfil uma vez, em ordem.",
  );
export const PedidoDePreparacaoDeDireitosSchema = z
  .strictObject({
    pedidoId: z.uuid(),
    tipo: z.enum(["retirar_perfil", "encerrar_conta"]),
    perfis: idsOrdenados,
  })
  .refine((p) => p.tipo !== "retirar_perfil" || p.perfis.length === 1);
export type PedidoDePreparacaoDeDireitos = z.infer<typeof PedidoDePreparacaoDeDireitosSchema>;

const contador = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const CamposDoPlano = z.strictObject({
  tipo: z.enum(["retirar_perfil", "encerrar_conta"]),
  contaId: z.string().min(1).max(256),
  perfis: z
    .array(
      z.strictObject({
        id: PerfilIdSchema,
        tipo: z.enum(["adult", "minor"]),
        versao: contador.min(1),
        responsabilidadeId: z.uuid().nullable(),
      }),
    )
    .max(256),
  mundos: z
    .array(
      z.strictObject({
        id: z.uuid(),
        jogo: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
        revisao: contador,
        diario: contador,
        gestao: contador.min(1),
        cerca: contador,
        estado: z.enum(["active", "hibernating", "archived", "deleted"]),
        outrosParticipantes: contador,
      }),
    )
    .max(MAX_MUNDOS_DOS_DIREITOS),
});
function escopoOrdenado(plano: z.infer<typeof CamposDoPlano>) {
  return (
    (plano.tipo !== "retirar_perfil" || plano.perfis.length === 1) &&
    plano.perfis.every(
      (p, i) =>
        p.id === p.id.toLowerCase() &&
        (i === 0 || (plano.perfis[i - 1]?.id ?? "") < p.id) &&
        (p.tipo === "minor" ? p.responsabilidadeId !== null : p.responsabilidadeId === null),
    ) &&
    plano.mundos.every(
      (m, i) => m.id === m.id.toLowerCase() && (i === 0 || (plano.mundos[i - 1]?.id ?? "") < m.id),
    )
  );
}
/** V1 conserva exatamente a ordem e os campos canônicos anteriores. Encerramento
 * legado é somente prévia e nunca autoriza efeitos financeiros. */
export const PlanoDeDireitosV1Schema = z
  .strictObject({
    formato: z.literal("recreio-previa-direitos-v1"),
    ...CamposDoPlano.shape,
    identidadeGlobalPreservada: z.literal(true),
    financeiroSeparado: z.literal(true),
  })
  .refine(escopoOrdenado);

/** A versão é do plano; o registro de preparação e a intenção assinada mantêm
 * seu próprio formato v1. O SHA da intenção autentica o plano completo v2. */
export const PlanoDeEncerramentoSchema = z
  .strictObject({
    formato: z.literal("recreio-previa-encerramento-v2"),
    ...CamposDoPlano.shape,
    tipo: z.literal("encerrar_conta"),
    identidadeGlobalPreservada: z.literal(true),
    revisaoDaParticipacao: z.union([z.literal(0), z.literal(1)]),
    financeiro: FinanceiroDoEncerramentoSchema,
  })
  .refine(escopoOrdenado);
export const PlanoDeDireitosSchema = z.union([PlanoDeDireitosV1Schema, PlanoDeEncerramentoSchema]);
export type PlanoDeEncerramento = z.infer<typeof PlanoDeEncerramentoSchema>;

/** O plano privado vai para o livro e o banco. A interface recebe os efeitos e
 * contadores, sem referências do provedor ou IDs de autorizações financeiras. */
export function apresentarPlanoDeDireitos(plano: z.infer<typeof PlanoDeDireitosSchema>) {
  if (plano.formato === "recreio-previa-direitos-v1") return plano;
  return {
    formato: plano.formato,
    tipo: plano.tipo,
    contaId: plano.contaId,
    perfis: plano.perfis,
    mundos: plano.mundos,
    identidadeGlobalPreservada: plano.identidadeGlobalPreservada,
    revisaoDaParticipacao: plano.revisaoDaParticipacao,
    financeiro: {
      modo: plano.financeiro.modo,
      efeito: plano.financeiro.efeito,
      periodosPagosPreservados: plano.financeiro.periodosPagosPreservados,
      registrosFinanceirosPreservados: plano.financeiro.registrosFinanceirosPreservados,
      contratosDeOutrosAdultosPreservados: plano.financeiro.contratosDeOutrosAdultosPreservados,
      clientes: plano.financeiro.clientes.length,
      comprasNaoEnviadas: plano.financeiro.comprasNaoEnviadas.length,
      trocasNaoEnviadas: plano.financeiro.trocasNaoEnviadas.length,
    },
  };
}
export type PlanoDeDireitos = z.infer<typeof PlanoDeDireitosSchema>;
export const ReferenciaDaPreparacaoSchema = z.strictObject({
  preparacaoId: z.uuid(),
  planoSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ReferenciaDaPreparacao = z.infer<typeof ReferenciaDaPreparacaoSchema>;

export const ConsentimentoDeRetiradaSchema = ReferenciaDaPreparacaoSchema.extend({
  confirmoRetirada: z.literal(true),
});
