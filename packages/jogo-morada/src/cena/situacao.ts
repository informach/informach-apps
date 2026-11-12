import {
  type EstadoDoMundo,
  type LoteId,
  type Morador,
  type MoradorId,
  type Objeto,
  obter,
  progressoDaGravidez,
  vagaDoPonto,
} from "@informach/morada-sim";
import { interacao } from "@informach/morada-sim/conteudo";
import { type NoCaminho, type PontoReal, posicaoFracionada } from "../espelho/previsao";
import { giroDaDirecao } from "./espaco";

/**
 * Onde e como desenhar um morador em um instante: uma conta sobre o espelho,
 * sem three.js. A cena aplica o resultado; os testes conferem a conta.
 */

export type PosturaDoCorpo = "em_pe" | "sentado" | "deitado" | "no_colo";

export type Situacao = {
  loteId: LoteId;
  /** Na planta do lote, em milímetros, com fração. */
  pos: PontoReal;
  /** Altura do apoio (chão, assento, colchão), em milímetros. */
  altura: number;
  /** Para onde o corpo aponta, em graus da simulação. */
  frente: number;
  postura: PosturaDoCorpo;
  andando: boolean;
  /** A ação em curso já está sendo executada (não indo nem esperando). */
  agindo: boolean;
  /** O clipe que a interação pede; os corpos de verdade tocam, o procedural só pulsa. */
  animacao: string | null;
  noColoDe: MoradorId | null;
};

export type ApoioDoObjeto = (objeto: Objeto, ponto: string, postura: PosturaDoCorpo) => number;

/** A altura do piso em um ponto do lote: dentro da casa, o piso dela; fora, o terreno. */
export function alturaDoPiso(estado: EstadoDoMundo, loteId: LoteId, pos: PontoReal): number {
  const lote = obter(estado.lotes, loteId);
  const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : undefined;
  const andar = imovel?.andares.find((a) => a.n === 0);
  if (!andar) return 0;
  for (const comodo of andar.comodos) {
    for (const [x0, y0, x1, y1] of comodo.ret) {
      if (pos[0] >= x0 && pos[0] <= x1 && pos[1] >= y0 && pos[1] <= y1) return andar.z;
    }
  }
  return 0;
}

function acaoEmCurso(
  estado: EstadoDoMundo,
  morador: Morador,
): { agindo: boolean; animacao: string | null } {
  const acao = morador.acaoAtual ? obter(estado.acoes, morador.acaoAtual) : undefined;
  if (acao?.estado !== "executando") return { agindo: false, animacao: null };
  if (acao.interacao === "receber" && acao.par) {
    // Quem dá atenção toca o clipe que a ação do outro reserva para o alvo.
    const par = obter(estado.acoes, acao.par);
    const def = par ? interacao(par.interacao) : undefined;
    return { agindo: true, animacao: def?.animacaoDoAlvo ?? null };
  }
  return { agindo: true, animacao: interacao(acao.interacao)?.animacao ?? null };
}

/**
 * A situação de um morador no tick dado (com fração). `previsto` toma o lugar
 * da posição do servidor para o morador que a pessoa dirige enquanto a
 * previsão do "ir até aqui" vale. Devolve `null` para quem está fora dos lotes.
 */
export function situacaoDoMorador(
  estado: EstadoDoMundo,
  morador: Morador,
  tick: number,
  apoio: ApoioDoObjeto,
  previsto: NoCaminho | null = null,
): Situacao | null {
  const local = morador.local;
  const emCurso = acaoEmCurso(estado, morador);
  switch (local.t) {
    case "fora":
      return null;
    case "lote": {
      const caminho =
        previsto ?? (morador.movimento ? posicaoFracionada(morador.movimento, tick) : null);
      const pos: PontoReal = caminho ? caminho.pos : [local.pos[0], local.pos[1]];
      const frente =
        caminho?.andando && caminho.direcao
          ? giroDaDirecao(caminho.direcao[0], caminho.direcao[1])
          : local.frente;
      return {
        loteId: local.loteId,
        pos,
        altura: alturaDoPiso(estado, local.loteId, pos),
        frente,
        postura: "em_pe",
        andando: caminho?.andando ?? false,
        ...emCurso,
        noColoDe: null,
      };
    }
    case "objeto": {
      if (previsto) {
        // Já se levantou na previsão: anda como quem está no chão.
        return {
          loteId: local.loteId,
          pos: previsto.pos,
          altura: alturaDoPiso(estado, local.loteId, previsto.pos),
          frente: previsto.direcao ? giroDaDirecao(previsto.direcao[0], previsto.direcao[1]) : 0,
          postura: "em_pe",
          andando: previsto.andando,
          agindo: false,
          animacao: null,
          noColoDe: null,
        };
      }
      const objeto = obter(estado.objetos, local.objetoId);
      const vaga = objeto ? vagaDoPonto(objeto, local.ponto) : null;
      if (!objeto || !vaga) return null;
      const postura: PosturaDoCorpo = vaga.postura;
      return {
        loteId: local.loteId,
        pos: [vaga.pos[0], vaga.pos[1]],
        altura: objeto.pos[2] + apoio(objeto, local.ponto, postura),
        frente: vaga.frente,
        postura,
        andando: false,
        ...emCurso,
        noColoDe: null,
      };
    }
    case "colo": {
      const quemCarrega = obter(estado.moradores, local.de);
      // Um bebê de colo nunca carrega outro, então isto não entra em ciclo.
      if (!quemCarrega || quemCarrega.local.t === "colo") return null;
      const base = situacaoDoMorador(estado, quemCarrega, tick, apoio);
      if (!base) return null;
      return { ...base, postura: "no_colo", andando: false, ...emCurso, noColoDe: quemCarrega.id };
    }
  }
}

/** Quanto da gravidez já passou, de 0 a 1; 0 para quem não gesta. */
export function gravidezDe(estado: EstadoDoMundo, moradorId: MoradorId): number {
  for (const id of estado.gravidezes.ordem) {
    const gravidez = estado.gravidezes.porId[id];
    if (gravidez?.gestanteId === moradorId && gravidez.estado === "em_curso") {
      return progressoDaGravidez(estado, gravidez) / 1_000_000;
    }
  }
  return 0;
}
