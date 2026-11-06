import type { Landmark } from "../body/landmarks";
import { type CountRule, evalMetric } from "../engine/counter";

/**
 * Checagens do portão "Pronto?", antes do primeiro passo. Funções puras sobre os pontos do
 * MediaPipe (e um quadro reduzido do vídeo, para a luz): o player e o celular pareado usam as
 * mesmas.
 */

/** Cabeça, punhos e tornozelos: as pontas do corpo. Se elas estão na imagem, o resto está. */
const PONTAS = [0, 15, 16, 27, 28] as const;
/** folga da borda: ponto colado na borda costuma estar meio cortado */
const BORDA = 0.02;
const VIS = 0.5;

/** O corpo inteiro está na imagem (cabeça, mãos e pés visíveis e longe da borda)? */
export function corpoInteiro(image: readonly Landmark[] | undefined): boolean {
  if (!image?.length) return false;
  return PONTAS.every((i) => {
    const p = image[i];
    return (
      !!p &&
      (p.visibility ?? 1) >= VIS &&
      p.x >= BORDA &&
      p.x <= 1 - BORDA &&
      p.y >= BORDA &&
      p.y <= 1 - BORDA
    );
  });
}

/** Até onde do caminho até o fundo ainda vale como "posição inicial". */
const INICIO = 0.3;

/**
 * A pessoa está na posição de começar o exercício? Para repetições, perto do valor de descanso
 * da regra (em pé no agachamento, braços esticados na flexão). Isometria e alongamento não têm
 * posição de partida: entrar na posição já é o exercício.
 */
export function naPosicaoInicial(rule: CountRule, world: Landmark[] | undefined): boolean {
  if (rule.kind !== "reps") return true;
  if (!world?.length) return false;
  const v = evalMetric(rule.metric, world, 0.3)?.value;
  if (v === undefined || v === null) return false;
  const caminho = (v - rule.rest) / (rule.peak - rule.rest);
  return caminho <= INICIO;
}

/** Abaixo disso (0 a 1), a imagem está escura demais para o detector achar o corpo com folga. */
export const LUZ_MINIMA = 0.18;

/** Luminância média (0 a 1) de pixels RGBA, a partir de um quadro reduzido. */
export function luminanciaMedia(rgba: ArrayLike<number>): number {
  let soma = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    soma += 0.2126 * (rgba[i] ?? 0) + 0.7152 * (rgba[i + 1] ?? 0) + 0.0722 * (rgba[i + 2] ?? 0);
    n++;
  }
  return n ? soma / n / 255 : 0;
}

/** Mede a luz do vídeo num quadro de 32×18 (barato o bastante para rodar uma vez por segundo). */
export function luzDoVideo(video: HTMLVideoElement, tela: HTMLCanvasElement): number | null {
  if (video.readyState < 2) return null;
  tela.width = 32;
  tela.height = 18;
  const g = tela.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(video, 0, 0, 32, 18);
  return luminanciaMedia(g.getImageData(0, 0, 32, 18).data);
}

export interface Checagem {
  /** a câmera (ou o celular) está mandando quadros */
  camera: boolean;
  /** null enquanto não mediu (o celular pareado não mede) */
  luz: boolean | null;
  corpo: boolean;
  posicao: boolean;
}

export const CHECAGEM_VAZIA: Checagem = { camera: false, luz: null, corpo: false, posicao: false };

/** Tudo certo para começar sozinho (a luz só reprova quando foi medida). */
export const tudoPronto = (c: Checagem) => c.camera && c.luz !== false && c.corpo && c.posicao;
