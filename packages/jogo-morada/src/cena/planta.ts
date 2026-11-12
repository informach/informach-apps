import type { Abertura, Parede } from "@informach/morada-sim/formatos";

/**
 * Da planta às peças de parede, sem three.js. Cada parede é cortada pelas
 * suas aberturas: a porta deixa um vão do chão até a altura dela, com a verga
 * por cima; a janela deixa o peitoril embaixo e a verga em cima.
 *
 * Com as paredes baixas, tudo é cortado a uma altura só, e o que ficaria
 * acima do corte some.
 */

/** Pé-direito da casa da prova: os plafons ficam a 3 m do piso. */
export const PE_DIREITO_MM = 3000;
/** Altura das paredes quando estão baixas. */
export const CORTE_DAS_PAREDES_MM = 1000;
export const ESPESSURA_DA_PAREDE_MM = 120;

export type PecaDeParede = {
  /** Ao longo da parede, a partir da ponta `a`, em milímetros. */
  de: number;
  ate: number;
  /** Acima do piso do andar, em milímetros. */
  z0: number;
  z1: number;
};

export function comprimentoDaParede(parede: Parede): number {
  return Math.hypot(parede.b[0] - parede.a[0], parede.b[1] - parede.a[1]);
}

/** As peças sólidas de uma parede. `corte` é a altura das paredes baixas; `null` é a parede inteira. */
export function pecasDaParede(
  parede: Parede,
  aberturas: readonly Abertura[],
  peDireito: number,
  corte: number | null,
): PecaDeParede[] {
  const comprimento = comprimentoDaParede(parede);
  if (comprimento <= 0) return [];
  const direcao = [
    (parede.b[0] - parede.a[0]) / comprimento,
    (parede.b[1] - parede.a[1]) / comprimento,
  ] as const;
  const teto = corte === null ? peDireito : Math.min(peDireito, corte);

  const vaos = aberturas
    .filter((abertura) => abertura.parede === parede.id)
    .map((abertura) => {
      // Onde o centro da abertura cai ao longo da parede.
      const centro =
        (abertura.centro[0] - parede.a[0]) * direcao[0] +
        (abertura.centro[1] - parede.a[1]) * direcao[1];
      // A mesma meia largura que a navegação usa para abrir a passagem.
      const meia = Math.floor(abertura.largura / 2);
      return {
        de: Math.max(0, centro - meia),
        ate: Math.min(comprimento, centro + meia),
        abertura,
      };
    })
    .filter((vao) => vao.ate > vao.de)
    .sort((a, b) => a.de - b.de);

  const pecas: PecaDeParede[] = [];
  const acrescentar = (de: number, ate: number, z0: number, z1: number) => {
    const topo = Math.min(z1, teto);
    if (ate > de && topo > z0) pecas.push({ de, ate, z0, z1: topo });
  };

  let cursor = 0;
  for (const { de, ate, abertura } of vaos) {
    acrescentar(cursor, de, 0, peDireito);
    if (abertura.tipo === "janela") acrescentar(de, ate, 0, abertura.peitoril);
    acrescentar(de, ate, abertura.peitoril + abertura.altura, peDireito);
    cursor = Math.max(cursor, ate);
  }
  acrescentar(cursor, comprimento, 0, peDireito);
  return pecas;
}
