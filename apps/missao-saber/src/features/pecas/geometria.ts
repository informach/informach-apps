import type {
  Celula,
  PecaMalha,
  PecaPlana,
  PecaSolida,
  Ponto,
  PoseMalha,
  PosePlana,
  PoseSolida,
  Vetor3,
} from "./tipos";

type Matriz3 = readonly [Vetor3, Vetor3, Vetor3];

const multiplicar = (m: Matriz3, v: Vetor3): Vetor3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
/** a · b: cada linha de `a` aplicada às colunas de `b`. */
const compor = (a: Matriz3, b: Matriz3): Matriz3 => {
  const coluna = (j: 0 | 1 | 2): Vetor3 => [b[0][j], b[1][j], b[2][j]];
  const linha = (l: Vetor3): Vetor3 => {
    const [c0, c1, c2] = [coluna(0), coluna(1), coluna(2)];
    return [
      l[0] * c0[0] + l[1] * c0[1] + l[2] * c0[2],
      l[0] * c1[0] + l[1] * c1[1] + l[2] * c1[2],
      l[0] * c2[0] + l[1] * c2[1] + l[2] * c2[2],
    ];
  };
  return [linha(a[0]), linha(a[1]), linha(a[2])];
};

const identidade: Matriz3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Giros de 90° em torno de cada eixo, no sentido anti-horário. */
export const giroX: Matriz3 = [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];
export const giroY: Matriz3 = [
  [0, 0, 1],
  [0, 1, 0],
  [-1, 0, 0],
];
export const giroZ: Matriz3 = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, 1],
];

/**
 * Os 24 giros do cubo numa ordem fixa: o índice é o que a pose guarda, então a
 * ordem não pode mudar depois de publicada (montagens enviadas a usam).
 */
export const giros3: readonly Matriz3[] = (() => {
  const vistos = new Map<string, Matriz3>();
  const fila: Matriz3[] = [identidade];
  while (fila.length) {
    const m = fila.shift() as Matriz3;
    const chave = JSON.stringify(m);
    if (vistos.has(chave)) continue;
    vistos.set(chave, m);
    for (const g of [giroX, giroY, giroZ]) fila.push(compor(g, m));
  }
  return [...vistos.values()];
})();

/** Índice do giro resultante de aplicar `g` depois do giro `o`. */
export function girar3(o: number, g: Matriz3) {
  const alvo = JSON.stringify(compor(g, giros3[o] ?? identidade));
  return giros3.findIndex((m) => JSON.stringify(m) === alvo);
}

/** Plano: o = k + 4·espelho, com k quartos de volta depois do espelho em x. */
export function orientacaoPlana(o: number): Matriz3 {
  const k = o % 4;
  const espelho = o >= 4;
  let m: Matriz3 = espelho
    ? [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
    : identidade;
  for (let i = 0; i < k; i += 1) m = compor(giroZ, m);
  return m;
}
export function girarPlano(o: number) {
  return (o % 4 === 3 ? o - 3 : o + 1) as number;
}
export function espelharPlano(o: number) {
  // Virar do avesso por um eixo fixo da mesa: espelho seguido do mesmo giro
  // equivale a inverter o sentido do giro.
  const k = o % 4;
  return o >= 4 ? (4 - k) % 4 : 4 + ((4 - k) % 4);
}

export function celulasNaPose(peca: PecaMalha, pose: PoseMalha, plano: boolean): Celula[] {
  const m = plano ? orientacaoPlana(pose.o) : (giros3[pose.o] ?? identidade);
  return peca.celulas.map((c) => {
    const r = multiplicar(m, c);
    return [r[0] + pose.x, r[1] + pose.y, r[2] + pose.z] as const;
  });
}
export const chaveCelula = (c: Celula) => `${c[0]},${c[1]},${c[2]}`;

/** Centro da peça já girada, para girar "no lugar" na interface. */
export function centroMalha(peca: PecaMalha, pose: PoseMalha, plano: boolean): Vetor3 {
  const cs = celulasNaPose(peca, pose, plano);
  const soma = cs.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]] as const, [
    0, 0, 0,
  ] as Vetor3);
  return [soma[0] / cs.length, soma[1] / cs.length, soma[2] / cs.length];
}

/* ---------- plano livre ---------- */

export function transformarPonto(p: Ponto, pose: PosePlana): Ponto {
  const x = pose.espelho ? -p[0] : p[0];
  const a = (pose.angulo * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - p[1] * s + pose.x, x * s + p[1] * c + pose.y];
}
function areaComSinal(poly: readonly Ponto[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i] as Ponto;
    const q = poly[(i + 1) % poly.length] as Ponto;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
/** Partes convexas em sentido anti-horário (o espelho inverte o sentido). */
export function antiHorario(poly: readonly Ponto[]): Ponto[] {
  return areaComSinal(poly) < 0 ? [...poly].reverse() : [...poly];
}
export function area(poly: readonly Ponto[]) {
  return Math.abs(areaComSinal(poly));
}
export function partesNaPose(peca: PecaPlana, pose: PosePlana): Ponto[][] {
  return peca.partes.map((parte) => antiHorario(parte.map((p) => transformarPonto(p, pose))));
}

/**
 * Distância com sinal até a borda de um polígono convexo anti-horário:
 * positiva dentro, negativa fora (exata dentro; fora, uma cota inferior que
 * basta para decidir a faixa de tolerância).
 */
export function distanciaConvexa(poly: readonly Ponto[], p: Ponto) {
  let menor = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as Ponto;
    const b = poly[(i + 1) % poly.length] as Ponto;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const comprimento = Math.hypot(dx, dy);
    if (comprimento < 1e-12) continue;
    menor = Math.min(menor, (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / comprimento);
  }
  return menor;
}
/** Profundidade de um ponto numa união de partes convexas. */
export function profundidade(partes: readonly (readonly Ponto[])[], p: Ponto) {
  let maior = Number.NEGATIVE_INFINITY;
  for (const parte of partes) maior = Math.max(maior, distanciaConvexa(parte, p));
  return maior;
}

function projetar(poly: readonly Ponto[], eixo: Ponto): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    const v = p[0] * eixo[0] + p[1] * eixo[1];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}
/** Quanto dois convexos se interpenetram (0 quando só se tocam ou estão separados). */
export function penetracao(a: readonly Ponto[], b: readonly Ponto[]) {
  let menor = Number.POSITIVE_INFINITY;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i] as Ponto;
      const q = poly[(i + 1) % poly.length] as Ponto;
      const nx = -(q[1] - p[1]);
      const ny = q[0] - p[0];
      const n = Math.hypot(nx, ny);
      if (n < 1e-12) continue;
      const eixo: Ponto = [nx / n, ny / n];
      const [a0, a1] = projetar(a, eixo);
      const [b0, b1] = projetar(b, eixo);
      const sobreposto = Math.min(a1, b1) - Math.max(a0, b0);
      if (sobreposto <= 0) return 0;
      menor = Math.min(menor, sobreposto);
    }
  return menor;
}
export function pecasSeSobrepoem(a: Ponto[][], b: Ponto[][], folga = 1e-3) {
  return a.some((pa) => b.some((pb) => penetracao(pa, pb) > folga));
}

/* ---------- espaço livre ---------- */

/** Planos das faces de um convexo pelos vértices: normal para fora e deslocamento. */
export function planosConvexos(vertices: readonly Vetor3[]) {
  const planos: { n: Vetor3; d: number }[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i += 1)
    for (let j = i + 1; j < n; j += 1)
      for (let k = j + 1; k < n; k += 1) {
        const a = vertices[i] as Vetor3;
        const b = vertices[j] as Vetor3;
        const c = vertices[k] as Vetor3;
        const u: Vetor3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v: Vetor3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let normal: Vetor3 = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const tamanho = Math.hypot(...normal);
        if (tamanho < 1e-9) continue;
        normal = [normal[0] / tamanho, normal[1] / tamanho, normal[2] / tamanho];
        let d = normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2];
        let acima = 0;
        let abaixo = 0;
        for (const p of vertices) {
          const s = normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2] - d;
          if (s > 1e-9) acima += 1;
          else if (s < -1e-9) abaixo += 1;
        }
        if (acima && abaixo) continue;
        if (acima) {
          normal = [-normal[0], -normal[1], -normal[2]];
          d = -d;
        }
        if (
          !planos.some(
            (q) =>
              Math.abs(q.d - d) < 1e-9 &&
              q.n.every((x, t) => Math.abs(x - (normal[t] ?? 0)) < 1e-9),
          )
        )
          planos.push({ n: normal, d });
      }
  return planos;
}
/** Distância com sinal até a borda de um convexo: positiva dentro. */
export function distanciaSolida(planos: { n: Vetor3; d: number }[], p: Vetor3) {
  let menor = Number.POSITIVE_INFINITY;
  for (const { n, d } of planos)
    menor = Math.min(menor, d - (n[0] * p[0] + n[1] * p[1] + n[2] * p[2]));
  return menor;
}
export function verticesNaPose(peca: PecaSolida, pose: PoseSolida): Vetor3[] {
  const m = giros3[pose.o] ?? identidade;
  return peca.vertices.map((v) => {
    const r = multiplicar(m, v);
    return [r[0] + pose.x, r[1] + pose.y, r[2] + pose.z] as const;
  });
}
