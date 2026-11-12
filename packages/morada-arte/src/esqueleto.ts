import type { Armadura, Osso, Quat } from "./leitura/corpo";
import { em, item, type Vec3 } from "./numeros";

/**
 * Cinemática direta do esqueleto: de translação, rotação e escala locais de
 * cada osso às posições no espaço do personagem. Serve para medir âncoras (o
 * colo, as mãos) e para conferir que a redução de chaves das animações não
 * tira pés e mãos do lugar.
 */

/** Matriz 4×4 por colunas, como no glTF. */
export type Mat4 = Float64Array;

export function matrizDeTrs(t: Vec3, q: Quat, s: Vec3): Mat4 {
  const [x, y, z, w] = q;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0];
  m[1] = 2 * (x * y + z * w) * s[0];
  m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1];
  m[5] = (1 - 2 * (x * x + z * z)) * s[1];
  m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2];
  m[9] = 2 * (y * z - x * w) * s[2];
  m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

export function vezesMatriz(a: Mat4, b: Mat4): Mat4 {
  const m = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let l = 0; l < 4; l++) {
      let soma = 0;
      for (let k = 0; k < 4; k++) soma += em(a, k * 4 + l) * em(b, c * 4 + k);
      m[c * 4 + l] = soma;
    }
  }
  return m;
}

export const posicaoDaMatriz = (m: Mat4): Vec3 => [em(m, 12), em(m, 13), em(m, 14)];

export type PoseLocal = {
  translacao: Vec3;
  rotacao: Quat;
  escala: Vec3;
};

/** A pose de descanso do arquivo: o TRS de cada osso. */
export function poseDeDescanso(ossos: readonly Osso[]): PoseLocal[] {
  return ossos.map((o) => ({ translacao: o.translacao, rotacao: o.rotacao, escala: o.escala }));
}

/** Matrizes dos ossos no espaço do personagem, para uma pose local. Os pais vêm antes dos filhos ou não: tanto faz. */
export function matrizesNoMundo(
  armadura: Armadura,
  ossos: readonly Osso[],
  pose: readonly PoseLocal[],
): Mat4[] {
  const raiz = matrizDeTrs(armadura.translacao, armadura.rotacao, armadura.escala);
  const prontas: (Mat4 | undefined)[] = ossos.map(() => undefined);
  const resolver = (i: number): Mat4 => {
    const pronta = prontas[i];
    if (pronta) return pronta;
    const osso = item(ossos, i);
    const local = item(pose, i);
    const m = vezesMatriz(
      osso.pai < 0 ? raiz : resolver(osso.pai),
      matrizDeTrs(local.translacao, local.rotacao, local.escala),
    );
    prontas[i] = m;
    return m;
  };
  return ossos.map((_, i) => resolver(i));
}

/** Posição de cada osso no espaço do personagem, para uma pose local. */
export function posicoesNoMundo(
  armadura: Armadura,
  ossos: readonly Osso[],
  pose: readonly PoseLocal[],
): Vec3[] {
  return matrizesNoMundo(armadura, ossos, pose).map(posicaoDaMatriz);
}
