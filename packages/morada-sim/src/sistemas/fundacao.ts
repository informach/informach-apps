import { opcaoDeAparencia } from "../comandos/aparencia";
import { impedimentoDaFundacao, type RascunhoDaFamilia } from "../comandos/fundacao";
import { BAIRRO_DA_PROVA } from "../conteudo";
import { novoId } from "../dominio/estado";
import { relacaoId } from "../dominio/ids";
import { montarMoradorInicial } from "../dominio/morador-inicial";
import { listar } from "../dominio/tabela";
import type {
  Familia,
  Morador,
  MotivoDeRecusa,
  ReciboDeFundacao,
  Relacao,
  Sessao,
} from "../dominio/tipos";
import { chegadaDaFamilia } from "../espaco/chegada";
import { type Contexto, causaDoJogador, emitir } from "./contexto";

type Saida = { motivo: MotivoDeRecusa; detalhe?: string } | { versoes: Record<string, number> };

/** A família inicial é conteúdo do jogo; saldo, IDs e permissões nunca vêm do rascunho. */
export function fundarFamilia(
  ctx: Contexto,
  sessao: Sessao,
  comandoId: string,
  rascunho: RascunhoDaFamilia,
): Saida {
  const estado = ctx.estado;
  if (sessao.podeFundarFamilia !== true) return { motivo: "sem_permissao" };
  if (estado.fundacao || estado.familias.ordem.length > 0) return { motivo: "ja_resolvido" };
  const impedimento = impedimentoDaFundacao(rascunho, estado.regras.maxMoradoresPorFamilia);
  if (impedimento)
    return {
      motivo: impedimento === "limite_de_moradores" ? "limite_da_familia" : "requisito",
      detalhe: impedimento,
    };
  const lote = listar(estado.lotes).find((l) => l.familiaId === null && l.imovelId !== null);
  for (const morador of rascunho.moradores) {
    const catalogo = estado.catalogoDeAparencias;
    if (
      catalogo &&
      (!morador.edicao || !opcaoDeAparencia(catalogo, { ...morador, edicao: morador.edicao }))
    )
      return { motivo: "requisito", detalhe: "aparencia_indisponivel" };
    if (!catalogo && morador.edicao) return { motivo: "requisito", detalhe: "catalogo_ausente" };
  }
  const inicial = BAIRRO_DA_PROVA.familias[0];
  if (!lote || !inicial) return { motivo: "nao_existe", detalhe: "casa_inicial" };
  const chegadas = chegadaDaFamilia(
    estado,
    lote,
    ctx.navegador(lote.id),
    rascunho.moradores.length,
  );
  if (!chegadas) return { motivo: "requisito", detalhe: "chegada_sem_espaco" };

  const familia: Familia = {
    id: novoId(estado, "fam"),
    nome: rascunho.nome,
    loteId: lote.id,
    fundo: inicial.fundo,
    vidaMs: 0,
    versao: 1,
  };
  const moradores = rascunho.moradores.map((morador, i) => {
    const chegada = chegadas[i];
    if (!chegada) throw new Error("Chegada sem morador");
    return montarMoradorInicial(
      estado,
      novoId(estado, "mor"),
      { ...morador, ref: `novo_${i}` },
      familia.id,
      {
        t: "lote",
        loteId: lote.id,
        andar: 0,
        pos: [...chegada],
        frente: 180,
      },
    );
  });
  const porIndice = (indice: number): Morador => {
    const morador = moradores[indice];
    if (!morador) throw new Error("Referência de fundação não validada");
    return morador;
  };
  const relacoes: Relacao[] = [];
  const genitores = moradores.map(() => new Set<number>());
  const novaRelacao = (a: Morador, b: Morador): Relacao => ({
    id: relacaoId(a.id, b.id),
    a: a.id < b.id ? a.id : b.id,
    b: a.id < b.id ? b.id : a.id,
    versao: 1,
    eixos: { amizade: 700_000, romance: 0, confianca: 700_000 },
    casal: "nenhum",
    parentesco: null,
    marcos: [],
  });
  for (const escolha of rascunho.relacoes) {
    const a = porIndice(escolha.a);
    const b = porIndice(escolha.b);
    const relacao = novaRelacao(a, b);
    if (escolha.tipo === "genitor") {
      relacao.parentesco = { tipo: "genitor", de: a.id };
      genitores[escolha.b]?.add(escolha.a);
    } else if (escolha.tipo === "irmaos") {
      relacao.parentesco = { tipo: "irmaos" };
    } else {
      relacao.casal = escolha.tipo;
      relacao.eixos.romance = 800_000;
    }
    relacoes.push(relacao);
  }
  // Parentesco entre filhos do mesmo genitor não depende de outra escolha na interface.
  for (let a = 0; a < moradores.length; a++) {
    for (let b = a + 1; b < moradores.length; b++) {
      if (![...(genitores[a] ?? [])].some((g) => genitores[b]?.has(g))) continue;
      const id = relacaoId(porIndice(a).id, porIndice(b).id);
      if (relacoes.some((relacao) => relacao.id === id)) continue;
      const relacao = novaRelacao(porIndice(a), porIndice(b));
      relacao.parentesco = { tipo: "irmaos" };
      relacoes.push(relacao);
    }
  }
  const versoes: Record<string, number> = { [familia.id]: familia.versao };
  for (const morador of moradores) versoes[morador.id] = morador.versao;
  const recibo: ReciboDeFundacao = {
    comandoId,
    autor: sessao.perfilId,
    familiaId: familia.id,
    resultado: { ok: true, comandoId, tick: estado.relogio.tick, versoes: { ...versoes } },
  };
  emitir(
    ctx,
    `fundacao:${estado.id}`,
    familia.id,
    { tipo: "FamiliaFundada", familia, moradores, relacoes, recibo },
    causaDoJogador(comandoId, sessao.perfilId, "fundacao_da_familia"),
  );
  return { versoes };
}
