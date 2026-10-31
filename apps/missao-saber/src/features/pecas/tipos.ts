/**
 * Desafios de peças: quebra-cabeças clássicos, que também existem em madeira,
 * montados na tela. Ficam no laboratório para treinar e a competição sorteia
 * entre eles, como sorteia perguntas da trilha.
 *
 * Três famílias de geometria, cada uma com sua pose e sua verificação:
 * - malha: peças de quadradinhos ou cubinhos, giros de 90°, encaixe inteiro;
 * - livre-plano: polígonos com giro em passos (45°, 3°...), posição contínua;
 * - livre-espaco: sólidos convexos com os 24 giros do cubo e passo de meia unidade.
 */

/** Faixa de idade: a (2º e 3º ano), b (4º e 5º), c (6º e 7º), d (8º em diante). */
export type Faixa = "a" | "b" | "c" | "d";
export const faixas: readonly Faixa[] = ["a", "b", "c", "d"];

export type Celula = readonly [number, number, number];
export type Ponto = readonly [number, number];
export type Vetor3 = readonly [number, number, number];

type Base = {
  id: string;
  nome: string;
  /** Como o quebra-cabeça é conhecido fora daqui, para quem quiser a peça física. */
  conhecidoComo: string;
  faixa: Faixa;
  /** O que montar, dito para a criança. */
  objetivo: string;
  /** Mostrada ao fim: a ideia que destrava a montagem. */
  estrategia: string;
  /** Fica aberto sem assinatura. */
  gratuito: boolean;
};

export type PecaMalha = { id: string; nome: string; cor: string; celulas: readonly Celula[] };
export type DesafioMalha = Base & {
  tipo: "malha-plano" | "malha-espaco";
  pecas: readonly PecaMalha[];
  alvo: readonly Celula[];
  /** Células que cada peça ocupa numa solução conhecida. */
  solucao: Readonly<Record<string, readonly Celula[]>>;
};

/** Peça plana como união de partes convexas, em coordenadas locais centradas. */
export type PecaPlana = {
  id: string;
  nome: string;
  cor: string;
  partes: readonly (readonly Ponto[])[];
};
export type DesafioLivrePlano = Base & {
  tipo: "livre-plano";
  /** cobrir: as peças preenchem o alvo sem sobrar; caber: todas dentro da base, sem se sobrepor. */
  modo: "cobrir" | "caber";
  pecas: readonly PecaPlana[];
  alvo: readonly (readonly Ponto[])[];
  /** Passo de giro em graus. */
  giro: number;
  /** As peças podem virar do avesso (madeira de face igual dos dois lados). */
  espelho: boolean;
  solucao: Readonly<Record<string, PosePlana>>;
};

/** Sólido convexo pelos vértices, em coordenadas locais. */
export type PecaSolida = { id: string; nome: string; cor: string; vertices: readonly Vetor3[] };
export type DesafioLivreEspaco = Base & {
  tipo: "livre-espaco";
  pecas: readonly PecaSolida[];
  /** Sólido convexo a formar. */
  alvo: readonly Vetor3[];
  solucao: Readonly<Record<string, PoseSolida>>;
};

export type Desafio = DesafioMalha | DesafioLivrePlano | DesafioLivreEspaco;

/** Malha: translação inteira e índice da orientação (8 no plano, 24 no espaço). */
export type PoseMalha = { x: number; y: number; z: number; o: number };
export type PosePlana = { x: number; y: number; angulo: number; espelho: boolean };
/** Espaço livre: translação em meias unidades e índice entre os 24 giros do cubo. */
export type PoseSolida = { x: number; y: number; z: number; o: number };

export type Montagem =
  | { tipo: "malha"; poses: Record<string, PoseMalha> }
  | { tipo: "livre-plano"; poses: Record<string, PosePlana> }
  | { tipo: "livre-espaco"; poses: Record<string, PoseSolida> };

export function ehMalha(desafio: Desafio): desafio is DesafioMalha {
  return desafio.tipo === "malha-plano" || desafio.tipo === "malha-espaco";
}
