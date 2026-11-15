import { doCatalogo } from "../conteudo";
import type { ObjetoId } from "../dominio/ids";
import { listar, obter } from "../dominio/tabela";
import type { EstadoDoMundo, Objeto, PontoMm } from "../dominio/tipos";
import { doLocal } from "../nucleo/fixo";
import { criarNavegador } from "./navegador";
import { ondeEsta } from "./posicoes";

export const GRADE_DE_EDICAO = 500;
type Retangulo = readonly [x0: number, y0: number, x1: number, y1: number];
type Segmento = readonly [a: PontoMm, b: PontoMm];

export type ImpedimentoDaColocacao =
  | "nao_existe"
  | "catalogo_incompativel"
  | "fixacao_nao_suportada"
  | "fora_da_grade"
  | "fora_do_lote"
  | "fora_do_piso"
  | "colisao"
  | "parede"
  | "ocupado"
  | "acesso_bloqueado";

/** Só giros cardinais: dois cantos opostos bastam, sem trigonometria. */
export function pegadaNoLote(objeto: Objeto): Retangulo | null {
  const entrada = doCatalogo(objeto.catalogo);
  if (!entrada || entrada.versao !== objeto.versao || ![0, 90, 180, 270].includes(objeto.giro))
    return null;
  const origem: PontoMm = [objeto.pos[0], objeto.pos[1]];
  const a = doLocal(origem, objeto.giro, [entrada.pegada[0], entrada.pegada[1]]);
  const b = doLocal(origem, objeto.giro, [entrada.pegada[2], entrada.pegada[3]]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

function dentro(p: PontoMm, r: Retangulo): boolean {
  return p[0] > r[0] && p[0] < r[2] && p[1] > r[1] && p[1] < r[3];
}

/** Interseção com o interior aberto. Contato tangente não atravessa a parede. */
function atravessa([a, b]: Segmento, r: Retangulo): boolean {
  let inicio = 0;
  let fim = 1;
  for (const eixo of [0, 1] as const) {
    const minimo = eixo === 0 ? r[0] : r[1];
    const maximo = eixo === 0 ? r[2] : r[3];
    const delta = b[eixo] - a[eixo];
    if (delta === 0) {
      if (a[eixo] <= minimo || a[eixo] >= maximo) return false;
    } else {
      const de = (minimo - a[eixo]) / delta;
      const ate = (maximo - a[eixo]) / delta;
      inicio = Math.max(inicio, Math.min(de, ate));
      fim = Math.min(fim, Math.max(de, ate));
      if (inicio >= fim) return false;
    }
  }
  return inicio < fim;
}

function bordas(poligono: readonly PontoMm[]): Segmento[] {
  const saida: Segmento[] = [];
  for (const [indice, a] of poligono.entries()) {
    const b = poligono[(indice + 1) % poligono.length];
    if (b) saida.push([a, b]);
  }
  return saida;
}

function noPoligono(p: PontoMm, segmentos: readonly Segmento[]): boolean {
  let interior = false;
  for (const [a, b] of segmentos) {
    const cruzado = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    if (
      cruzado === 0 &&
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1])
    )
      return true;
    if (a[1] > p[1] !== b[1] > p[1]) {
      if (cruzado < 0 === b[1] > a[1]) interior = !interior;
    }
  }
  return interior;
}

function cabeNoPiso(r: Retangulo, contorno: readonly PontoMm[]): boolean {
  const segmentos = bordas(contorno);
  const cantos: PontoMm[] = [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[2], r[3]],
    [r[0], r[3]],
  ];
  return (
    cantos.every((p) => noPoligono(p, segmentos)) &&
    !segmentos.some((segmento) => atravessa(segmento, r))
  );
}

/**
 * Primeiro perfil: móveis no piso térreo, dentro do contorno da casa.
 * Apoios, teto/parede e outros andares exigem seus contratos próprios.
 * Só calcula: não consome IDs, dinheiro, RNG nem modifica caches do mundo.
 */
export function conferirColocacaoNoChao(
  estado: EstadoDoMundo,
  objetoId: ObjetoId,
  candidato: Objeto | null,
): ImpedimentoDaColocacao | null {
  const anterior = obter(estado.objetos, objetoId);
  const loteId = anterior?.loteId ?? candidato?.loteId;
  const lote = loteId ? obter(estado.lotes, loteId) : undefined;
  const imovel = lote?.imovelId ? obter(estado.imoveis, lote.imovelId) : undefined;
  const piso = imovel?.andares.find((andar) => andar.n === 0);
  if (!lote || !imovel || !piso || (!anterior && !candidato)) return "nao_existe";
  if (candidato && (candidato.id !== objetoId || candidato.loteId !== lote.id))
    return "catalogo_incompativel";
  if (anterior) {
    if (anterior.andar !== 0 || doCatalogo(anterior.catalogo)?.fixacao !== "chao")
      return "fixacao_nao_suportada";
    if (Object.keys(anterior.ocupacao).length) return "ocupado";
    for (const morador of listar(estado.moradores))
      if (morador.local.t === "objeto" && morador.local.objetoId === anterior.id) return "ocupado";
    // A tabela conserva somente ações vivas, inclusive as que ainda estão na fila.
    for (const acao of listar(estado.acoes))
      if (
        (acao.alvo.t === "objeto" && acao.alvo.objetoId === anterior.id) ||
        acao.reserva?.objetoId === anterior.id
      )
        return "ocupado";
  }
  const atuais = listar(estado.objetos).filter((objeto) => objeto.loteId === lote.id);
  const outros = atuais.filter((objeto) => objeto.id !== objetoId);
  if (anterior) {
    const entradaAnterior = doCatalogo(anterior.catalogo);
    const areaAnterior = pegadaNoLote(anterior);
    if (!entradaAnterior || !areaAnterior) return "catalogo_incompativel";
    // Mundos legados ainda não têm apoioId. Conservar o suporte físico existente
    // até a edição de apoios ter relação explícita; nunca deixar o enfeite flutuando.
    for (const outro of outros) {
      const entrada = doCatalogo(outro.catalogo);
      const area = pegadaNoLote(outro);
      if (
        entrada?.fixacao === "apoio" &&
        area &&
        outro.andar === anterior.andar &&
        sobrepoe(areaAnterior, area) &&
        outro.pos[2] >= anterior.pos[2] &&
        outro.pos[2] <= anterior.pos[2] + entradaAnterior.altura
      )
        return "ocupado";
    }
  }
  let pegada: Retangulo | null = null;
  if (candidato) {
    const entrada = doCatalogo(candidato.catalogo);
    pegada = pegadaNoLote(candidato);
    if (!entrada || !pegada || (anterior && candidato.catalogo !== anterior.catalogo))
      return "catalogo_incompativel";
    if (entrada.fixacao !== "chao" || candidato.andar !== 0 || candidato.pos[2] !== 0)
      return "fixacao_nao_suportada";
    if (
      !candidato.pos.every(Number.isSafeInteger) ||
      candidato.pos[0] % GRADE_DE_EDICAO !== 0 ||
      candidato.pos[1] % GRADE_DE_EDICAO !== 0
    )
      return "fora_da_grade";
    if (
      pegada[0] < 0 ||
      pegada[1] < 0 ||
      pegada[2] > lote.tamanho[0] ||
      pegada[3] > lote.tamanho[1]
    )
      return "fora_do_lote";
    if (!cabeNoPiso(pegada, piso.contorno)) return "fora_do_piso";
    // Inclusive o vão da porta: a peça não pode atravessar a linha da parede.
    if (piso.paredes.some((parede) => atravessa([parede.a, parede.b], pegada))) return "parede";
    for (const outro of outros) {
      if (outro.andar !== candidato.andar) continue;
      const conteudo = doCatalogo(outro.catalogo);
      const area = pegadaNoLote(outro);
      if (!conteudo || !area) return "catalogo_incompativel";
      if (entrada.camadaDeColisao === "piso" || conteudo.camadaDeColisao === "piso") continue;
      if (
        sobrepoe(pegada, area) &&
        candidato.pos[2] < outro.pos[2] + conteudo.altura &&
        outro.pos[2] < candidato.pos[2] + entrada.altura
      )
        return "colisao";
    }
  }
  const novos = candidato ? [...outros, candidato] : outros;
  const antes = criarNavegador(lote, imovel, atuais);
  const depois = criarNavegador(lote, imovel, novos);
  if (!depois.livre(lote.entrada) || !depois.alcancavel(lote.entrada)) return "acesso_bloqueado";
  for (const objeto of novos) {
    for (const ponto of doCatalogo(objeto.catalogo)?.pontos ?? []) {
      const acessoAnterior = antes.acesso(objeto, ponto.id);
      if ((objeto.id === candidato?.id || acessoAnterior) && !depois.acesso(objeto, ponto.id))
        return "acesso_bloqueado";
      if (objeto.ocupacao[ponto.id] && acessoAnterior && !depois.alcancavel(acessoAnterior.pos))
        return "acesso_bloqueado";
    }
  }
  for (const morador of listar(estado.moradores)) {
    const onde = ondeEsta(estado, morador, estado.relogio.tick);
    if (!onde || onde.loteId !== lote.id || onde.andar !== 0) continue;
    // Quem já está num ponto de uso não precisa caber numa célula de passagem.
    if (morador.local.t === "lote" && antes.alcancavel(onde.pos) && !depois.alcancavel(onde.pos))
      return "acesso_bloqueado";
    if (pegada && morador.local.t === "lote") {
      const margem: Retangulo = [
        pegada[0] - 250,
        pegada[1] - 250,
        pegada[2] + 250,
        pegada[3] + 250,
      ];
      if (dentro(onde.pos, margem)) return "ocupado";
      const rota = morador.movimento?.rota ?? [];
      for (let indice = 1; indice < rota.length; indice++) {
        const a = rota[indice - 1];
        const b = rota[indice];
        if (a && b && atravessa([a, b], margem)) return "ocupado";
      }
    }
  }
  return null;
}
