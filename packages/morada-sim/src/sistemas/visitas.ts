import { necessidadesIniciais } from "../dominio/estado";
import type { LoteId, MoradorId } from "../dominio/ids";
import { listar, obter } from "../dominio/tabela";
import type { EstadoDoMundo, EventoAgendado, Tick } from "../dominio/tipos";
import { moradoresNoLote } from "../espaco/posicoes";
import { diaDeJogo, horaDoDiaMs } from "../nucleo/relogio";
import { sorteioAte } from "../nucleo/sorteio";
import { limparAcoes } from "./acoes";
import { apresentar, type Contexto, tocar } from "./contexto";
import { ticksDeMinutos } from "./efeitos";

/**
 * Visitas dos moradores avulsos do bairro. É assim que a família conhece
 * gente nova: alguém aparece, conversa, vai embora. Se virar da família, fica.
 */

const HORA_DA_VISITA_MS = 15 * 60 * 60 * 1000;
const DURACAO_DA_VISITA_MIN = 180;
/** Quanto a visita espera, em ticks, quando a hora de ir chega no meio de uma conversa. */
const ADIAMENTO_DA_SAIDA = 100;
/** Quanto leva para chegar quem foi convidado, em ticks. */
export const TEMPO_DE_CHEGADA = 100;

function inserirNaAgenda(estado: EstadoDoMundo, evento: EventoAgendado): void {
  estado.agenda.push(evento);
  estado.agenda.sort((a, b) => a.em - b.em || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function visitaMarcada(estado: EstadoDoMundo, moradorId: MoradorId): boolean {
  return estado.agenda.some((evento) => evento.moradorId === moradorId);
}

export function marcarVisita(ctx: Contexto, moradorId: MoradorId, loteId: LoteId, em: Tick): void {
  inserirNaAgenda(ctx.estado, {
    id: `chega:${moradorId}:${em}`,
    em,
    tipo: "visita_chega",
    moradorId,
    loteId,
  });
}

function chegar(ctx: Contexto, evento: EventoAgendado): void {
  const estado = ctx.estado;
  const morador = obter(estado.moradores, evento.moradorId);
  const lote = obter(estado.lotes, evento.loteId);
  if (!morador || !lote || morador.local.t !== "fora") return;
  morador.local = {
    t: "lote",
    loteId: lote.id,
    andar: 0,
    pos: [lote.entrada[0], lote.entrada[1]],
    frente: 180,
  };
  if (Object.keys(morador.necessidades).length === 0) {
    morador.necessidades = necessidadesIniciais(morador.fase, 850_000);
  }
  tocar(ctx, "moradores", morador.id);
  apresentar(ctx, { t: "visita", loteId: lote.id, moradorId: morador.id, chegou: true });
  const sai = estado.relogio.tick + ticksDeMinutos(ctx, DURACAO_DA_VISITA_MIN);
  inserirNaAgenda(estado, {
    id: `vai:${morador.id}:${sai}`,
    em: sai,
    tipo: "visita_vai",
    moradorId: morador.id,
    loteId: lote.id,
  });
}

function irEmbora(ctx: Contexto, evento: EventoAgendado): void {
  const morador = obter(ctx.estado.moradores, evento.moradorId);
  // Quem entrou para a família no meio da visita fica.
  if (!morador || morador.familiaId !== null || morador.local.t === "fora") return;
  // Ninguém vai embora no meio de uma conversa: espera terminar.
  const acao = morador.acaoAtual ? obter(ctx.estado.acoes, morador.acaoAtual) : undefined;
  if (acao && (acao.origem === "resposta" || acao.alvo.t === "morador")) {
    const depois = ctx.estado.relogio.tick + ADIAMENTO_DA_SAIDA;
    inserirNaAgenda(ctx.estado, { ...evento, id: `vai:${morador.id}:${depois}`, em: depois });
    return;
  }
  limparAcoes(ctx, morador);
  morador.local = { t: "fora", motivo: "visita_encerrada" };
  morador.movimento = null;
  tocar(ctx, "moradores", morador.id);
  apresentar(ctx, { t: "visita", loteId: evento.loteId, moradorId: morador.id, chegou: false });
}

/** Uma vez por dia de jogo, à tarde, um avulso que conhece alguém aparece. */
function visitaDoDia(ctx: Contexto): void {
  const estado = ctx.estado;
  const { tick, msDeJogoPorTick } = estado.relogio;
  const hora = horaDoDiaMs(estado.relogio);
  if (hora < HORA_DA_VISITA_MS || hora >= HORA_DA_VISITA_MS + msDeJogoPorTick) return;

  for (const lote of listar(estado.lotes)) {
    if (!lote.familiaId) continue;
    const emCasa = moradoresNoLote(estado, lote.id, tick);
    if (emCasa.some((morador) => morador.familiaId === null)) continue;
    // Só visita quem já conhece alguém da casa.
    const conhecidos = listar(estado.moradores).filter(
      (morador) =>
        morador.familiaId === null &&
        morador.local.t === "fora" &&
        !visitaMarcada(estado, morador.id) &&
        morador.relacoes.some((id) => {
          const relacao = estado.relacoes.porId[id];
          const outro = relacao?.a === morador.id ? relacao.b : relacao?.a;
          return (
            outro !== undefined && obter(estado.moradores, outro)?.familiaId === lote.familiaId
          );
        }),
    );
    if (conhecidos.length === 0) continue;
    const escolhido =
      conhecidos[
        sorteioAte(conhecidos.length, estado.semente, "visita", lote.id, diaDeJogo(estado.relogio))
      ];
    if (escolhido) marcarVisita(ctx, escolhido.id, lote.id, tick + 1);
  }
}

export function passoDasVisitas(ctx: Contexto): void {
  const estado = ctx.estado;
  visitaDoDia(ctx);
  while (
    estado.agenda.length > 0 &&
    (estado.agenda[0] as EventoAgendado).em <= estado.relogio.tick
  ) {
    const evento = estado.agenda.shift() as EventoAgendado;
    if (evento.tipo === "visita_chega") chegar(ctx, evento);
    else irEmbora(ctx, evento);
  }
}
