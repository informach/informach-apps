import {
  LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS,
  type OperacaoDeEdicao,
  type ReciboDeEdicao,
} from "../comandos/edicao";
import type { FamiliaId, LoteId, ObjetoId, PerfilId } from "../dominio/ids";
import { obter } from "../dominio/tabela";
import type { EstadoDoMundo, MotivoDeRecusa, Objeto } from "../dominio/tipos";
import { canonico, copiar } from "../nucleo/canonico";
import {
  deltaDaCompensacao,
  type PassoDaCasa,
  type PecaNoHistorico,
  pecaNoHistorico,
  proximoPassoDaCasa,
} from "./historico-da-casa";

export type OperacaoDeCompensacao = Extract<OperacaoDeEdicao, { t: "compensar" }>;
export type CompensacaoConferida =
  | {
      ok: true;
      passo: PassoDaCasa;
      id: ObjetoId;
      anterior: Objeto | null;
      depois: PecaNoHistorico | null;
      delta: number;
      espacial: boolean;
      permissoes: ReciboDeEdicao["permissoes"];
    }
  | { ok: false; motivo: MotivoDeRecusa; detalhe: string };

/** Resolve somente a própria origem. Permissões, saldo, espaço e trava são revalidados na admissão. */
export function conferirCompensacaoDaCasa(
  estado: EstadoDoMundo,
  autor: PerfilId,
  pedido: { familiaId: FamiliaId; loteId: LoteId; operacao: OperacaoDeCompensacao },
): CompensacaoConferida {
  const op = pedido.operacao;
  const passo = proximoPassoDaCasa(estado.historicoDaCasa, autor, op.sentido);
  if (
    !passo ||
    passo.chave !== op.chave ||
    passo.familiaId !== pedido.familiaId ||
    passo.loteId !== pedido.loteId
  )
    return { ok: false, motivo: "nao_existe", detalhe: "historico_indisponivel" };
  if (passo.interferida || passo.revisaoEsperada !== op.revisaoDoPasso)
    return { ok: false, motivo: "versao_antiga", detalhe: "historico_interferido" };
  const id = passo.antes?.id ?? passo.depois?.id;
  if (!id) throw new Error("Histórico sem peça");
  const anterior = obter(estado.objetos, id) ?? null;
  const esperado = op.sentido === "desfazer" ? passo.depois : passo.antes;
  if (
    canonico(pecaNoHistorico(anterior)) !== canonico(esperado) ||
    (anterior && anterior.revisao !== op.revisaoDoPasso)
  )
    return { ok: false, motivo: "versao_antiga", detalhe: "historico_interferido" };
  if (anterior && Object.keys(anterior.ocupacao).length)
    return { ok: false, motivo: "ocupado", detalhe: "historico_ocupado" };
  const espacial = passo.tipo !== "pintar";
  if (espacial && obter(estado.lotes, pedido.loteId)?.revisaoDoEspaco !== op.revisaoDoEspaco)
    return { ok: false, motivo: "versao_antiga", detalhe: "historico_espaco" };
  const delta = deltaDaCompensacao(passo, op.sentido);
  const permissoes = [...passo.permissoes];
  if (delta < 0 && !permissoes.includes("gastar")) permissoes.push("gastar");
  if (
    Math.abs(delta) > LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS &&
    !permissoes.includes("gerir_financas")
  )
    permissoes.push("gerir_financas");
  return {
    ok: true,
    passo,
    id,
    anterior: copiar(anterior),
    depois: copiar(op.sentido === "desfazer" ? passo.antes : passo.depois),
    delta,
    espacial,
    permissoes,
  };
}
