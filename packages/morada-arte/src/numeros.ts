/**
 * Leitura de vetores numéricos com o índice conferido. As contas do encaixe
 * indexam vetores o tempo todo; um índice fora do vetor é sempre um arquivo
 * inconsistente, e aqui ele vira erro em vez de `NaN` espalhado pela malha.
 */
export function em(vetor: ArrayLike<number>, indice: number): number {
  const valor = vetor[indice];
  if (valor === undefined) {
    throw new RangeError(`índice ${indice} fora do vetor de ${vetor.length} posições`);
  }
  return valor;
}

/** Item de uma lista, com o índice conferido. */
export function item<T>(lista: readonly T[], indice: number): T {
  const valor = lista[indice];
  if (valor === undefined) {
    throw new RangeError(`índice ${indice} fora da lista de ${lista.length} itens`);
  }
  return valor;
}

export type Vec3 = [number, number, number];

export function vec3De(vetor: ArrayLike<number>, indice: number): Vec3 {
  const b = indice * 3;
  return [em(vetor, b), em(vetor, b + 1), em(vetor, b + 2)];
}

export const soma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const menos = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vezes = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const escalar = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vetorial = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norma = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function unitario(a: Vec3): Vec3 {
  const n = norma(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}
