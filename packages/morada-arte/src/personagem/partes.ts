import type { FonteDeCor } from "../cor/pintura";
import type { Pesos } from "../encaixe/montar";
import type { Imagem } from "../leitura/imagem";
import { em, item } from "../numeros";

/**
 * As partes de um personagem (pele, cada peça, cabelo, rosto) como malhas
 * soltas, e as operações que as levam à malha final: recortar por um conjunto
 * de triângulos, cortar por um plano, emendar várias numa só.
 */

export type FormaDaParte = {
  /** Deslocamento de cada vértice. */
  posicoes: Float32Array;
  normais: Float32Array | null;
};

export type Parte = {
  nome: string;
  posicoes: Float32Array;
  normais: Float32Array;
  uv: Float32Array | null;
  /** Cor por vértice que o arquivo do corpo traz (`COLOR_0`) e que multiplica a cor da fonte. */
  coresDoArquivo: Float32Array | null;
  pesos: Pesos;
  /** Pesos para as poses dobradas (sentado, deitado, agachado); `null` quando são os mesmos. */
  pesosDobrado: Pesos | null;
  indices: Uint32Array;
  formas: Map<string, FormaDaParte>;
  fonte: FonteDeCor;
};

const copiar = (origem: ArrayLike<number>, v: number, largura: number, destino: number[]): void => {
  for (let k = 0; k < largura; k++) destino.push(em(origem, v * largura + k));
};

/** A parte só com os triângulos dados, sem os vértices que sobram. */
export function recortar(parte: Parte, indices: ArrayLike<number>, nome = parte.nome): Parte {
  const novo = new Map<number, number>();
  const ordem: number[] = [];
  const saida = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = em(indices, i);
    let n = novo.get(v);
    if (n === undefined) {
      n = ordem.length;
      novo.set(v, n);
      ordem.push(v);
    }
    saida[i] = n;
  }
  const pegar = (origem: ArrayLike<number>, largura: number): number[] => {
    const destino: number[] = [];
    for (const v of ordem) copiar(origem, v, largura, destino);
    return destino;
  };
  const pesos = (p: Pesos): Pesos => ({
    ossos: Uint16Array.from(pegar(p.ossos, 4)),
    pesos: Float32Array.from(pegar(p.pesos, 4)),
  });
  return {
    ...parte,
    nome,
    posicoes: Float32Array.from(pegar(parte.posicoes, 3)),
    normais: Float32Array.from(pegar(parte.normais, 3)),
    uv: parte.uv ? Float32Array.from(pegar(parte.uv, 2)) : null,
    coresDoArquivo: parte.coresDoArquivo ? Float32Array.from(pegar(parte.coresDoArquivo, 3)) : null,
    pesos: pesos(parte.pesos),
    pesosDobrado: parte.pesosDobrado ? pesos(parte.pesosDobrado) : null,
    indices: saida,
    formas: new Map(
      [...parte.formas].map(([chave, forma]) => [
        chave,
        {
          posicoes: Float32Array.from(pegar(forma.posicoes, 3)),
          normais: forma.normais ? Float32Array.from(pegar(forma.normais, 3)) : null,
        },
      ]),
    ),
  };
}

/**
 * Corta a parte por um plano e fica com o lado em que `(p − ponto)·normal ≤ 0`.
 * É o descarte por fragmento que a página faz no cabelo debaixo do chapéu,
 * feito na geometria: os triângulos atravessados ganham vértices novos sobre o
 * plano.
 */
export function cortarPorPlano(
  parte: Parte,
  ponto: readonly number[],
  normal: readonly number[],
): Parte {
  const P = parte.posicoes;
  const vertices = P.length / 3;
  const d = new Float64Array(vertices);
  for (let i = 0; i < vertices; i++) {
    d[i] =
      (em(P, i * 3) - em(ponto, 0)) * em(normal, 0) +
      (em(P, i * 3 + 1) - em(ponto, 1)) * em(normal, 1) +
      (em(P, i * 3 + 2) - em(ponto, 2)) * em(normal, 2);
  }
  const posicoes = Array.from(P);
  const normais = Array.from(parte.normais);
  const uv = parte.uv ? Array.from(parte.uv) : null;
  const tinta = parte.coresDoArquivo ? Array.from(parte.coresDoArquivo) : null;
  const ossos = Array.from(parte.pesos.ossos);
  const pesos = Array.from(parte.pesos.pesos);
  const novos = new Map<string, number>();
  // vértice novo na aresta (dentro → fora), onde ela cruza o plano
  const naAresta = (dentro: number, fora: number): number => {
    const chave = `${dentro},${fora}`;
    const pronto = novos.get(chave);
    if (pronto !== undefined) return pronto;
    const t = em(d, dentro) / (em(d, dentro) - em(d, fora));
    const mistura = (origem: number[], largura: number): void => {
      for (let k = 0; k < largura; k++) {
        const a = em(origem, dentro * largura + k);
        origem.push(a + (em(origem, fora * largura + k) - a) * t);
      }
    };
    const indice = posicoes.length / 3;
    mistura(posicoes, 3);
    mistura(normais, 3);
    if (uv) mistura(uv, 2);
    if (tinta) mistura(tinta, 3);
    // o cabelo é rígido (preso à cabeça): os pesos do vértice de dentro servem para o ponto novo
    for (let k = 0; k < 4; k++) {
      ossos.push(em(ossos, dentro * 4 + k));
      pesos.push(em(pesos, dentro * 4 + k));
    }
    novos.set(chave, indice);
    return indice;
  };
  const indices: number[] = [];
  for (let t = 0; t < parte.indices.length; t += 3) {
    const v = [em(parte.indices, t), em(parte.indices, t + 1), em(parte.indices, t + 2)];
    const dentro = v.map((i) => em(d, i) <= 0);
    const quantos = dentro.filter(Boolean).length;
    if (quantos === 3) indices.push(...v);
    else if (quantos === 1) {
      const k = dentro.indexOf(true);
      const a = item(v, k);
      const b = item(v, (k + 1) % 3);
      const c = item(v, (k + 2) % 3);
      indices.push(a, naAresta(a, b), naAresta(a, c));
    } else if (quantos === 2) {
      const k = dentro.indexOf(false);
      const fora = item(v, k);
      const b = item(v, (k + 1) % 3);
      const c = item(v, (k + 2) % 3);
      const cb = naAresta(b, fora);
      const cc = naAresta(c, fora);
      indices.push(b, c, cc, b, cc, cb);
    }
  }
  const cortada: Parte = {
    ...parte,
    posicoes: Float32Array.from(posicoes),
    normais: Float32Array.from(normais),
    uv: uv ? Float32Array.from(uv) : null,
    coresDoArquivo: tinta ? Float32Array.from(tinta) : null,
    pesos: { ossos: Uint16Array.from(ossos), pesos: Float32Array.from(pesos) },
    pesosDobrado: null,
    indices: Uint32Array.from(indices),
    formas: new Map(),
  };
  return recortar(cortada, cortada.indices);
}

export type PrimitivaPronta = {
  posicoes: Float32Array;
  normais: Float32Array;
  /** Cor linear por vértice; `null` na primitiva com textura. */
  cores: Float32Array | null;
  uv: Float32Array | null;
  textura: Imagem | null;
  pesos: Pesos;
  dobrado: Pesos | null;
  indices: Uint32Array;
  formas: { nome: string; posicoes: Float32Array; normais: Float32Array | null }[];
};

export type OpcoesDeEmenda = {
  /** Nomes das formas da malha final, na ordem; a parte que não tem uma delas entra com zeros. */
  formas: readonly string[];
  /** Guardar as normais das formas (só o corpo traz as dele). */
  normaisDasFormas: boolean;
  /** Levar os pesos das poses dobradas (alguma parte tem os dela). */
  dobrado: boolean;
  /** Cor por vértice de cada parte, ou `null` para emendar com UV (uma textura só). */
  cores: ReadonlyMap<Parte, Float32Array> | null;
  textura: Imagem | null;
};

/** Emenda as partes numa primitiva só. */
export function emendar(partes: readonly Parte[], opcoes: OpcoesDeEmenda): PrimitivaPronta {
  const posicoes: number[] = [];
  const normais: number[] = [];
  const cores: number[] = [];
  const uv: number[] = [];
  const ossos: number[] = [];
  const pesos: number[] = [];
  const ossosDobrado: number[] = [];
  const pesosDobrado: number[] = [];
  const indices: number[] = [];
  const formas = opcoes.formas.map((nome) => ({
    nome,
    posicoes: [] as number[],
    normais: [] as number[],
  }));
  for (const parte of partes) {
    const vertices = parte.posicoes.length / 3;
    const cor = opcoes.cores?.get(parte);
    if (opcoes.cores && !cor) throw new Error(`parte ${parte.nome} sem cor por vértice`);
    if (!opcoes.cores && !parte.uv) throw new Error(`parte ${parte.nome} sem UV para a textura`);
    {
      const base = posicoes.length / 3;
      for (let i = 0; i < vertices; i++) {
        for (let k = 0; k < 3; k++) {
          posicoes.push(em(parte.posicoes, i * 3 + k));
          normais.push(em(parte.normais, i * 3 + k));
          if (cor) cores.push(em(cor, i * 3 + k));
        }
        if (!opcoes.cores && parte.uv) uv.push(em(parte.uv, i * 2), em(parte.uv, i * 2 + 1));
        const dobrado = parte.pesosDobrado ?? parte.pesos;
        for (let k = 0; k < 4; k++) {
          ossos.push(em(parte.pesos.ossos, i * 4 + k));
          pesos.push(em(parte.pesos.pesos, i * 4 + k));
          ossosDobrado.push(em(dobrado.ossos, i * 4 + k));
          pesosDobrado.push(em(dobrado.pesos, i * 4 + k));
        }
      }
      for (const forma of formas) {
        const daParte = parte.formas.get(forma.nome);
        for (let i = 0; i < vertices * 3; i++) {
          forma.posicoes.push(daParte ? em(daParte.posicoes, i) : 0);
          forma.normais.push(daParte?.normais ? em(daParte.normais, i) : 0);
        }
      }
      for (let t = 0; t < parte.indices.length; t += 3) {
        const a = base + em(parte.indices, t);
        const b = base + em(parte.indices, t + 1);
        const c = base + em(parte.indices, t + 2);
        indices.push(a, b, c);
      }
    }
  }
  return {
    posicoes: Float32Array.from(posicoes),
    normais: Float32Array.from(normais),
    cores: opcoes.cores ? Float32Array.from(cores) : null,
    uv: opcoes.cores ? null : Float32Array.from(uv),
    textura: opcoes.textura,
    pesos: { ossos: Uint16Array.from(ossos), pesos: Float32Array.from(pesos) },
    dobrado: opcoes.dobrado
      ? { ossos: Uint16Array.from(ossosDobrado), pesos: Float32Array.from(pesosDobrado) }
      : null,
    indices: Uint32Array.from(indices),
    formas: formas.map((f) => ({
      nome: f.nome,
      posicoes: Float32Array.from(f.posicoes),
      normais: opcoes.normaisDasFormas ? Float32Array.from(f.normais) : null,
    })),
  };
}
