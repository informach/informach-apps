import type { Landmark } from "../body/landmarks";

/** Ombros, quadris, joelhos e tornozelos: o corpo que a contagem precisa ver. */
const CORPO = [11, 12, 23, 24, 25, 26, 27, 28] as const;

/**
 * Quanto do corpo a câmera está vendo, de 0 a 1, sem depender do exercício: a média da
 * visibilidade dos pontos principais, zerando os que estão fora da imagem. Vale no preparo e no
 * descanso, quando não há contador ligado, para o selo de enquadramento não ficar parado.
 */
export function presenca(image: readonly Landmark[] | undefined): number {
  if (!image?.length) return 0;
  let soma = 0;
  for (const i of CORPO) {
    const p = image[i];
    if (!p) continue;
    const dentro = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    soma += dentro ? Math.min(1, Math.max(0, p.visibility ?? 1)) : 0;
  }
  return soma / CORPO.length;
}
