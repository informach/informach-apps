import { comportamento, doCatalogo } from "../conteudo";
import type { DefInteracao, Teste } from "../conteudo/esquema";
import { relacaoExistente, saoParentes } from "../dominio/estado";
import { obter } from "../dominio/tabela";
import type { Alvo, EstadoDoMundo, Morador, MotivoDeRecusa, Tick } from "../dominio/tipos";
import { bebeNoColoDe, objetosDoLote, ondeEsta, pontosLivres } from "../espaco/posicoes";

/**
 * As regras duras: o que uma interação exige para poder acontecer. São funções
 * puras do estado, usadas pela simulação e pelo cliente (para montar o menu
 * com o motivo de cada opção desligada). O servidor confere sempre de novo.
 */

function passa(
  estado: EstadoDoMundo,
  teste: Teste,
  ator: Morador,
  alvo: Morador | null,
  tick: Tick,
): boolean {
  switch (teste.t) {
    case "ator_carrega_bebe":
      return (bebeNoColoDe(estado, ator.id) !== null) === teste.valor;
    case "objeto_no_lote": {
      const onde = ondeEsta(estado, ator, tick);
      if (!onde) return false;
      return objetosDoLote(estado, onde.loteId).some(
        (objeto) => doCatalogo(objeto.catalogo)?.comportamento === teste.comportamento,
      );
    }
    case "alvo_na_fase":
      return alvo !== null && teste.em.includes(alvo.fase);
    case "alvo_no_colo":
      return alvo !== null && (alvo.local.t === "colo") === teste.valor;
    case "sem_parentesco":
      return alvo !== null && !saoParentes(estado, ator.id, alvo.id);
    case "casal": {
      if (!alvo) return false;
      const casal = relacaoExistente(estado, ator.id, alvo.id)?.casal ?? "nenhum";
      return teste.em.includes(casal);
    }
    case "vinculo": {
      if (!alvo) return false;
      const eixos = relacaoExistente(estado, ator.id, alvo.id)?.eixos;
      return (eixos?.[teste.eixo] ?? 0) >= teste.min;
    }
  }
}

/** Por que a interação não pode acontecer agora, ou `null` se pode. */
export function recusaDaInteracao(
  estado: EstadoDoMundo,
  def: DefInteracao,
  ator: Morador,
  alvo: Alvo,
  tick: Tick,
): MotivoDeRecusa | null {
  if (!def.quem.includes(ator.fase)) return "fase_nao_permite";
  if (alvo.t !== def.alvo) return "comando_invalido";
  const onde = ondeEsta(estado, ator, tick);
  if (!onde) return "inalcancavel";

  let moradorAlvo: Morador | null = null;
  if (alvo.t === "morador") {
    moradorAlvo = obter(estado.moradores, alvo.moradorId) ?? null;
    if (!moradorAlvo || moradorAlvo.id === ator.id) return "nao_existe";
    if (ondeEsta(estado, moradorAlvo, tick)?.loteId !== onde.loteId) return "inalcancavel";
    // Um bebê no colo de outra pessoa só é atendido por quem o carrega.
    if (moradorAlvo.local.t === "colo" && moradorAlvo.local.de !== ator.id) return "ocupado";
  }
  if (alvo.t === "objeto") {
    const objeto = obter(estado.objetos, alvo.objetoId);
    if (!objeto) return "nao_existe";
    if (objeto.loteId !== onde.loteId) return "inalcancavel";
    const oferecidas = comportamento(doCatalogo(objeto.catalogo)?.comportamento ?? "")?.interacoes;
    if (!oferecidas?.includes(def.id)) return "comando_invalido";
  }
  if (alvo.t === "ponto" && !Number.isInteger(alvo.pos[0] + alvo.pos[1])) return "comando_invalido";

  for (const teste of def.requer) {
    if (!passa(estado, teste, ator, moradorAlvo, tick)) return "requisito";
  }
  return null;
}

/** Além de poder acontecer, há lugar: o objeto tem um ponto livre do tipo pedido. */
export function temPontoLivre(estado: EstadoDoMundo, def: DefInteracao, alvo: Alvo): boolean {
  if (alvo.t !== "objeto" || !def.tipoDePonto) return true;
  const objeto = obter(estado.objetos, alvo.objetoId);
  return objeto !== undefined && pontosLivres(objeto, def.tipoDePonto).length > 0;
}
