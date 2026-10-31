/** Cadência de uma repetição, em segundos: descida, pausa no fundo, subida, pausa no topo. */
export interface Cadence {
  down: number;
  bottom: number;
  up: number;
  top: number;
}

export const cycleDuration = (c: Cadence) => c.down + c.bottom + c.up + c.top;

const ease = (x: number) => x * x * (3 - 2 * x);

/** Estado da animação no instante `t` (s) para uma cadência: profundidade 0..1, fase 0..1 e índice do ciclo. */
export function cadenceState(c: Cadence, t: number) {
  const total = cycleDuration(c);
  const cycle = Math.floor(t / total);
  const k = t - cycle * total;
  const bottomStart = c.down;
  const upStart = bottomStart + c.bottom;
  const topStart = upStart + c.up;
  let depth: number;
  if (k < bottomStart) depth = ease(k / c.down);
  else if (k < upStart) depth = 1;
  else if (k < topStart) depth = 1 - ease((k - upStart) / c.up);
  else depth = 0;
  return { depth, phase: (t - cycle * total) / total, cycle };
}

export const cadenceLabel = (c: Cadence) =>
  [c.down, c.bottom, c.up].map((x) => String(x).replace(".", ",")).join("–");
