import type { Corpo, Primitiva } from "../leitura/corpo";
import { em, type Vec3 } from "../numeros";

/**
 * O que some debaixo da roupa: a pele coberta por uma peça (`coberturaDe`), a
 * peça de baixo coberta pela de cima (`camadaCoberta`) e os triângulos que
 * saem do índice (`ocultarPele`), como na página de referência. Lá isso é
 * feito na pose de descanso, uma vez por peça; aqui, uma vez ao empacotar.
 *
 * As contas usam posições "no mundo". Na página, `skeleton.pose()` deixa o
 * corpo girado pelo nó da armadura (90° em X) durante a conta; os raios e as
 * distâncias não mudam com isso, mas a faixa da saia fechada e o eixo das
 * pernas usam os eixos do mundo. Por isso o referencial entra como parâmetro:
 * `referencialDaPagina` reproduz a página tal como ela roda com os corpos do
 * repositório, e `REFERENCIAL_DO_MODELO` (Y para cima) é o que as guias
 * descrevem e o que o empacotador usa.
 */

/** Matriz 4×4 por linhas (12 números: três linhas de quatro). */
export type Referencial = readonly number[];

export const REFERENCIAL_DO_MODELO: Referencial = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** O mundo da página durante a conta: a raiz desce até o chão e o nó da armadura gira o corpo. */
export function referencialDaPagina(corpo: Corpo): Referencial {
  const [x, y, z, w] = corpo.armadura.rotacao;
  const [tx, ty, tz] = corpo.armadura.translacao;
  const [sx, sy, sz] = corpo.armadura.escala;
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y - z * w) * sy,
    2 * (x * z + y * w) * sz,
    tx,
    2 * (x * y + z * w) * sx,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z - x * w) * sz,
    ty - corpo.chao,
    2 * (x * z - y * w) * sx,
    2 * (y * z + x * w) * sy,
    (1 - 2 * (x * x + y * y)) * sz,
    tz,
  ];
}

export function noReferencial(posicoes: Float32Array, m: Referencial): Float64Array {
  const saida = new Float64Array(posicoes.length);
  for (let i = 0; i < posicoes.length; i += 3) {
    const x = em(posicoes, i);
    const y = em(posicoes, i + 1);
    const z = em(posicoes, i + 2);
    saida[i] = em(m, 0) * x + em(m, 1) * y + em(m, 2) * z + em(m, 3);
    saida[i + 1] = em(m, 4) * x + em(m, 5) * y + em(m, 6) * z + em(m, 7);
    saida[i + 2] = em(m, 8) * x + em(m, 9) * y + em(m, 10) * z + em(m, 11);
  }
  return saida;
}

const TAM = 0.05;

type Grade = {
  celulas: Map<string, number[]>;
  /** Nove números por triângulo. */
  tris: number[];
};

const celula = (x: number, y: number, z: number): string =>
  `${Math.floor(x / TAM)},${Math.floor(y / TAM)},${Math.floor(z / TAM)}`;

function novaGrade(): Grade {
  return { celulas: new Map(), tris: [] };
}

function porNaGrade(grade: Grade, P: Float64Array, indices: ArrayLike<number>): void {
  for (let t = 0; t < indices.length; t += 3) {
    const id = grade.tris.length / 9;
    const mn: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const mx: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let k = 0; k < 3; k++) {
      const v = em(indices, t + k) * 3;
      for (let e = 0; e < 3; e++) {
        const valor = em(P, v + e);
        grade.tris.push(valor);
        if (valor < em(mn, e)) mn[e] = valor;
        if (valor > em(mx, e)) mx[e] = valor;
      }
    }
    for (let x = Math.floor(mn[0] / TAM); x <= Math.floor(mx[0] / TAM); x++) {
      for (let y = Math.floor(mn[1] / TAM); y <= Math.floor(mx[1] / TAM); y++) {
        for (let z = Math.floor(mn[2] / TAM); z <= Math.floor(mx[2] / TAM); z++) {
          const k = `${x},${y},${z}`;
          const lista = grade.celulas.get(k);
          if (lista) lista.push(id);
          else grade.celulas.set(k, [id]);
        }
      }
    }
  }
}

/**
 * `Ray.intersectTriangle` do three, sem descartar a face de trás: a distância
 * ao longo do raio até o triângulo, ou `null`.
 */
export function raioNoTriangulo(
  origem: Vec3,
  direcao: Vec3,
  tris: ArrayLike<number>,
  id: number,
): Vec3 | null {
  const b = id * 9;
  const ax = em(tris, b);
  const ay = em(tris, b + 1);
  const az = em(tris, b + 2);
  const e1x = em(tris, b + 3) - ax;
  const e1y = em(tris, b + 4) - ay;
  const e1z = em(tris, b + 5) - az;
  const e2x = em(tris, b + 6) - ax;
  const e2y = em(tris, b + 7) - ay;
  const e2z = em(tris, b + 8) - az;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  let DdN = direcao[0] * nx + direcao[1] * ny + direcao[2] * nz;
  let sinal: number;
  if (DdN > 0) sinal = 1;
  else if (DdN < 0) {
    sinal = -1;
    DdN = -DdN;
  } else return null;
  const dx = origem[0] - ax;
  const dy = origem[1] - ay;
  const dz = origem[2] - az;
  // diff × edge2
  const qx = dy * e2z - dz * e2y;
  const qy = dz * e2x - dx * e2z;
  const qz = dx * e2y - dy * e2x;
  const DdQxE2 = sinal * (direcao[0] * qx + direcao[1] * qy + direcao[2] * qz);
  if (DdQxE2 < 0) return null;
  // edge1 × diff
  const rx = e1y * dz - e1z * dy;
  const ry = e1z * dx - e1x * dz;
  const rz = e1x * dy - e1y * dx;
  const DdE1xQ = sinal * (direcao[0] * rx + direcao[1] * ry + direcao[2] * rz);
  if (DdE1xQ < 0) return null;
  if (DdQxE2 + DdE1xQ > DdN) return null;
  const QdN = -sinal * (dx * nx + dy * ny + dz * nz);
  if (QdN < 0) return null;
  const t = QdN / DdN;
  return [direcao[0] * t + origem[0], direcao[1] * t + origem[1], direcao[2] * t + origem[2]];
}

const distancia = (a: Vec3, b: Vec3): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/** Normais por vértice de uma malha, pela soma das normais de face, normalizadas (em 64 bits). */
function normaisDaMalha(P: Float64Array, indices: ArrayLike<number>): Float64Array {
  const N = new Float64Array(P.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = em(indices, t) * 3;
    const b = em(indices, t + 1) * 3;
    const d = em(indices, t + 2) * 3;
    const ux = em(P, b) - em(P, a);
    const uy = em(P, b + 1) - em(P, a + 1);
    const uz = em(P, b + 2) - em(P, a + 2);
    const vx = em(P, d) - em(P, a);
    const vy = em(P, d + 1) - em(P, a + 1);
    const vz = em(P, d + 2) - em(P, a + 2);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const q of [a, b, d]) {
      N[q] = em(N, q) + nx;
      N[q + 1] = em(N, q + 1) + ny;
      N[q + 2] = em(N, q + 2) + nz;
    }
  }
  for (let i = 0; i < N.length; i += 3) {
    const x = em(N, i);
    const y = em(N, i + 1);
    const z = em(N, i + 2);
    const escala = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    N[i] = x * escala;
    N[i + 1] = y * escala;
    N[i + 2] = z * escala;
  }
  return N;
}

/** Vértices do corpo que são das pernas ou do quadril: o osso de maior peso é coxa, perna, pé ou quadril. */
export function verticesDePerna(corpo: Corpo, malha: Primitiva): Uint8Array {
  const ehPerna = corpo.ossos.map((o) => /(UpLeg|Leg|Foot|ToeBase|Hips)$/.test(o.nome));
  const vertices = malha.posicoes.length / 3;
  const saida = new Uint8Array(vertices);
  for (let i = 0; i < vertices; i++) {
    let osso = 0;
    let maior = -1;
    for (let k = 0; k < 4; k++) {
      const w = em(malha.pesos, i * 4 + k);
      if (w > maior) {
        maior = w;
        osso = em(malha.ossos, i * 4 + k);
      }
    }
    saida[i] = ehPerna[osso] ? 1 : 0;
  }
  return saida;
}

export type MalhaDeCobertura = {
  posicoes: Float32Array;
  indices: ArrayLike<number>;
};

export type PecaQueCobre = MalhaDeCobertura & {
  solta: boolean;
  saiaFechada: boolean;
};

export const escalaDoCorpo = (altura: number): number => Math.max(altura / 1.7, 0.4);

/**
 * Vértices do corpo cobertos por uma peça: um raio pela normal acerta a peça a
 * até 5 cm × escala; com saia, nas pernas, 16 cm × escala, mais um raio
 * horizontal a partir do eixo das pernas e, na saia fechada, toda a faixa
 * entre a barra e o cós.
 */
export function coberturaDaPele(
  corpo: Corpo,
  pele: Primitiva,
  peca: PecaQueCobre,
  referencial: Referencial,
): Uint8Array {
  const Pc = noReferencial(pele.posicoes, referencial);
  const Nc = normaisDaMalha(Pc, pele.indices);
  const vertices = Pc.length / 3;
  const Pp = noReferencial(peca.posicoes, referencial);
  const grade = novaGrade();
  porNaGrade(grade, Pp, peca.indices);
  const esc = escalaDoCorpo(corpo.altura);
  const alcance0 = 0.05 * esc;
  const perna = peca.solta ? verticesDePerna(corpo, pele) : null;
  let faixaSaia: [number, number] | null = null;
  if (perna && peca.saiaFechada) {
    let mn = Number.POSITIVE_INFINITY;
    let mx = Number.NEGATIVE_INFINITY;
    for (let i = 1; i < Pp.length; i += 3) {
      const y = em(Pp, i);
      if (y < mn) mn = y;
      if (y > mx) mx = y;
    }
    faixaSaia = [mn + 0.02 * esc, mx];
  }
  let eixoSaia: { x: number; z: number } | null = null;
  if (perna) {
    let sx = 0;
    let sz = 0;
    let nn = 0;
    for (let i = 0; i < vertices; i++) {
      if (em(perna, i)) {
        sx += em(Pc, i * 3);
        sz += em(Pc, i * 3 + 2);
        nn++;
      }
    }
    if (nn) eixoSaia = { x: sx / nn, z: sz / nn };
  }
  const cob = new Uint8Array(vertices);
  for (let i = 0; i < vertices; i++) {
    const p: Vec3 = [em(Pc, i * 3), em(Pc, i * 3 + 1), em(Pc, i * 3 + 2)];
    const nv: Vec3 = [em(Nc, i * 3), em(Nc, i * 3 + 1), em(Nc, i * 3 + 2)];
    const daPerna = perna !== null && em(perna, i) === 1;
    const alcance = daPerna ? 0.16 * esc : alcance0;
    const celulas = new Set<string>();
    for (let s = 0; s <= alcance + 1e-6; s += TAM / 2) {
      celulas.add(celula(p[0] + nv[0] * s, p[1] + nv[1] * s, p[2] + nv[2] * s));
    }
    if (faixaSaia && daPerna && p[1] > faixaSaia[0] && p[1] < faixaSaia[1]) {
      cob[i] = 1;
      continue;
    }
    if (daPerna && eixoSaia) {
      // dentro do tubo da saia: um raio na horizontal, do eixo do corpo para fora, passando pelo ponto
      let hx = p[0] - eixoSaia.x;
      let hz = p[2] - eixoSaia.z;
      if (hx * hx + hz * hz > 1e-8) {
        const escala = 1 / (Math.sqrt(hx * hx + hz * hz) || 1);
        hx *= escala;
        hz *= escala;
        const h: Vec3 = [hx, 0, hz];
        const cel2 = new Set<string>();
        for (let s = 0; s <= 0.4 * esc; s += TAM / 2) {
          cel2.add(celula(p[0] + h[0] * s, p[1] + h[1] * s, p[2] + h[2] * s));
        }
        busca: for (const k of cel2) {
          for (const id of grade.celulas.get(k) ?? []) {
            if (raioNoTriangulo(p, h, grade.tris, id)) {
              cob[i] = 1;
              break busca;
            }
          }
        }
        if (cob[i]) continue;
      }
    }
    const vistos = new Set<number>();
    busca: for (const k of celulas) {
      for (const id of grade.celulas.get(k) ?? []) {
        if (vistos.has(id)) continue;
        vistos.add(id);
        const alvo = raioNoTriangulo(p, nv, grade.tris, id);
        if (alvo && distancia(alvo, p) <= alcance) {
          cob[i] = 1;
          break busca;
        }
      }
    }
  }
  return cob;
}

/**
 * Vértices de uma peça cobertos pelas de cima: um raio pela normal acerta uma
 * delas a até 4 cm × escala para fora, ou 1 cm × escala para dentro.
 */
export function camadaCoberta(
  altura: number,
  peca: MalhaDeCobertura,
  acima: readonly MalhaDeCobertura[],
  referencial: Referencial,
): Uint8Array {
  const P = noReferencial(peca.posicoes, referencial);
  const N = normaisDaMalha(P, peca.indices);
  const vertices = P.length / 3;
  const grade = novaGrade();
  for (const outra of acima)
    porNaGrade(grade, noReferencial(outra.posicoes, referencial), outra.indices);
  const esc = escalaDoCorpo(altura);
  const res = new Uint8Array(vertices);
  for (let i = 0; i < vertices; i++) {
    const p: Vec3 = [em(P, i * 3), em(P, i * 3 + 1), em(P, i * 3 + 2)];
    const lados: [number, number][] = [
      [1, 0.04 * esc],
      [-1, 0.01 * esc],
    ];
    for (const [sg, alc] of lados) {
      const d: Vec3 = [em(N, i * 3) * sg, em(N, i * 3 + 1) * sg, em(N, i * 3 + 2) * sg];
      const cel = new Set<string>();
      for (let s = 0; s <= alc + 1e-6; s += TAM / 2) {
        cel.add(celula(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s));
      }
      busca: for (const k of cel) {
        for (const id of grade.celulas.get(k) ?? []) {
          const alvo = raioNoTriangulo(p, d, grade.tris, id);
          if (alvo && distancia(alvo, p) <= alc) {
            res[i] = 1;
            break busca;
          }
        }
      }
      if (res[i]) break;
    }
  }
  return res;
}

/** Tira do índice os triângulos com os três vértices cobertos. */
export function semTriangulosCobertos(
  indices: ArrayLike<number>,
  cobertos: Uint8Array,
): Uint32Array {
  const saida: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = em(indices, t);
    const b = em(indices, t + 1);
    const c = em(indices, t + 2);
    if (em(cobertos, a) && em(cobertos, b) && em(cobertos, c)) continue;
    saida.push(a, b, c);
  }
  return Uint32Array.from(saida);
}

/** Camadas de roupa: a de baixo some onde a de cima a cobre. */
export const NIVEL_DA_CAMADA: Readonly<Record<string, number>> = {
  baixo: 0,
  meias: 0,
  cima: 1,
  inteira: 1,
  sobre: 2,
};

export type PecaEmCamada = { id: string; slot: string; cobre: boolean };

/** Quais peças ficam por cima de `peca`, pela regra de `ocultarPele`. */
export function pecasAcima(peca: PecaEmCamada, todas: readonly PecaEmCamada[]): string[] {
  const nivel = NIVEL_DA_CAMADA[peca.slot];
  if (nivel === undefined) return [];
  return todas
    .filter((outra) => {
      const nivelDela = NIVEL_DA_CAMADA[outra.slot];
      if (outra.id === peca.id || nivelDela === undefined || nivelDela <= nivel) return false;
      // a jardineira (inteira que só cobre a parte de baixo) não esconde a calça por baixo dela
      return !(peca.slot === "baixo" && outra.slot === "inteira" && outra.cobre);
    })
    .map((outra) => outra.id);
}
