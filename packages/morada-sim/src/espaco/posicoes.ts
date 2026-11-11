import { doCatalogo } from "../conteudo";
import type { Postura } from "../conteudo/esquema";
import type { LoteId, MoradorId, ObjetoId } from "../dominio/ids";
import { obter } from "../dominio/tabela";
import type { EstadoDoMundo, Morador, Movimento, Objeto, PontoMm, Tick } from "../dominio/tipos";
import { direcaoPara, distancia, doLocal } from "../nucleo/fixo";

/**
 * Onde cada coisa está. As posições não mudam a cada tick: quem anda guarda a
 * rota e o tick de partida, e a posição em qualquer instante é uma conta. O
 * servidor e o cliente fazem a mesma conta.
 */

/** Ponto de uso que não é de ninguém em pé: o interior do berço. */
export const PONTO_DENTRO = "dentro";

export function comprimentoDaRota(rota: readonly PontoMm[]): number {
  let total = 0;
  for (let i = 1; i < rota.length; i++) {
    total += distancia(rota[i - 1] as PontoMm, rota[i] as PontoMm);
  }
  return total;
}

/** Quantos ticks o movimento leva do começo ao fim. */
export function duracaoDoMovimento(movimento: Movimento): number {
  if (movimento.mmPorTick <= 0) return 0;
  return Math.ceil(comprimentoDaRota(movimento.rota) / movimento.mmPorTick);
}

/** Posição em um tick. Antes da partida é o começo; depois da chegada, o fim. */
export function posicaoNoMovimento(movimento: Movimento, tick: Tick): PontoMm {
  const rota = movimento.rota;
  const primeiro = rota[0] as PontoMm;
  let resto = Math.max(0, tick - movimento.inicioTick) * movimento.mmPorTick;
  for (let i = 1; i < rota.length; i++) {
    const a = rota[i - 1] as PontoMm;
    const b = rota[i] as PontoMm;
    const trecho = distancia(a, b);
    if (resto < trecho) {
      return [
        a[0] + Math.trunc(((b[0] - a[0]) * resto) / trecho),
        a[1] + Math.trunc(((b[1] - a[1]) * resto) / trecho),
      ];
    }
    resto -= trecho;
  }
  const ultimo = rota[rota.length - 1] ?? primeiro;
  return [ultimo[0], ultimo[1]];
}

export type PontoNoLote = { pos: PontoMm; frente: number; postura: Postura };

/** Onde o corpo fica ao usar um ponto de um objeto, em coordenadas do lote. */
export function vagaDoPonto(objeto: Objeto, pontoId: string): PontoNoLote | null {
  const origem: PontoMm = [objeto.pos[0], objeto.pos[1]];
  if (pontoId === PONTO_DENTRO) return { pos: origem, frente: objeto.giro, postura: "deitado" };
  const ponto = doCatalogo(objeto.catalogo)?.pontos?.find((p) => p.id === pontoId);
  if (!ponto) return null;
  return {
    pos: doLocal(origem, objeto.giro, ponto.vaga),
    frente: objeto.giro,
    postura: ponto.postura,
  };
}

/** Os lugares de onde se chega a um ponto, em ordem de preferência, no lote. */
export function acessosDoPonto(objeto: Objeto, pontoId: string): PontoNoLote[] {
  const origem: PontoMm = [objeto.pos[0], objeto.pos[1]];
  const ponto = doCatalogo(objeto.catalogo)?.pontos?.find((p) => p.id === pontoId);
  if (!ponto) return [];
  return ponto.acessos.map((local) => {
    const pos = doLocal(origem, objeto.giro, local);
    return { pos, frente: direcaoPara(pos, origem), postura: ponto.postura };
  });
}

/** Os pontos livres do tipo pedido, na ordem do catálogo. */
export function pontosLivres(objeto: Objeto, tipo: string): string[] {
  const saida: string[] = [];
  for (const ponto of doCatalogo(objeto.catalogo)?.pontos ?? []) {
    if (ponto.tipo === tipo && objeto.ocupacao[ponto.id] === undefined) saida.push(ponto.id);
  }
  return saida;
}

export type Onde = { loteId: LoteId; pos: PontoMm; andar: number };

/** Onde um morador está agora. `null` para quem está fora dos lotes. */
export function ondeEsta(estado: EstadoDoMundo, morador: Morador, tick: Tick): Onde | null {
  const local = morador.local;
  switch (local.t) {
    case "lote":
      return {
        loteId: local.loteId,
        andar: local.andar,
        pos: morador.movimento ? posicaoNoMovimento(morador.movimento, tick) : local.pos,
      };
    case "objeto": {
      const objeto = obter(estado.objetos, local.objetoId);
      const vaga = objeto ? vagaDoPonto(objeto, local.ponto) : null;
      if (!objeto || !vaga) return null;
      return { loteId: local.loteId, andar: objeto.andar, pos: vaga.pos };
    }
    case "colo": {
      const quemCarrega = obter(estado.moradores, local.de);
      // Um bebê de colo nunca carrega outro, então isto não entra em ciclo.
      return quemCarrega && quemCarrega.local.t !== "colo"
        ? ondeEsta(estado, quemCarrega, tick)
        : null;
    }
    case "fora":
      return null;
  }
}

/** O bebê que este morador carrega, se carrega algum. */
export function bebeNoColoDe(estado: EstadoDoMundo, moradorId: MoradorId): Morador | null {
  for (const id of estado.moradores.ordem) {
    const outro = estado.moradores.porId[id];
    if (outro?.local.t === "colo" && outro.local.de === moradorId) return outro;
  }
  return null;
}

/** Os moradores que estão em um lote, na ordem de criação. */
export function moradoresNoLote(estado: EstadoDoMundo, loteId: LoteId, tick: Tick): Morador[] {
  const saida: Morador[] = [];
  for (const id of estado.moradores.ordem) {
    const morador = estado.moradores.porId[id];
    if (morador && ondeEsta(estado, morador, tick)?.loteId === loteId) saida.push(morador);
  }
  return saida;
}

export function objetosDoLote(estado: EstadoDoMundo, loteId: LoteId): Objeto[] {
  const saida: Objeto[] = [];
  for (const id of estado.objetos.ordem) {
    const objeto = estado.objetos.porId[id];
    if (objeto?.loteId === loteId) saida.push(objeto);
  }
  return saida;
}

/** O objeto em que um bebê está deitado, se está em algum. */
export function objetoOndeEsta(estado: EstadoDoMundo, morador: Morador): ObjetoId | null {
  return morador.local.t === "objeto" && obter(estado.objetos, morador.local.objetoId)
    ? morador.local.objetoId
    : null;
}
