import { interacao, MM_POR_TICK } from "../conteudo";
import type { DefInteracao, Efeito } from "../conteudo/esquema";
import { novoId, relacaoEntre } from "../dominio/estado";
import type { AcaoId, PerfilId, TarefaId } from "../dominio/ids";
import { exigir, inserir, obter, remover } from "../dominio/tabela";
import type { Acao, Alvo, Morador, MotivoDeRecusa, Objeto, PontoMm, Tick } from "../dominio/tipos";
import {
  duracaoDoMovimento,
  ondeEsta,
  PONTO_DENTRO,
  type PontoNoLote,
  pontosLivres,
  posicaoNoMovimento,
  vagaDoPonto,
} from "../espaco/posicoes";
import { direcaoPara, distancia, limitar, proporcao, UM } from "../nucleo/fixo";
import { apresentar, type Contexto, tocar } from "./contexto";
import { darSensacao, MS_POR_MINUTO, somarNecessidade, ticksDeMinutos } from "./efeitos";
import { aplicarEspecial } from "./especiais";
import { recusaDaInteracao } from "./regras";

/**
 * O ciclo de uma ação: pedir, validar, reservar o ponto de uso, ir até lá,
 * ajustar a postura, executar, aplicar efeitos, concluir ou cancelar, liberar
 * a reserva. A simulação registra o que acontece; a animação só mostra.
 */

/** Quanto alguém espera o outro ficar livre antes de desistir. */
const ESPERA_MAXIMA_TICKS = 300;
export type NovaAcao = {
  interacao: string;
  alvo: Alvo;
  origem: Acao["origem"];
  autor?: PerfilId | null;
  comandoId?: string | null;
  tarefaId?: TarefaId | null;
};

export function enfileirar(ctx: Contexto, morador: Morador, nova: NovaAcao): Acao {
  const id = novoId(ctx.estado, "aca");
  const acao: Acao = {
    id,
    moradorId: morador.id,
    interacao: nova.interacao,
    alvo: nova.alvo,
    origem: nova.origem,
    autor: nova.autor ?? null,
    comandoId: nova.comandoId ?? null,
    estado: "na_fila",
    reserva: null,
    par: null,
    inicioTick: null,
    fimTick: null,
    tarefaId: nova.tarefaId ?? null,
  };
  inserir(ctx.estado.acoes, id, acao);
  morador.fila.push(id);
  tocar(ctx, "acoes", id);
  tocar(ctx, "moradores", morador.id);
  return acao;
}

/** Número de cada rota nova, único no mundo; o cliente usa para saber que precisa corrigir. */
function proximoMovimento(ctx: Contexto): number {
  const proximo = (ctx.estado.contadores.movimento ?? 0) + 1;
  ctx.estado.contadores.movimento = proximo;
  return proximo;
}

/** Fixa a posição de quem estava andando no ponto onde está agora. */
export function pararMovimento(ctx: Contexto, morador: Morador): void {
  if (!morador.movimento) return;
  if (morador.local.t === "lote") {
    morador.local.pos = posicaoNoMovimento(morador.movimento, ctx.estado.relogio.tick);
  }
  morador.movimento = null;
  tocar(ctx, "moradores", morador.id);
}

/** Tira do objeto quem estava sentado ou deitado nele e põe em pé ao lado. */
export function levantar(ctx: Contexto, morador: Morador): void {
  const local = morador.local;
  if (local.t !== "objeto") return;
  const objeto = obter(ctx.estado.objetos, local.objetoId);
  if (objeto && objeto.ocupacao[local.ponto] === morador.id) {
    delete objeto.ocupacao[local.ponto];
    tocar(ctx, "objetos", objeto.id);
  }
  const lote = exigir(ctx.estado.lotes, local.loteId);
  const navegador = ctx.navegador(local.loteId);
  // Sai por onde se chega ao ponto; quem estava dentro do berço sai ao lado dele.
  const acesso = objeto ? navegador.acesso(objeto, local.ponto) : null;
  const vaga = objeto ? vagaDoPonto(objeto, local.ponto) : null;
  const pos = acesso?.pos ?? (vaga ? navegador.livreMaisPerto(vaga.pos) : null) ?? lote.entrada;
  morador.local = {
    t: "lote",
    loteId: local.loteId,
    andar: objeto?.andar ?? 0,
    pos: [pos[0], pos[1]],
    frente: acesso?.frente ?? 0,
  };
  tocar(ctx, "moradores", morador.id);
}

/** O primeiro ponto livre do tipo que é alcançável, com o lugar de onde se chega. */
function escolherPonto(
  ctx: Contexto,
  objeto: Objeto,
  tipo: string | undefined,
): { ponto: string; acesso: PontoNoLote } | null {
  if (!tipo) return null;
  const navegador = ctx.navegador(objeto.loteId);
  for (const ponto of pontosLivres(objeto, tipo)) {
    const acesso = navegador.acesso(objeto, ponto);
    if (acesso) return { ponto, acesso };
  }
  return null;
}

function liberarReserva(ctx: Contexto, acao: Acao): void {
  if (!acao.reserva) return;
  const objeto = obter(ctx.estado.objetos, acao.reserva.objetoId);
  if (objeto && objeto.ocupacao[acao.reserva.ponto] === acao.moradorId) {
    delete objeto.ocupacao[acao.reserva.ponto];
    tocar(ctx, "objetos", objeto.id);
  }
  acao.reserva = null;
}

function soltarTarefa(ctx: Contexto, acao: Acao, concluida: boolean): void {
  if (!acao.tarefaId) return;
  const tarefa = obter(ctx.estado.quadro, acao.tarefaId);
  if (!tarefa) return;
  if (concluida) remover(ctx.estado.quadro, tarefa.id);
  else tarefa.responsavelId = null;
  tocar(ctx, "quadro", tarefa.id);
}

/** Tira a ação do mundo, sem efeitos. Usada ao concluir e ao cancelar. */
function retirar(ctx: Contexto, acao: Acao, concluida: boolean): void {
  const morador = obter(ctx.estado.moradores, acao.moradorId);
  liberarReserva(ctx, acao);
  soltarTarefa(ctx, acao, concluida);
  if (morador) {
    if (morador.acaoAtual === acao.id) {
      morador.acaoAtual = null;
      pararMovimento(ctx, morador);
      // Quem estava deitado ou sentado para a ação volta a ficar em pé.
      if (morador.local.t === "objeto" && morador.local.ponto !== PONTO_DENTRO) {
        levantar(ctx, morador);
      }
    }
    const naFila = morador.fila.indexOf(acao.id);
    if (naFila >= 0) morador.fila.splice(naFila, 1);
    tocar(ctx, "moradores", morador.id);
  }
  remover(ctx.estado.acoes, acao.id);
  tocar(ctx, "acoes", acao.id);

  // Quem estava dando atenção a esta ação fica livre.
  const par = acao.par ? obter(ctx.estado.acoes, acao.par) : undefined;
  if (par) {
    par.par = null;
    retirar(ctx, par, concluida);
  }
}

export function cancelarAcao(ctx: Contexto, acaoId: AcaoId, motivo?: MotivoDeRecusa): void {
  const acao = obter(ctx.estado.acoes, acaoId);
  if (!acao) return;
  const morador = obter(ctx.estado.moradores, acao.moradorId);
  if (motivo && acao.origem === "jogador" && morador) {
    apresentar(ctx, {
      t: "recusou",
      loteId: ondeEsta(ctx.estado, morador, ctx.estado.relogio.tick)?.loteId ?? null,
      moradorId: morador.id,
      motivo,
    });
  }
  retirar(ctx, acao, false);
}

/** Cancela tudo o que o morador faz e tem na fila. */
export function limparAcoes(ctx: Contexto, morador: Morador): void {
  for (const id of [...morador.fila]) cancelarAcao(ctx, id);
  if (morador.acaoAtual) cancelarAcao(ctx, morador.acaoAtual);
}

/** A ação em curso pode ceder o lugar a outra. */
export function podeSerInterrompido(ctx: Contexto, morador: Morador): boolean {
  if (!morador.acaoAtual) return true;
  const acao = obter(ctx.estado.acoes, morador.acaoAtual);
  if (!acao) return true;
  if (acao.origem === "jogador" || acao.origem === "resposta") return false;
  return interacao(acao.interacao)?.interruptivel ?? true;
}

/**
 * Pede a atenção de outro morador para uma interação a dois. Se ele está
 * livre, ou fazendo algo que pode ser interrompido, para e passa a esperar.
 */
function convocar(ctx: Contexto, ator: Morador, alvo: Morador, acao: Acao): boolean {
  if (!podeSerInterrompido(ctx, alvo)) return false;
  if (alvo.acaoAtual) cancelarAcao(ctx, alvo.acaoAtual);
  pararMovimento(ctx, alvo);
  if (alvo.local.t === "objeto" && alvo.local.ponto !== PONTO_DENTRO) levantar(ctx, alvo);

  const id = novoId(ctx.estado, "aca");
  const resposta: Acao = {
    id,
    moradorId: alvo.id,
    interacao: "receber",
    alvo: { t: "morador", moradorId: ator.id },
    origem: "resposta",
    autor: null,
    comandoId: null,
    estado: "executando",
    reserva: null,
    par: acao.id,
    inicioTick: ctx.estado.relogio.tick,
    fimTick: null,
    tarefaId: null,
  };
  inserir(ctx.estado.acoes, id, resposta);
  alvo.acaoAtual = id;
  acao.par = id;
  tocar(ctx, "acoes", id);
  tocar(ctx, "moradores", alvo.id);
  return true;
}

/** Encurta a rota para parar a uma distância do fim. */
function encurtar(rota: PontoMm[], folga: number): PontoMm[] {
  let sobra = folga;
  const saida = rota.map((p): PontoMm => [p[0], p[1]]);
  while (saida.length > 1 && sobra > 0) {
    const fim = saida[saida.length - 1] as PontoMm;
    const antes = saida[saida.length - 2] as PontoMm;
    const trecho = distancia(antes, fim);
    if (trecho <= sobra) {
      saida.pop();
      sobra -= trecho;
      continue;
    }
    saida[saida.length - 1] = [
      fim[0] + Math.trunc(((antes[0] - fim[0]) * sobra) / trecho),
      fim[1] + Math.trunc(((antes[1] - fim[1]) * sobra) / trecho),
    ];
    sobra = 0;
  }
  return saida;
}

function comecarExecucao(ctx: Contexto, morador: Morador, acao: Acao, def: DefInteracao): void {
  const tick = ctx.estado.relogio.tick;
  acao.estado = "executando";
  acao.inicioTick = tick;
  acao.fimTick = "minutos" in def.duracao ? tick + ticksDeMinutos(ctx, def.duracao.minutos) : null;
  tocar(ctx, "acoes", acao.id);

  if (acao.reserva) {
    const objeto = obter(ctx.estado.objetos, acao.reserva.objetoId);
    const ponto = objeto ? ctx.navegador(objeto.loteId).acesso(objeto, acao.reserva.ponto) : null;
    if (objeto && ponto && morador.local.t === "lote") {
      morador.local =
        ponto.postura === "em_pe"
          ? { ...morador.local, pos: [ponto.pos[0], ponto.pos[1]], frente: ponto.frente }
          : { t: "objeto", loteId: objeto.loteId, objetoId: objeto.id, ponto: acao.reserva.ponto };
      tocar(ctx, "moradores", morador.id);
    }
  }

  if (acao.alvo.t === "morador") {
    const alvo = obter(ctx.estado.moradores, acao.alvo.moradorId);
    const ondeAtor = ondeEsta(ctx.estado, morador, tick);
    const ondeAlvo = alvo ? ondeEsta(ctx.estado, alvo, tick) : null;
    if (alvo && ondeAtor && ondeAlvo) {
      if (morador.local.t === "lote") {
        morador.local.frente = direcaoPara(ondeAtor.pos, ondeAlvo.pos);
        tocar(ctx, "moradores", morador.id);
      }
      if (alvo.local.t === "lote") {
        alvo.local.frente = direcaoPara(ondeAlvo.pos, ondeAtor.pos);
        tocar(ctx, "moradores", alvo.id);
      }
    }
  }
}

function iniciar(ctx: Contexto, morador: Morador, acao: Acao): void {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const def = interacao(acao.interacao);
  if (!def) {
    cancelarAcao(ctx, acao.id, "comando_invalido");
    return;
  }
  const recusa = recusaDaInteracao(estado, def, morador, acao.alvo, tick);
  if (recusa) {
    cancelarAcao(ctx, acao.id, recusa);
    return;
  }
  const onde = ondeEsta(estado, morador, tick);
  if (!onde) {
    cancelarAcao(ctx, acao.id, "inalcancavel");
    return;
  }

  let destino: PontoMm | null = null;
  let folga = 0;
  const alvo = acao.alvo;

  if (alvo.t === "ponto") destino = [alvo.pos[0], alvo.pos[1]];

  if (alvo.t === "objeto") {
    const objeto = exigir(estado.objetos, alvo.objetoId);
    const escolha = escolherPonto(ctx, objeto, def.tipoDePonto);
    if (!escolha) {
      cancelarAcao(ctx, acao.id, "ocupado");
      return;
    }
    objeto.ocupacao[escolha.ponto] = morador.id;
    acao.reserva = { objetoId: objeto.id, ponto: escolha.ponto };
    tocar(ctx, "objetos", objeto.id);
    destino = escolha.acesso.pos;
  }

  if (alvo.t === "morador") {
    const outro = exigir(estado.moradores, alvo.moradorId);
    if (outro.local.t !== "colo") {
      if (!acao.par && !convocar(ctx, morador, outro, acao)) {
        // O outro está ocupado: espera um pouco e tenta de novo.
        if (acao.estado !== "esperando") {
          acao.estado = "esperando";
          acao.inicioTick = tick;
          tocar(ctx, "acoes", acao.id);
        }
        return;
      }
      if (outro.local.t === "objeto") {
        // Bebê no berço: quem cuida fica no ponto de cuidado do berço.
        const berco = exigir(estado.objetos, outro.local.objetoId);
        const escolha = escolherPonto(ctx, berco, "berco");
        if (!escolha) {
          cancelarAcao(ctx, acao.id, "ocupado");
          return;
        }
        berco.ocupacao[escolha.ponto] = morador.id;
        acao.reserva = { objetoId: berco.id, ponto: escolha.ponto };
        tocar(ctx, "objetos", berco.id);
        destino = escolha.acesso.pos;
      } else {
        const ondeOutro = ondeEsta(estado, outro, tick);
        if (!ondeOutro) {
          cancelarAcao(ctx, acao.id, "inalcancavel");
          return;
        }
        destino = ondeOutro.pos;
        folga = def.distancia ?? 800;
      }
    }
  }

  if (!destino) {
    // Sem deslocamento: ação consigo mesmo ou com o bebê que já está no colo.
    pararMovimento(ctx, morador);
    comecarExecucao(ctx, morador, acao, def);
    return;
  }

  // Quem estava sentado ou deitado em outro lugar se levanta para ir.
  if (morador.local.t === "objeto") levantar(ctx, morador);
  pararMovimento(ctx, morador);
  const partida = ondeEsta(estado, morador, tick)?.pos ?? onde.pos;
  const rota = ctx.navegador(onde.loteId).rota(partida, destino);
  if (!rota) {
    cancelarAcao(ctx, acao.id, "inalcancavel");
    return;
  }
  const caminho = folga > 0 ? encurtar(rota, folga) : rota;

  acao.estado = "indo";
  acao.inicioTick = tick;
  tocar(ctx, "acoes", acao.id);
  if (caminho.length < 2 || MM_POR_TICK[morador.fase] <= 0) {
    chegar(ctx, morador, acao, def, caminho[caminho.length - 1] ?? partida);
    return;
  }
  morador.movimento = {
    rota: caminho,
    inicioTick: tick,
    mmPorTick: MM_POR_TICK[morador.fase],
    v: proximoMovimento(ctx),
  };
  tocar(ctx, "moradores", morador.id);
}

function chegar(
  ctx: Contexto,
  morador: Morador,
  acao: Acao,
  def: DefInteracao,
  onde: PontoMm,
): void {
  morador.movimento = null;
  if (morador.local.t === "lote") morador.local.pos = [onde[0], onde[1]];
  tocar(ctx, "moradores", morador.id);
  comecarExecucao(ctx, morador, acao, def);
}

function aplicarEfeito(
  ctx: Contexto,
  efeito: Efeito,
  ator: Morador,
  alvo: Morador | null,
  momento: "tick" | "fim",
): void {
  const quem = (lado: "ator" | "alvo") => (lado === "ator" ? ator : alvo);
  switch (efeito.t) {
    case "necessidade": {
      if (momento !== "tick") return;
      const morador = quem(efeito.quem);
      if (!morador) return;
      const porTick = proporcao(
        efeito.porMinuto,
        ctx.estado.relogio.msDeJogoPorTick,
        MS_POR_MINUTO,
      );
      somarNecessidade(morador, efeito.id, porTick);
      return;
    }
    case "necessidade_ao_concluir": {
      if (momento !== "fim") return;
      const morador = quem(efeito.quem);
      if (morador) somarNecessidade(morador, efeito.id, efeito.valor);
      return;
    }
    case "vinculo": {
      if (momento !== "fim" || !alvo) return;
      const relacao = relacaoEntre(ctx.estado, ator.id, alvo.id);
      relacao.eixos[efeito.eixo] = limitar(relacao.eixos[efeito.eixo] + efeito.valor, 0, UM);
      tocar(ctx, "relacoes", relacao.id);
      tocar(ctx, "moradores", ator.id);
      tocar(ctx, "moradores", alvo.id);
      return;
    }
    case "habilidade": {
      if (momento !== "fim") return;
      ator.habilidades[efeito.id] = (ator.habilidades[efeito.id] ?? 0) + efeito.pontos;
      tocar(ctx, "moradores", ator.id);
      return;
    }
    case "sensacao": {
      if (momento !== "fim") return;
      const morador = quem(efeito.quem);
      if (morador) darSensacao(ctx, morador, efeito.id, efeito.minutos);
      return;
    }
  }
}

function terminou(
  ctx: Contexto,
  acao: Acao,
  def: DefInteracao,
  ator: Morador,
  tick: Tick,
): boolean {
  if (acao.fimTick !== null) return tick >= acao.fimTick;
  if (!("ate" in def.duracao)) return true;
  const inicio = acao.inicioTick ?? tick;
  if (tick - inicio >= ticksDeMinutos(ctx, def.duracao.maxMinutos)) return true;
  const quem =
    def.duracao.ate.quem === "ator"
      ? ator
      : acao.alvo.t === "morador"
        ? obter(ctx.estado.moradores, acao.alvo.moradorId)
        : undefined;
  return (quem?.necessidades[def.duracao.ate.necessidade] ?? UM) >= def.duracao.ate.valor;
}

function concluir(ctx: Contexto, morador: Morador, acao: Acao, def: DefInteracao): void {
  const alvo =
    acao.alvo.t === "morador" ? (obter(ctx.estado.moradores, acao.alvo.moradorId) ?? null) : null;
  for (const efeito of def.efeitos) aplicarEfeito(ctx, efeito, morador, alvo, "fim");
  const especial = def.especial;
  const alvoDaAcao = acao.alvo;
  const autor = acao.autor;
  const comandoId = acao.comandoId;
  retirar(ctx, acao, true);
  if (especial) {
    aplicarEspecial(ctx, especial, { ator: morador, alvo: alvoDaAcao, autor, comandoId });
  }
}

function progredir(ctx: Contexto, morador: Morador, acao: Acao): void {
  const tick = ctx.estado.relogio.tick;
  // Quem só dá atenção acompanha a ação do outro; ela termina por lá.
  if (acao.origem === "resposta") {
    if (!acao.par || !obter(ctx.estado.acoes, acao.par)) retirar(ctx, acao, false);
    return;
  }
  const def = interacao(acao.interacao);
  if (!def) {
    cancelarAcao(ctx, acao.id, "comando_invalido");
    return;
  }

  if (acao.estado === "na_fila") {
    iniciar(ctx, morador, acao);
    return;
  }

  if (acao.estado === "esperando") {
    if (tick - (acao.inicioTick ?? tick) > ESPERA_MAXIMA_TICKS) {
      cancelarAcao(ctx, acao.id, "ocupado");
      return;
    }
    iniciar(ctx, morador, acao);
    return;
  }

  // Interação a dois: se o outro saiu de cena, não há o que continuar.
  if (acao.alvo.t === "morador") {
    const outro = obter(ctx.estado.moradores, acao.alvo.moradorId);
    const juntos =
      outro &&
      ondeEsta(ctx.estado, outro, tick)?.loteId === ondeEsta(ctx.estado, morador, tick)?.loteId;
    const noColoDoAtor = outro?.local.t === "colo" && outro.local.de === morador.id;
    if (!juntos || (!noColoDoAtor && (!acao.par || outro.acaoAtual !== acao.par))) {
      cancelarAcao(ctx, acao.id, "inalcancavel");
      return;
    }
  }

  if (acao.estado === "indo") {
    const movimento = morador.movimento;
    if (!movimento) {
      comecarExecucao(ctx, morador, acao, def);
      return;
    }
    if (tick < movimento.inicioTick + duracaoDoMovimento(movimento)) return;
    const fim = movimento.rota[movimento.rota.length - 1] as PontoMm;
    chegar(ctx, morador, acao, def, fim);
    return;
  }

  // Executando.
  const alvo =
    acao.alvo.t === "morador" ? (obter(ctx.estado.moradores, acao.alvo.moradorId) ?? null) : null;
  for (const efeito of def.efeitos) aplicarEfeito(ctx, efeito, morador, alvo, "tick");
  if (terminou(ctx, acao, def, morador, tick)) concluir(ctx, morador, acao, def);
}

/** Um passo das ações de todos os moradores, na ordem de criação. */
export function passoDasAcoes(ctx: Contexto): void {
  for (const id of [...ctx.estado.moradores.ordem]) {
    const morador = obter(ctx.estado.moradores, id);
    if (!morador) continue;
    if (!morador.acaoAtual && morador.fila.length > 0) {
      const proxima = morador.fila.shift() as AcaoId;
      morador.acaoAtual = proxima;
      tocar(ctx, "moradores", morador.id);
    }
    if (!morador.acaoAtual) continue;
    const acao = obter(ctx.estado.acoes, morador.acaoAtual);
    if (!acao) {
      morador.acaoAtual = null;
      tocar(ctx, "moradores", morador.id);
      continue;
    }
    progredir(ctx, morador, acao);
  }
}
