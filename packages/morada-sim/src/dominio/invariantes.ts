import { relacaoId } from "./ids";
import { listar, obter, type Tabela } from "./tabela";
import type { EstadoDoMundo, Presenca } from "./tipos";

/**
 * As regras de integridade do mundo. Valem em qualquer instante, para uma
 * pessoa ou para doze. Os testes conferem a lista inteira depois de cada
 * passo; o servidor confere ao restaurar um mundo.
 *
 * Devolve os problemas encontrados; vazia quando está tudo certo.
 */
export function verificarInvariantes(estado: EstadoDoMundo, presenca?: Presenca): string[] {
  const problemas: string[] = [];
  const erro = (texto: string) => problemas.push(texto);

  // Toda tabela guarda a ordem e os dados em acordo.
  const tabelas: [string, Tabela<string, { id: string }>][] = [
    ["bairros", estado.bairros],
    ["lotes", estado.lotes],
    ["imoveis", estado.imoveis],
    ["objetos", estado.objetos],
    ["familias", estado.familias],
    ["moradores", estado.moradores],
    ["relacoes", estado.relacoes],
    ["acoes", estado.acoes],
    ["gravidezes", estado.gravidezes],
    ["pedidos", estado.pedidos],
    ["quadro", estado.quadro],
  ];
  for (const [nome, tabela] of tabelas) {
    const chaves = Object.keys(tabela.porId);
    if (chaves.length !== tabela.ordem.length || new Set(tabela.ordem).size !== chaves.length) {
      erro(`${nome}: ordem e dados não batem`);
    }
    for (const id of tabela.ordem) {
      if (tabela.porId[id]?.id !== id) erro(`${nome}/${id}: id não confere`);
    }
  }

  const max = estado.regras.maxMoradoresPorFamilia;
  const porFamilia = new Map<string, number>();

  for (const morador of listar(estado.moradores)) {
    // Um morador pertence a no máximo uma família, e ela existe.
    if (morador.familiaId !== null) {
      if (!obter(estado.familias, morador.familiaId)) erro(`${morador.id}: família inexistente`);
      porFamilia.set(morador.familiaId, (porFamilia.get(morador.familiaId) ?? 0) + 1);
    }
    if (morador.carteira < 0) erro(`${morador.id}: carteira negativa`);
    for (const [id, nivel] of Object.entries(morador.necessidades)) {
      if (!Number.isInteger(nivel) || nivel < 0 || nivel > 1_000_000) {
        erro(`${morador.id}: necessidade ${id} fora da faixa`);
      }
    }

    // Toda ação da fila e a ação em curso existem e são do próprio morador.
    const acoes = morador.acaoAtual ? [morador.acaoAtual, ...morador.fila] : morador.fila;
    if (new Set(acoes).size !== acoes.length) erro(`${morador.id}: ação repetida na fila`);
    for (const id of acoes) {
      const acao = obter(estado.acoes, id);
      if (!acao) erro(`${morador.id}: ação ${id} inexistente`);
      else if (acao.moradorId !== morador.id) erro(`${morador.id}: ação ${id} é de outro`);
    }

    // O lugar onde o morador está existe.
    const local = morador.local;
    if (local.t === "lote" && !obter(estado.lotes, local.loteId)) {
      erro(`${morador.id}: lote inexistente`);
    }
    if (local.t === "objeto") {
      const objeto = obter(estado.objetos, local.objetoId);
      if (!objeto) erro(`${morador.id}: objeto inexistente`);
      else if (objeto.ocupacao[local.ponto] !== morador.id) {
        erro(`${morador.id}: está em ${local.objetoId}/${local.ponto} sem ocupar o ponto`);
      }
    }
    if (local.t === "colo") {
      const quemCarrega = obter(estado.moradores, local.de);
      if (!quemCarrega) erro(`${morador.id}: no colo de ninguém`);
      else if (quemCarrega.local.t === "colo") erro(`${morador.id}: no colo de quem está no colo`);
      if (morador.fase !== "colo") erro(`${morador.id}: no colo sem ser bebê de colo`);
    }
    if (local.t !== "lote" && morador.movimento !== null) {
      erro(`${morador.id}: andando sem estar no chão`);
    }

    for (const id of morador.relacoes) {
      const relacao = obter(estado.relacoes, id);
      if (!relacao) erro(`${morador.id}: relação ${id} inexistente`);
      else if (relacao.a !== morador.id && relacao.b !== morador.id) {
        erro(`${morador.id}: relação ${id} é de outros`);
      }
    }
  }

  // Limite de moradores por família.
  for (const [familiaId, total] of porFamilia) {
    if (total > max) erro(`${familiaId}: ${total} moradores, o limite é ${max}`);
  }

  // Ninguém carrega dois bebês.
  const carregadores = new Map<string, number>();
  for (const morador of listar(estado.moradores)) {
    if (morador.local.t === "colo") {
      carregadores.set(morador.local.de, (carregadores.get(morador.local.de) ?? 0) + 1);
    }
  }
  for (const [id, total] of carregadores) {
    if (total > 1) erro(`${id}: carrega ${total} bebês`);
  }

  for (const familia of listar(estado.familias)) {
    // O fundo nunca fica negativo.
    if (familia.fundo < 0) erro(`${familia.id}: fundo negativo`);
    if (familia.loteId && !obter(estado.lotes, familia.loteId)) {
      erro(`${familia.id}: lote inexistente`);
    }
  }

  // Um ponto de uso tem um ocupante só, e o ocupante existe.
  for (const objeto of listar(estado.objetos)) {
    if (!obter(estado.lotes, objeto.loteId)) erro(`${objeto.id}: lote inexistente`);
    for (const [ponto, moradorId] of Object.entries(objeto.ocupacao)) {
      if (!obter(estado.moradores, moradorId)) erro(`${objeto.id}/${ponto}: ocupante inexistente`);
    }
  }

  for (const acao of listar(estado.acoes)) {
    const morador = obter(estado.moradores, acao.moradorId);
    if (!morador) {
      erro(`${acao.id}: de morador inexistente`);
      continue;
    }
    if (morador.acaoAtual !== acao.id && !morador.fila.includes(acao.id)) {
      erro(`${acao.id}: solta, fora da fila de ${morador.id}`);
    }
    if (acao.reserva) {
      const objeto = obter(estado.objetos, acao.reserva.objetoId);
      if (objeto?.ocupacao[acao.reserva.ponto] !== acao.moradorId) {
        erro(`${acao.id}: reserva de ponto que não é dela`);
      }
    }
    if (acao.par) {
      const par = obter(estado.acoes, acao.par);
      if (!par || par.par !== acao.id) erro(`${acao.id}: par desfeito`);
    }
  }

  // Relações: um par, uma relação, conhecida pelos dois.
  for (const relacao of listar(estado.relacoes)) {
    if (relacao.a >= relacao.b || relacao.id !== relacaoId(relacao.a, relacao.b)) {
      erro(`${relacao.id}: par fora de ordem`);
    }
    for (const id of [relacao.a, relacao.b]) {
      const morador = obter(estado.moradores, id);
      if (!morador) erro(`${relacao.id}: morador ${id} inexistente`);
      else if (!morador.relacoes.includes(relacao.id)) erro(`${relacao.id}: ${id} não a conhece`);
    }
    for (const eixo of Object.values(relacao.eixos)) {
      if (!Number.isInteger(eixo) || eixo < 0 || eixo > 1_000_000) {
        erro(`${relacao.id}: eixo fora da faixa`);
      }
    }
  }

  // Cada gravidez concluída tem exatamente um morador; cada bebê, uma gravidez.
  const nascidos = new Map<string, number>();
  for (const morador of listar(estado.moradores)) {
    const gravidezId = morador.origem.gravidezId;
    if (gravidezId) nascidos.set(gravidezId, (nascidos.get(gravidezId) ?? 0) + 1);
  }
  for (const gravidez of listar(estado.gravidezes)) {
    const total = nascidos.get(gravidez.id) ?? 0;
    if (gravidez.estado === "concluida" && total !== 1) {
      erro(`${gravidez.id}: concluída com ${total} bebês`);
    }
    if (gravidez.estado === "em_curso" && total !== 0) {
      erro(`${gravidez.id}: em curso e já com bebê`);
    }
    if (!obter(estado.moradores, gravidez.gestanteId)) erro(`${gravidez.id}: sem gestante`);
  }

  // Acessos: uma entrada por perfil e família, de família que existe.
  const acessos = new Set<string>();
  for (const acesso of estado.acessos) {
    const chave = `${acesso.perfilId}|${acesso.familiaId}`;
    if (acessos.has(chave)) erro(`acesso repetido: ${chave}`);
    acessos.add(chave);
    if (!obter(estado.familias, acesso.familiaId)) erro(`acesso a família inexistente: ${chave}`);
  }

  if (presenca) {
    // No máximo um jogador dirige cada morador, e uma sessão dirige um só.
    const moradores = new Set<string>();
    const sessoes = new Set<string>();
    for (const reserva of presenca.reservas) {
      if (moradores.has(reserva.moradorId)) erro(`${reserva.moradorId}: dois condutores`);
      moradores.add(reserva.moradorId);
      if (sessoes.has(reserva.sessaoId)) erro(`${reserva.sessaoId}: dirige mais de um`);
      sessoes.add(reserva.sessaoId);
      const sessao = presenca.sessoes.find((s) => s.sessaoId === reserva.sessaoId);
      if (!sessao) erro(`${reserva.moradorId}: reserva de sessão que não existe`);
      else if (sessao.perfilId !== reserva.perfilId)
        erro(`${reserva.moradorId}: reserva de outro perfil`);
      if (!obter(estado.moradores, reserva.moradorId)) erro(`reserva de morador inexistente`);
    }
    const perfis = new Set<string>();
    for (const sessao of presenca.sessoes) {
      if (perfis.has(sessao.perfilId)) erro(`${sessao.perfilId}: duas sessões`);
      perfis.add(sessao.perfilId);
    }
  }

  return problemas;
}
