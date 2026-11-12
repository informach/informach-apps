import { amostrar, type Imagem } from "../leitura/imagem";
import { em, item } from "../numeros";
import { type CorLivre, comCorLivre, linearParaSrgb, type Rgb, srgbParaLinear } from "./cores";

/**
 * De onde vem a cor de uma parte do personagem na página, e as duas formas de
 * levá-la para o jogo: pintada nos vértices (sem textura nenhuma) ou assada
 * numa textura pequena, quando a peça tem estampa que os vértices não guardam.
 */

export type FonteDeCor =
  /** Cor única do material: cabelo, manta, gorro. */
  | { tipo: "lisa"; cor: Rgb }
  /** A paleta dos corpos, lida no texel mais próximo, vezes a cor do material (tom de pele, traços). */
  | { tipo: "paleta"; imagem: Imagem; fator: Rgb }
  /** Textura de roupa com a cor livre do shader da página. */
  | { tipo: "roupa"; imagem: Imagem; mascara: Imagem | null; livre: CorLivre | null };

const TABELA_SRGB = Float64Array.from({ length: 256 }, (_, i) => srgbParaLinear(i / 255));

const TABELA_LINEAR = Float64Array.from({ length: 256 }, (_, i) => i / 255);

/** A cor linear que a página mostra neste ponto do UV, antes da luz. */
export function corNoPonto(fonte: FonteDeCor, u: number, v: number): Rgb {
  if (fonte.tipo === "lisa") return fonte.cor;
  if (fonte.tipo === "paleta") {
    const t = amostrar(fonte.imagem, u, v, "proximo", "segura", TABELA_SRGB);
    return [t[0] * fonte.fator[0], t[1] * fonte.fator[1], t[2] * fonte.fator[2]];
  }
  const t = amostrar(fonte.imagem, u, v, "bilinear", "segura", TABELA_SRGB);
  const textura: Rgb = [t[0], t[1], t[2]];
  if (!fonte.livre || !fonte.mascara) return textura;
  const m = amostrar(fonte.mascara, u, v, "bilinear", "segura", TABELA_LINEAR)[0];
  return comCorLivre(textura, m, fonte.livre);
}

/** Uma cor linear por vértice (três números), pela cor da página no UV de cada um. */
export function coresDosVertices(
  fonte: FonteDeCor,
  uv: Float32Array | null,
  vertices: number,
): Float32Array {
  const cores = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    const cor = uv ? corNoPonto(fonte, em(uv, i * 2), em(uv, i * 2 + 1)) : corNoPonto(fonte, 0, 0);
    cores[i * 3] = cor[0];
    cores[i * 3 + 1] = cor[1];
    cores[i * 3 + 2] = cor[2];
  }
  return cores;
}

const nivel = (linear: number): number => 255 * linearParaSrgb(Math.min(Math.max(linear, 0), 1));

/** Pontos dentro do triângulo onde a pintura por vértice é comparada com a textura. */
const AMOSTRAS: readonly (readonly [number, number, number])[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
  [2 / 3, 1 / 6, 1 / 6],
  [1 / 6, 2 / 3, 1 / 6],
  [1 / 6, 1 / 6, 2 / 3],
];

export type ErroDePintura = {
  /** Maior diferença num canal, em níveis de 8 bits sRGB. */
  maximo: number;
  /** Diferença que 99% das amostras não passam. */
  p99: number;
  medio: number;
};

/**
 * Quanto a pintura por vértice (cor interpolada dentro do triângulo) se afasta
 * do que a página mostra (a textura lida em cada ponto), nos triângulos dados.
 */
export function erroDaPinturaPorVertice(
  fonte: FonteDeCor,
  uv: Float32Array | null,
  indices: ArrayLike<number>,
): ErroDePintura {
  if (fonte.tipo === "lisa" || !uv) return { maximo: 0, p99: 0, medio: 0 };
  const erros: number[] = [];
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const v = [em(indices, t), em(indices, t + 1), em(indices, t + 2)] as const;
    const uvs = v.map((i) => [em(uv, i * 2), em(uv, i * 2 + 1)] as const);
    const cores = uvs.map(([u, w]) => corNoPonto(fonte, u, w));
    for (const [a, b, c] of AMOSTRAS) {
      const u = a * item(uvs, 0)[0] + b * item(uvs, 1)[0] + c * item(uvs, 2)[0];
      const w = a * item(uvs, 0)[1] + b * item(uvs, 1)[1] + c * item(uvs, 2)[1];
      const real = corNoPonto(fonte, u, w);
      let erro = 0;
      for (let k = 0; k < 3; k++) {
        const pintado =
          a * em(item(cores, 0), k) + b * em(item(cores, 1), k) + c * em(item(cores, 2), k);
        erro = Math.max(erro, Math.abs(nivel(pintado) - nivel(em(real, k))));
      }
      erros.push(erro);
      total += erro;
    }
    // Um detalhe pequeno da estampa (um botão, um pesponto) cabe entre as amostras acima: nas roupas,
    // todo texel que cai dentro do triângulo é conferido (com salto, se o triângulo cobre texels demais).
    if (fonte.tipo !== "roupa") continue;
    const { largura, altura } = fonte.imagem;
    const px = uvs.map(([u]) => u * largura - 0.5);
    const py = uvs.map(([, w]) => w * altura - 0.5);
    const [x0, y0, x1, y1, x2, y2] = [
      em(px, 0),
      em(py, 0),
      em(px, 1),
      em(py, 1),
      em(px, 2),
      em(py, 2),
    ];
    const dobroDaArea = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(dobroDaArea) < 1e-9) continue;
    const xi = Math.ceil(Math.min(x0, x1, x2));
    const xf = Math.floor(Math.max(x0, x1, x2));
    const yi = Math.ceil(Math.min(y0, y1, y2));
    const yf = Math.floor(Math.max(y0, y1, y2));
    const salto = Math.max(1, Math.ceil(Math.max(xf - xi, yf - yi) / 48));
    for (let ty = yi; ty <= yf; ty += salto) {
      for (let tx = xi; tx <= xf; tx += salto) {
        const b = ((tx - x0) * (y2 - y0) - (x2 - x0) * (ty - y0)) / dobroDaArea;
        const c = ((x1 - x0) * (ty - y0) - (tx - x0) * (y1 - y0)) / dobroDaArea;
        const a = 1 - b - c;
        if (a < 0 || b < 0 || c < 0) continue;
        const real = corNoPonto(fonte, (tx + 0.5) / largura, (ty + 0.5) / altura);
        let erro = 0;
        for (let k = 0; k < 3; k++) {
          const pintado =
            a * em(item(cores, 0), k) + b * em(item(cores, 1), k) + c * em(item(cores, 2), k);
          erro = Math.max(erro, Math.abs(nivel(pintado) - nivel(em(real, k))));
        }
        erros.push(erro);
        total += erro;
      }
    }
  }
  if (erros.length === 0) return { maximo: 0, p99: 0, medio: 0 };
  erros.sort((x, y) => x - y);
  return {
    maximo: em(erros, erros.length - 1),
    p99: em(erros, Math.min(erros.length - 1, Math.floor(erros.length * 0.99))),
    medio: total / erros.length,
  };
}

/**
 * A textura de uma peça já com a cor livre aplicada, em sRGB, reduzida para
 * caber em `lado` pixels (média dos pixels de cada bloco, feita em linear).
 */
export function assarTextura(fonte: Extract<FonteDeCor, { tipo: "roupa" }>, lado: number): Imagem {
  const origem = fonte.imagem;
  const passo = Math.max(1, Math.ceil(Math.max(origem.largura, origem.altura) / lado));
  const largura = Math.max(1, Math.floor(origem.largura / passo));
  const altura = Math.max(1, Math.floor(origem.altura / passo));
  const dados = new Uint8Array(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const soma = [0, 0, 0];
      for (let dy = 0; dy < passo; dy++) {
        for (let dx = 0; dx < passo; dx++) {
          const u = (x * passo + dx + 0.5) / origem.largura;
          const v = (y * passo + dy + 0.5) / origem.altura;
          const cor = corNoPonto(fonte, u, v);
          for (let k = 0; k < 3; k++) soma[k] = em(soma, k) + em(cor, k);
        }
      }
      const base = (y * largura + x) * 4;
      for (let k = 0; k < 3; k++)
        dados[base + k] = Math.round(nivel(em(soma, k) / (passo * passo)));
      dados[base + 3] = 255;
    }
  }
  return { arquivo: origem.arquivo, largura, altura, dados };
}
