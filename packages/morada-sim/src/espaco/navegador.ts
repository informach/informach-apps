import { doCatalogo } from "../conteudo";
import type { Lote, Objeto, PontoMm } from "../dominio/tipos";
import type { DocumentoDeImovel } from "../formatos/imovel";
import { doLocal } from "../nucleo/fixo";
import { acessosDoPonto, type PontoNoLote } from "./posicoes";

/**
 * Navegação de um lote em grade de 25 cm. É um cache: nasce da planta e dos
 * objetos, nunca é salvo e é refeito quando o lote muda.
 *
 * As paredes ficam nas linhas da grade, então quem bloqueia é a passagem de
 * uma célula para a vizinha, não a célula. Portas abrem um trecho da parede.
 *
 * A interface é pequena de propósito: uma malha de navegação pode tomar o
 * lugar da grade sem mudar quem chama.
 */

export const CELULA = 250;

const RETO = 10;
const DIAGONAL = 14;

/** Os oito vizinhos, em ordem fixa. */
const VIZINHOS: readonly (readonly [dx: number, dy: number, custo: number])[] = [
  [1, 0, RETO],
  [-1, 0, RETO],
  [0, 1, RETO],
  [0, -1, RETO],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
];

type Segmento = readonly [ax: number, ay: number, bx: number, by: number];

export type Navegador = {
  /** O caminho entre dois pontos do lote, já alisado; `null` se não há caminho. */
  rota(de: PontoMm, para: PontoMm): PontoMm[] | null;
  /** Custo de chegar a cada lugar saindo de `de`; `null` para o que é inalcançável. */
  custosDe(de: PontoMm): (para: PontoMm) => number | null;
  /** Dá para ficar neste ponto. */
  livre(ponto: PontoMm): boolean;
  /** O ponto livre mais próximo, para quem foi posto dentro de um obstáculo. */
  livreMaisPerto(ponto: PontoMm): PontoMm | null;
  /** Dá para chegar a este ponto vindo da entrada do lote. */
  alcancavel(ponto: PontoMm): boolean;
  /**
   * De onde se chega a um ponto de uso: o primeiro acesso do catálogo que é
   * alcançável nesta casa. `null` se a peça está cercada.
   */
  acesso(objeto: Objeto, pontoId: string): PontoNoLote | null;
};

function orientacao(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

function noIntervalo(a: number, b: number, c: number): boolean {
  return Math.min(a, b) <= c && c <= Math.max(a, b);
}

/** Verdadeiro se os segmentos se cruzam ou se tocam. */
function cruzam(p: Segmento, q: Segmento): boolean {
  const o1 = orientacao(p[0], p[1], p[2], p[3], q[0], q[1]);
  const o2 = orientacao(p[0], p[1], p[2], p[3], q[2], q[3]);
  const o3 = orientacao(q[0], q[1], q[2], q[3], p[0], p[1]);
  const o4 = orientacao(q[0], q[1], q[2], q[3], p[2], p[3]);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && noIntervalo(p[0], p[2], q[0]) && noIntervalo(p[1], p[3], q[1])) return true;
  if (o2 === 0 && noIntervalo(p[0], p[2], q[2]) && noIntervalo(p[1], p[3], q[3])) return true;
  if (o3 === 0 && noIntervalo(q[0], q[2], p[0]) && noIntervalo(q[1], q[3], p[1])) return true;
  if (o4 === 0 && noIntervalo(q[0], q[2], p[2]) && noIntervalo(q[1], q[3], p[3])) return true;
  return false;
}

/** As partes sólidas das paredes de um andar: cada parede menos as suas portas. */
function trechosSolidos(imovel: DocumentoDeImovel, andar: number): Segmento[] {
  const planta = imovel.andares.find((a) => a.n === andar);
  if (!planta) return [];
  const trechos: Segmento[] = [];
  for (const parede of planta.paredes) {
    const [ax, ay] = parede.a;
    const [bx, by] = parede.b;
    const horizontal = ay === by;
    if (!horizontal && ax !== bx) {
      // Parede inclinada: fica inteira, sem porta. A etapa 1 só tem paredes retas.
      trechos.push([ax, ay, bx, by]);
      continue;
    }
    const inicio = horizontal ? Math.min(ax, bx) : Math.min(ay, by);
    const fim = horizontal ? Math.max(ax, bx) : Math.max(ay, by);
    const vaos = planta.aberturas
      .filter((abertura) => abertura.parede === parede.id && abertura.tipo === "porta")
      .map((abertura) => {
        const centro = horizontal ? abertura.centro[0] : abertura.centro[1];
        const meia = Math.floor(abertura.largura / 2);
        return [centro - meia, centro + meia] as const;
      })
      .sort((a, b) => a[0] - b[0]);
    let cursor = inicio;
    for (const [de, ate] of vaos) {
      if (de > cursor) {
        trechos.push(horizontal ? [cursor, ay, de, ay] : [ax, cursor, ax, de]);
      }
      cursor = Math.max(cursor, ate);
    }
    if (cursor < fim) trechos.push(horizontal ? [cursor, ay, fim, ay] : [ax, cursor, ax, fim]);
  }
  return trechos;
}

export function criarNavegador(
  lote: Lote,
  imovel: DocumentoDeImovel | null,
  objetos: readonly Objeto[],
  andar = 0,
): Navegador {
  const colunas = Math.ceil(lote.tamanho[0] / CELULA);
  const linhas = Math.ceil(lote.tamanho[1] / CELULA);
  const total = colunas * linhas;
  const ocupada = new Uint8Array(total);
  /** Um bit por vizinho de `VIZINHOS`: 1 quando a passagem é permitida. */
  const passagens = new Uint8Array(total);

  const indice = (cx: number, cy: number) => cy * colunas + cx;
  const dentro = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < colunas && cy < linhas;
  const centro = (cx: number, cy: number): PontoMm => [
    cx * CELULA + CELULA / 2,
    cy * CELULA + CELULA / 2,
  ];
  const celulaDe = (ponto: PontoMm): [number, number] => [
    Math.floor(ponto[0] / CELULA),
    Math.floor(ponto[1] / CELULA),
  ];

  // Móveis que bloqueiam ocupam as células cujo centro cai na pegada deles.
  for (const objeto of objetos) {
    if (objeto.andar !== andar) continue;
    const entrada = doCatalogo(objeto.catalogo);
    if (!entrada?.bloqueia) continue;
    const origem: PontoMm = [objeto.pos[0], objeto.pos[1]];
    const a = doLocal(origem, objeto.giro, [entrada.pegada[0], entrada.pegada[1]]);
    const b = doLocal(origem, objeto.giro, [entrada.pegada[2], entrada.pegada[3]]);
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let cy = Math.max(0, Math.floor(y0 / CELULA)); cy <= Math.floor(y1 / CELULA); cy++) {
      for (let cx = Math.max(0, Math.floor(x0 / CELULA)); cx <= Math.floor(x1 / CELULA); cx++) {
        if (!dentro(cx, cy)) continue;
        const [px, py] = centro(cx, cy);
        if (px >= x0 && px <= x1 && py >= y0 && py <= y1) ocupada[indice(cx, cy)] = 1;
      }
    }
  }

  const solidos = imovel ? trechosSolidos(imovel, andar) : [];

  // Índice das paredes por célula, para não testar todas a cada passagem.
  const paredesPerto: number[][] = Array.from({ length: total }, () => []);
  solidos.forEach((trecho, n) => {
    const x0 = Math.floor(Math.min(trecho[0], trecho[2]) / CELULA) - 1;
    const x1 = Math.floor(Math.max(trecho[0], trecho[2]) / CELULA) + 1;
    const y0 = Math.floor(Math.min(trecho[1], trecho[3]) / CELULA) - 1;
    const y1 = Math.floor(Math.max(trecho[1], trecho[3]) / CELULA) + 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dentro(cx, cy)) paredesPerto[indice(cx, cy)]?.push(n);
      }
    }
  });

  function paredeEntre(cx: number, cy: number, nx: number, ny: number): boolean {
    const [ax, ay] = centro(cx, cy);
    const [bx, by] = centro(nx, ny);
    const passo: Segmento = [ax, ay, bx, by];
    for (const n of paredesPerto[indice(cx, cy)] ?? []) {
      const trecho = solidos[n];
      if (trecho && cruzam(passo, trecho)) return true;
    }
    return false;
  }

  for (let cy = 0; cy < linhas; cy++) {
    for (let cx = 0; cx < colunas; cx++) {
      if (ocupada[indice(cx, cy)]) continue;
      let bits = 0;
      // Primeiro os quatro retos; as diagonais dependem deles.
      for (let v = 0; v < 4; v++) {
        const vizinho = VIZINHOS[v];
        if (!vizinho) continue;
        const nx = cx + vizinho[0];
        const ny = cy + vizinho[1];
        if (!dentro(nx, ny) || ocupada[indice(nx, ny)]) continue;
        if (!paredeEntre(cx, cy, nx, ny)) bits |= 1 << v;
      }
      passagens[indice(cx, cy)] = bits;
    }
  }
  const retoLivre = (cx: number, cy: number, dx: number, dy: number): boolean => {
    const v = dx === 1 ? 0 : dx === -1 ? 1 : dy === 1 ? 2 : 3;
    return ((passagens[indice(cx, cy)] ?? 0) & (1 << v)) !== 0;
  };
  for (let cy = 0; cy < linhas; cy++) {
    for (let cx = 0; cx < colunas; cx++) {
      if (ocupada[indice(cx, cy)]) continue;
      let bits = passagens[indice(cx, cy)] ?? 0;
      for (let v = 4; v < 8; v++) {
        const vizinho = VIZINHOS[v];
        if (!vizinho) continue;
        const [dx, dy] = vizinho;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!dentro(nx, ny) || ocupada[indice(nx, ny)]) continue;
        // Sem cortar quina: a diagonal só vale se os dois caminhos em L valem.
        const peloX = retoLivre(cx, cy, dx, 0) && retoLivre(cx + dx, cy, 0, dy);
        const peloY = retoLivre(cx, cy, 0, dy) && retoLivre(cx, cy + dy, dx, 0);
        if (peloX && peloY && !paredeEntre(cx, cy, nx, ny)) bits |= 1 << v;
      }
      passagens[indice(cx, cy)] = bits;
    }
  }

  const livre = (ponto: PontoMm): boolean => {
    const [cx, cy] = celulaDe(ponto);
    return dentro(cx, cy) && !ocupada[indice(cx, cy)];
  };

  /** Dijkstra a partir de uma célula. Custos inteiros; -1 é inalcançável. */
  // Buffers da busca, reaproveitados: uma busca por vez, e o resultado é
  // copiado quando precisa sobreviver à busca seguinte.
  const custos = new Int32Array(total);
  const vindoDe = new Int32Array(total);
  const chave = new Int32Array(total);
  const fechada = new Uint8Array(total);
  const monte: number[] = [];

  function custosDaCelula(origem: number, alvo = -1): { custos: Int32Array; vindoDe: Int32Array } {
    custos.fill(-1);
    vindoDe.fill(-1);
    fechada.fill(0);
    monte.length = 0;
    // Fila de prioridade em monte binário, com desempate pelo índice da célula.
    const menor = (a: number, b: number) =>
      (chave[a] ?? 0) < (chave[b] ?? 0) || ((chave[a] ?? 0) === (chave[b] ?? 0) && a < b);
    const empurrar = (celula: number) => {
      monte.push(celula);
      let i = monte.length - 1;
      while (i > 0) {
        const pai = (i - 1) >> 1;
        const a = monte[i] as number;
        const b = monte[pai] as number;
        if (!menor(a, b)) break;
        monte[i] = b;
        monte[pai] = a;
        i = pai;
      }
    };
    const tirar = (): number => {
      const topo = monte[0] as number;
      const ultimo = monte.pop() as number;
      if (monte.length > 0) {
        monte[0] = ultimo;
        let i = 0;
        for (;;) {
          const e = 2 * i + 1;
          const d = e + 1;
          let m = i;
          if (e < monte.length && menor(monte[e] as number, monte[m] as number)) m = e;
          if (d < monte.length && menor(monte[d] as number, monte[m] as number)) m = d;
          if (m === i) break;
          const troca = monte[i] as number;
          monte[i] = monte[m] as number;
          monte[m] = troca;
          i = m;
        }
      }
      return topo;
    };

    custos[origem] = 0;
    chave[origem] = 0;
    empurrar(origem);
    while (monte.length > 0) {
      const atual = tirar();
      if (fechada[atual]) continue;
      fechada[atual] = 1;
      if (atual === alvo) break;
      const cx = atual % colunas;
      const cy = (atual - cx) / colunas;
      const bits = passagens[atual] ?? 0;
      for (let v = 0; v < 8; v++) {
        if ((bits & (1 << v)) === 0) continue;
        const vizinho = VIZINHOS[v];
        if (!vizinho) continue;
        const proximo = indice(cx + vizinho[0], cy + vizinho[1]);
        if (fechada[proximo]) continue;
        const custo = (custos[atual] ?? 0) + vizinho[2];
        const anterior = custos[proximo] ?? -1;
        if (anterior === -1 || custo < anterior) {
          custos[proximo] = custo;
          vindoDe[proximo] = atual;
          chave[proximo] = custo;
          empurrar(proximo);
        }
      }
    }
    return { custos, vindoDe };
  }

  /** Há linha reta livre entre os centros de duas células. */
  function visada(a: number, b: number): boolean {
    let cx = a % colunas;
    let cy = (a - cx) / colunas;
    const bx = b % colunas;
    const by = (b - bx) / colunas;
    // Anda célula a célula na direção do alvo; cada passo precisa ser permitido.
    while (cx !== bx || cy !== by) {
      const dx = Math.sign(bx - cx);
      const dy = Math.sign(by - cy);
      // Só segue em linha reta ou diagonal exata, para o caminho alisado não raspar em nada.
      const restoX = Math.abs(bx - cx);
      const restoY = Math.abs(by - cy);
      if (restoX !== 0 && restoY !== 0 && restoX !== restoY) return false;
      const v = VIZINHOS.findIndex((vizinho) => vizinho[0] === dx && vizinho[1] === dy);
      if (v < 0 || ((passagens[indice(cx, cy)] ?? 0) & (1 << v)) === 0) return false;
      cx += dx;
      cy += dy;
    }
    return true;
  }

  function livreMaisPerto(ponto: PontoMm): PontoMm | null {
    const [cx, cy] = celulaDe(ponto);
    if (dentro(cx, cy) && !ocupada[indice(cx, cy)]) return ponto;
    // Anéis crescentes em volta da célula, em ordem fixa.
    for (let raio = 1; raio < Math.max(colunas, linhas); raio++) {
      let melhor: PontoMm | null = null;
      let melhorDistancia = Number.MAX_SAFE_INTEGER;
      for (let dy = -raio; dy <= raio; dy++) {
        for (let dx = -raio; dx <= raio; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== raio) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!dentro(nx, ny) || ocupada[indice(nx, ny)]) continue;
          const candidato = centro(nx, ny);
          const distancia =
            (candidato[0] - ponto[0]) * (candidato[0] - ponto[0]) +
            (candidato[1] - ponto[1]) * (candidato[1] - ponto[1]);
          if (distancia < melhorDistancia) {
            melhor = candidato;
            melhorDistancia = distancia;
          }
        }
      }
      if (melhor) return melhor;
    }
    return null;
  }

  // Regiões ligadas: duas células estão na mesma região se há caminho entre elas.
  const regiao = new Int32Array(total).fill(-1);
  let regioes = 0;
  for (let semente = 0; semente < total; semente++) {
    if (ocupada[semente] || regiao[semente] !== -1) continue;
    const pilha = [semente];
    regiao[semente] = regioes;
    while (pilha.length > 0) {
      const atual = pilha.pop() as number;
      const cx = atual % colunas;
      const cy = (atual - cx) / colunas;
      const bits = passagens[atual] ?? 0;
      for (let v = 0; v < 4; v++) {
        if ((bits & (1 << v)) === 0) continue;
        const vizinho = VIZINHOS[v];
        if (!vizinho) continue;
        const proximo = indice(cx + vizinho[0], cy + vizinho[1]);
        if (regiao[proximo] === -1) {
          regiao[proximo] = regioes;
          pilha.push(proximo);
        }
      }
    }
    regioes++;
  }
  const naEntrada = livreMaisPerto([lote.entrada[0], lote.entrada[1]]);
  const regiaoDaEntrada = naEntrada ? (regiao[indice(...celulaDe(naEntrada))] ?? -1) : -1;

  const alcancavel = (ponto: PontoMm): boolean => {
    const [cx, cy] = celulaDe(ponto);
    if (!dentro(cx, cy) || ocupada[indice(cx, cy)]) return false;
    return regiaoDaEntrada !== -1 && regiao[indice(cx, cy)] === regiaoDaEntrada;
  };

  const acessos = new Map<string, PontoNoLote | null>();

  return {
    livre,
    livreMaisPerto,
    alcancavel,

    acesso(objeto, pontoId) {
      const chave = `${objeto.id}/${pontoId}`;
      const guardado = acessos.get(chave);
      if (guardado !== undefined) return guardado;
      const achado =
        acessosDoPonto(objeto, pontoId).find((candidato) => alcancavel(candidato.pos)) ?? null;
      acessos.set(chave, achado);
      return achado;
    },

    rota(de, para) {
      const partida = livreMaisPerto(de);
      const [fx, fy] = celulaDe(para);
      if (!partida || !dentro(fx, fy) || ocupada[indice(fx, fy)]) return null;
      const [ix, iy] = celulaDe(partida);
      const inicio = indice(ix, iy);
      const fim = indice(fx, fy);
      if (inicio === fim)
        return [
          [de[0], de[1]],
          [para[0], para[1]],
        ];

      const { custos, vindoDe } = custosDaCelula(inicio, fim);
      if ((custos[fim] ?? -1) < 0) return null;
      const celulas: number[] = [];
      for (let atual = fim; atual !== -1; atual = vindoDe[atual] ?? -1) celulas.push(atual);
      celulas.reverse();

      // Alisa: pula as células intermediárias enquanto houver visada.
      const alisadas: number[] = [celulas[0] as number];
      let ancora = 0;
      while (ancora < celulas.length - 1) {
        let proximo = ancora + 1;
        for (let candidato = celulas.length - 1; candidato > ancora + 1; candidato--) {
          if (visada(celulas[ancora] as number, celulas[candidato] as number)) {
            proximo = candidato;
            break;
          }
        }
        alisadas.push(celulas[proximo] as number);
        ancora = proximo;
      }

      const pontos: PontoMm[] = [[de[0], de[1]]];
      for (const celula of alisadas) {
        const cx = celula % colunas;
        pontos.push(centro(cx, (celula - cx) / colunas));
      }
      pontos.push([para[0], para[1]]);
      // Tira pontos repetidos em sequência.
      return pontos.filter((ponto, i) => {
        const anterior = pontos[i - 1];
        return !anterior || anterior[0] !== ponto[0] || anterior[1] !== ponto[1];
      });
    },

    custosDe(de) {
      const partida = livreMaisPerto(de);
      if (!partida) return () => null;
      const [ix, iy] = celulaDe(partida);
      // Cópia: o campo é consultado depois, e os buffers serão usados de novo.
      const campo = custosDaCelula(indice(ix, iy)).custos.slice();
      return (para) => {
        const [cx, cy] = celulaDe(para);
        if (!dentro(cx, cy)) return null;
        const custo = campo[indice(cx, cy)] ?? -1;
        // De volta a milímetros: dez unidades de custo por célula.
        return custo < 0 ? null : Math.floor((custo * CELULA) / RETO);
      };
    },
  };
}
