import {
  type Acao,
  type AcaoId,
  DIA_MS,
  diaDeJogo,
  type EstadoDoMundo,
  horaDoDiaMs,
  listar,
  type Morador,
  type MoradorId,
  obter,
  type PedidoId,
  type PresencaVista,
  temPermissao,
  type Velocidade,
} from "@informach/morada-sim";
import {
  type Humor,
  interacao,
  necessidadesDaFase,
  sensacao,
} from "@informach/morada-sim/conteudo";
import { nomeDoObjeto } from "./menu";
import { nomeDoJogador, type OpcoesDosRetratos } from "./retratos";
import { verboDoPedido } from "./textos";

/**
 * O que os painéis do HUD mostram, como dados: a fila do morador, as
 * necessidades, o relógio, o acordo de velocidade e os pedidos em aberto.
 * São contas sobre o espelho, sem tela.
 */

// --- Relógio ---

const DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export type HoraDoJogo = { dia: number; diaDaSemana: string; hora: string };

/** O mundo começa às 8 da manhã do dia 1. */
export function horaDoJogo(estado: EstadoDoMundo): HoraDoJogo {
  const dia = diaDeJogo(estado.relogio);
  const minutos = Math.floor(horaDoDiaMs(estado.relogio) / 60_000);
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return { dia, diaDaSemana: DIAS[(dia - 1) % 7] ?? "", hora: `${hh}:${mm}` };
}

/** Fração do dia, de 0 a 1, para a luz da cena. */
export function fracaoDoDia(estado: EstadoDoMundo): number {
  return horaDoDiaMs(estado.relogio) / DIA_MS;
}

export type VotoVisto = {
  velocidade: Velocidade;
  /** A pessoa já concordou. */
  euConcordei: boolean;
  /** Quem ainda precisa concordar, pelo nome que o jogo tem de cada um. */
  faltam: string[];
};

/** O pedido de velocidade que espera acordo, se há um. */
export function votoPendente(presenca: PresencaVista, opcoes: OpcoesDosRetratos): VotoVisto | null {
  const voto = presenca.voto;
  if (!voto) return null;
  const faltam = presenca.jogadores
    .filter((jogador) => jogador.estado === "presente" && !voto.aFavor.includes(jogador.perfilId))
    .map((jogador) => nomeDoJogador(presenca, jogador.perfilId, opcoes));
  return {
    velocidade: voto.velocidade,
    euConcordei: voto.aFavor.includes(opcoes.jogadorId),
    faltam,
  };
}

export function rotuloDaVelocidade(velocidade: Velocidade): string {
  return velocidade === 0 ? "pausa" : `${velocidade}×`;
}

// --- Fila ---

export type ItemDaFila = {
  acaoId: AcaoId;
  rotulo: string;
  /** O que está acontecendo com ela agora. */
  situacao: "na_fila" | "indo" | "esperando" | "executando";
  /** De 0 a 1 enquanto executa uma ação de duração conhecida. */
  progresso: number | null;
  /** Foi a pessoa (ou outro jogador) que pediu, e não o morador por conta própria. */
  pedida: boolean;
  /** É a atenção que o morador dá a outro que veio falar com ele. */
  emResposta: boolean;
  /** Dá para cancelar: quem está dando atenção a outro não larga no meio. */
  cancelavel: boolean;
};

/** O nome de uma ação para a fila: o que é, e com quem ou em quê. */
export function rotuloDaAcao(estado: EstadoDoMundo, acao: Acao): string {
  const def = interacao(acao.interacao);
  const base = def?.rotulo ?? acao.interacao;
  if (acao.interacao === "receber" && acao.alvo.t === "morador") {
    const outro = obter(estado.moradores, acao.alvo.moradorId);
    return outro ? `Dar atenção a ${outro.nome}` : base;
  }
  if (acao.alvo.t === "morador") {
    const outro = obter(estado.moradores, acao.alvo.moradorId);
    return outro ? `${base} · ${outro.nome}` : base;
  }
  if (acao.alvo.t === "objeto") {
    const objeto = obter(estado.objetos, acao.alvo.objetoId);
    return objeto ? `${base} · ${nomeDoObjeto(objeto.catalogo)}` : base;
  }
  return base;
}

function itemDaFila(estado: EstadoDoMundo, acao: Acao): ItemDaFila {
  const tick = estado.relogio.tick;
  let progresso: number | null = null;
  if (acao.estado === "executando" && acao.inicioTick !== null && acao.fimTick !== null) {
    const total = acao.fimTick - acao.inicioTick;
    progresso = total > 0 ? Math.min(1, Math.max(0, (tick - acao.inicioTick) / total)) : 1;
  }
  return {
    acaoId: acao.id,
    rotulo: rotuloDaAcao(estado, acao),
    situacao: acao.estado,
    progresso,
    pedida: acao.origem === "jogador",
    emResposta: acao.origem === "resposta",
    cancelavel: acao.origem !== "resposta",
  };
}

/** A ação em curso e a fila de um morador, na ordem em que vão acontecer. */
export function filaDe(estado: EstadoDoMundo, moradorId: MoradorId): ItemDaFila[] {
  const morador = obter(estado.moradores, moradorId);
  if (!morador) return [];
  const ids = morador.acaoAtual ? [morador.acaoAtual, ...morador.fila] : morador.fila;
  const itens: ItemDaFila[] = [];
  for (const id of ids) {
    const acao = obter(estado.acoes, id);
    if (acao) itens.push(itemDaFila(estado, acao));
  }
  return itens;
}

// --- Necessidades e humor ---

export type NecessidadeVista = {
  id: string;
  rotulo: string;
  /** De 0 a 1. */
  nivel: number;
  critica: boolean;
};

export function necessidadesDe(morador: Morador): NecessidadeVista[] {
  return necessidadesDaFase(morador.fase).map((def) => {
    const valor = morador.necessidades[def.id] ?? 0;
    return {
      id: def.id,
      rotulo: def.rotulo,
      nivel: Math.min(1, Math.max(0, valor / 1_000_000)),
      critica: valor < def.critico,
    };
  });
}

export type HumorVisto = { humor: Humor; sensacoes: string[] };

/** O humor que mais pesa agora e o que o morador está sentindo. */
export function humorDe(morador: Morador, tick: number): HumorVisto {
  const pesos = new Map<Humor, number>();
  const sensacoes: string[] = [];
  for (const sentida of morador.sensacoes) {
    if (sentida.ateTick <= tick) continue;
    const def = sensacao(sentida.id);
    if (!def) continue;
    sensacoes.push(def.rotulo);
    pesos.set(def.humor, (pesos.get(def.humor) ?? 0) + def.peso);
  }
  let humor: Humor = "tranquilo";
  let maior = 0;
  for (const [candidato, peso] of pesos) {
    if (peso > maior) {
      humor = candidato;
      maior = peso;
    }
  }
  return { humor, sensacoes };
}

// --- Pedidos ---

export type PedidoVisto = {
  pedidoId: PedidoId;
  texto: string;
  /** A pessoa pode responder: dirige quem recebeu, ou decide a vida da família dele. */
  podeResponder: boolean;
  /** Foi a própria pessoa que pediu: só resta esperar. */
  meu: boolean;
};

/** Os pedidos de vida em aberto que dizem respeito à pessoa. */
export function pedidosAbertos(
  estado: EstadoDoMundo,
  presenca: PresencaVista,
  jogadorId: string,
): PedidoVisto[] {
  const saida: PedidoVisto[] = [];
  for (const pedido of listar(estado.pedidos)) {
    if (pedido.estado !== "aberto") continue;
    const de = obter(estado.moradores, pedido.de);
    const para = obter(estado.moradores, pedido.para);
    if (!de || !para) continue;
    const meu = pedido.autor === jogadorId;
    const dirige = presenca.reservas.some(
      (reserva) => reserva.moradorId === para.id && reserva.perfilId === jogadorId,
    );
    const decide = temPermissao(estado, jogadorId, para.familiaId, "decidir_vida");
    const podeResponder = !meu && (dirige || decide);
    if (!meu && !podeResponder) continue;
    saida.push({
      pedidoId: pedido.id,
      texto: `${de.nome} ${verboDoPedido(pedido.tipo)} ${para.nome}`,
      podeResponder,
      meu,
    });
  }
  return saida;
}
