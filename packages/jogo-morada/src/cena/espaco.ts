import { CELULA, type PontoMm } from "@informach/morada-sim";

/**
 * Do espaço da simulação para o da cena, sem three.js.
 *
 * A simulação usa os eixos do Blender, em milímetros: planta em x e y, altura
 * em z, e com giro 0 a frente aponta para −Y. A cena usa os do glTF, em
 * metros: altura em Y, frente em +Z. A passagem é a mesma do exportador do
 * Blender, `(x, y, z) → (x, z, −y)`: uma rotação, sem espelhar. Por isso um
 * giro da simulação (anti-horário visto de cima) é o mesmo ângulo em torno do
 * Y da cena, e um modelo com a frente em +Z entra sem ajuste.
 */

export const METROS_POR_MM = 0.001;

export type PontoDaCena = [x: number, y: number, z: number];

/** Um ponto do bairro, em milímetros, na cena, em metros. */
export function paraCena(x: number, y: number, z = 0): PontoDaCena {
  return [x * METROS_POR_MM, z * METROS_POR_MM, -y * METROS_POR_MM];
}

/** Um ponto do chão da cena de volta à planta, em milímetros. */
export function daCena(x: number, z: number): [x: number, y: number] {
  return [x / METROS_POR_MM, -z / METROS_POR_MM];
}

/** O giro da simulação, em graus, como rotação em torno do Y da cena, em radianos. */
export function giroParaCena(giro: number): number {
  return (giro * Math.PI) / 180;
}

/** O giro, em graus, de quem olha na direção `(dx, dy)` da planta. Com `(0, −1)` é 0. */
export function giroDaDirecao(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** O centro da célula de navegação em que o ponto cai: é para lá que um clique no chão manda. */
export function centroDaCelula(ponto: readonly [number, number]): PontoMm {
  return [
    Math.floor(ponto[0] / CELULA) * CELULA + CELULA / 2,
    Math.floor(ponto[1] / CELULA) * CELULA + CELULA / 2,
  ];
}

/** A menor volta, em graus, de um giro a outro: entre −180 e 180. */
export function menorVolta(de: number, para: number): number {
  return ((((para - de) % 360) + 540) % 360) - 180;
}
