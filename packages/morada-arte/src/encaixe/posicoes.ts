import type { Familia } from "../leitura/tabelas";
import { em, item } from "../numeros";

/**
 * A conta que põe uma peça de roupa sobre a pele de um corpo. É a de
 * `posicoesPeca`, `normaisDe` e `vizinhosDe` da página de referência
 * (`paginas/tipos_de_corpo/corpos.html`), passo a passo e com os mesmos tipos
 * numéricos (pele em 64 bits, saída e acumuladores em 32 bits, mesma ordem de
 * soma), para o resultado sair igual ao da página, número por número.
 */

/** Normais dos vértices da pele: soma das normais de face (pela área), normalizada. */
export function normaisDaPele(
  pele: Float64Array,
  tris: Uint32Array,
  vertices: number,
): Float64Array {
  const normais = new Float64Array(vertices * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = em(tris, t) * 3;
    const b = em(tris, t + 1) * 3;
    const d = em(tris, t + 2) * 3;
    const ux = em(pele, b) - em(pele, a);
    const uy = em(pele, b + 1) - em(pele, a + 1);
    const uz = em(pele, b + 2) - em(pele, a + 2);
    const vx = em(pele, d) - em(pele, a);
    const vy = em(pele, d + 1) - em(pele, a + 1);
    const vz = em(pele, d + 2) - em(pele, a + 2);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const q of [a, b, d]) {
      normais[q] = em(normais, q) + nx;
      normais[q + 1] = em(normais, q + 1) + ny;
      normais[q + 2] = em(normais, q + 2) + nz;
    }
  }
  for (let i = 0; i < vertices; i++) {
    const l = Math.hypot(em(normais, i * 3), em(normais, i * 3 + 1), em(normais, i * 3 + 2)) || 1;
    normais[i * 3] = em(normais, i * 3) / l;
    normais[i * 3 + 1] = em(normais, i * 3 + 1) / l;
    normais[i * 3 + 2] = em(normais, i * 3 + 2) / l;
  }
  return normais;
}

const vizinhosPorFamilia = new WeakMap<Familia, Int32Array[]>();

/** Vizinhos de cada vértice da malha-base, na ordem em que aparecem nos triângulos. */
export function vizinhosDaFamilia(familia: Familia): Int32Array[] {
  const prontos = vizinhosPorFamilia.get(familia);
  if (prontos) return prontos;
  const tris = familia.tris;
  let vertices = 0;
  for (const v of tris) vertices = Math.max(vertices, v);
  vertices += 1;
  const conjuntos = Array.from({ length: vertices }, () => new Set<number>());
  for (let t = 0; t < tris.length; t += 3) {
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        if (a !== b) item(conjuntos, em(tris, t + a)).add(em(tris, t + b));
      }
    }
  }
  const vizinhos = conjuntos.map((c) => Int32Array.from(c));
  vizinhosPorFamilia.set(familia, vizinhos);
  return vizinhos;
}

export type LigacaoDaPeca = {
  /** Triângulo da malha-base de cada ponto. */
  tri: Uint16Array;
  /** Duas baricêntricas por ponto, em 1/65535. */
  bar: Uint16Array;
  /** Deslocamento no referencial do triângulo, em passos de 0,05 mm. */
  off: Int16Array;
  /** Índice dos triângulos da peça (para espalhar a folga entre vizinhos). */
  indices: ArrayLike<number> | null;
};

/**
 * Posições de uma peça `pele` sobre a pele `P` (vértices na ordem do Blender,
 * no espaço da malha do corpo). Devolve três números por ponto da peça.
 */
export function posicoesDaPeca(
  pele: Float64Array,
  familia: Familia,
  ligacao: LigacaoDaPeca,
): Float32Array {
  const T = familia.tris;
  const A = familia.areas;
  const { tri, bar, off, indices } = ligacao;
  const P = pele;
  const N = normaisDaPele(P, T, P.length / 3);
  const n = tri.length;
  const saida = new Float32Array(n * 3);
  // quanto a folga empurrou cada ponto (suavizado no fim)
  const empurra = new Float32Array(n * 3);
  const vizinhosDaPele = vizinhosDaFamilia(familia);
  for (let j = 0; j < n; j++) {
    const t = em(tri, j) * 3;
    const ia = em(T, t) * 3;
    const ib = em(T, t + 1) * 3;
    const ic = em(T, t + 2) * 3;
    const b0 = em(bar, j * 2) / 65535;
    const b1 = em(bar, j * 2 + 1) / 65535;
    const b2 = 1 - b0 - b1;
    const p = [0, 1, 2].map((k) => b0 * em(P, ia + k) + b1 * em(P, ib + k) + b2 * em(P, ic + k));
    let nn = [0, 1, 2].map((k) => b0 * em(N, ia + k) + b1 * em(N, ib + k) + b2 * em(N, ic + k));
    const ln = Math.hypot(...nn) || 1;
    nn = nn.map((x) => x / ln);
    let e1 = [0, 1, 2].map((k) => em(P, ib + k) - em(P, ia + k));
    const d1 = em(e1, 0) * em(nn, 0) + em(e1, 1) * em(nn, 1) + em(e1, 2) * em(nn, 2);
    e1 = e1.map((x, k) => x - em(nn, k) * d1);
    const l1 = Math.hypot(...e1) || 1;
    e1 = e1.map((x) => x / l1);
    const e2 = [
      em(nn, 1) * em(e1, 2) - em(nn, 2) * em(e1, 1),
      em(nn, 2) * em(e1, 0) - em(nn, 0) * em(e1, 2),
      em(nn, 0) * em(e1, 1) - em(nn, 1) * em(e1, 0),
    ];
    const u = [0, 1, 2].map((k) => em(P, ib + k) - em(P, ia + k));
    const v = [0, 1, 2].map((k) => em(P, ic + k) - em(P, ia + k));
    const area =
      0.5 *
      Math.hypot(
        em(u, 1) * em(v, 2) - em(u, 2) * em(v, 1),
        em(u, 2) * em(v, 0) - em(u, 0) * em(v, 2),
        em(u, 0) * em(v, 1) - em(u, 1) * em(v, 0),
      );
    const s = Math.sqrt(area / Math.max(em(A, em(tri, j)), 1e-12));
    const o0 = em(off, j * 3) * 0.00005 * s;
    const o1 = em(off, j * 3 + 1) * 0.00005 * s;
    const o2 = em(off, j * 3 + 2) * 0.00005 * s;
    const g = [0, 1, 2].map((k) => em(p, k) + em(e1, k) * o0 + em(e2, k) * o1 + em(nn, k) * o2);
    // folga: nenhum vértice da pele em volta (o triângulo e os vizinhos) fica a menos de 4 mm da peça,
    // medido pela normal
    if (o2 > 0) {
      const c = Math.min(0.004 * s, 0.85 * o2);
      const lmax = 2.5 * Math.sqrt(area);
      for (const q of [em(T, t), em(T, t + 1), em(T, t + 2)]) {
        for (const r of item(vizinhosDaPele, q)) {
          const dx = em(P, r * 3) - em(g, 0);
          const dy = em(P, r * 3 + 1) - em(g, 1);
          const dz = em(P, r * 3 + 2) - em(g, 2);
          const h = dx * em(nn, 0) + dy * em(nn, 1) + dz * em(nn, 2);
          if (h <= -c) continue;
          const lx = dx - h * em(nn, 0);
          const ly = dy - h * em(nn, 1);
          const lz = dz - h * em(nn, 2);
          if (Math.hypot(lx, ly, lz) > lmax) continue;
          for (let k = 0; k < 3; k++) {
            g[k] = em(g, k) + em(nn, k) * (h + c);
            empurra[j * 3 + k] = em(empurra, j * 3 + k) + em(nn, k) * (h + c);
          }
        }
      }
    }
    saida[j * 3] = em(g, 0);
    saida[j * 3 + 1] = em(g, 1);
    saida[j * 3 + 2] = em(g, 2);
  }
  // o empurrão da folga se espalha entre os vizinhos (a peça se afasta como um pano); as cópias de um
  // ponto (costura de UV) andam juntas
  if (indices && n) {
    const chave = new Map<number, number>();
    const grupo = new Int32Array(n);
    for (let j = 0; j < n; j++) {
      const k = em(tri, j) * 4294967296 + em(bar, j * 2) * 65536 + em(bar, j * 2 + 1);
      let g = chave.get(k);
      if (g === undefined) {
        g = chave.size;
        chave.set(k, g);
      }
      grupo[j] = g;
    }
    const ng = chave.size;
    const viz = Array.from({ length: ng }, () => new Set<number>());
    for (let i = 0; i < indices.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const x = em(grupo, em(indices, i + a));
        const y = em(grupo, em(indices, i + ((a + 1) % 3)));
        if (x !== y) {
          item(viz, x).add(y);
          item(viz, y).add(x);
        }
      }
    }
    let E = new Float32Array(ng * 3);
    const cnt = new Float32Array(ng);
    for (let j = 0; j < n; j++) {
      const gj = em(grupo, j);
      for (let k = 0; k < 3; k++) E[gj * 3 + k] = em(E, gj * 3 + k) + em(empurra, j * 3 + k);
      cnt[gj] = em(cnt, gj) + 1;
    }
    for (let q = 0; q < ng; q++) {
      for (let k = 0; k < 3; k++) E[q * 3 + k] = em(E, q * 3 + k) / (em(cnt, q) || 1);
    }
    for (let it = 0; it < 8; it++) {
      const E2 = new Float32Array(ng * 3);
      for (let q = 0; q < ng; q++) {
        const vs = item(viz, q);
        if (!vs.size) {
          for (let k = 0; k < 3; k++) E2[q * 3 + k] = em(E, q * 3 + k);
          continue;
        }
        const m = [0, 0, 0];
        for (const r of vs) for (let k = 0; k < 3; k++) m[k] = em(m, k) + em(E, r * 3 + k);
        for (let k = 0; k < 3; k++)
          E2[q * 3 + k] = 0.5 * em(E, q * 3 + k) + (0.5 * em(m, k)) / vs.size;
      }
      E = E2;
    }
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < 3; k++) {
        saida[j * 3 + k] =
          em(saida, j * 3 + k) + (em(E, em(grupo, j) * 3 + k) - em(empurra, j * 3 + k));
      }
    }
    // pontos dobrados: só quem está longe da média dos vizinhos, em relação ao tamanho das arestas, vai
    // para perto dela; o pano liso não muda
    const G = new Float32Array(ng * 3);
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < 3; k++) G[em(grupo, j) * 3 + k] = em(saida, j * 3 + k);
    }
    for (let it = 0; it < 3; it++) {
      const G2 = G.slice();
      for (let q = 0; q < ng; q++) {
        const vs = item(viz, q);
        if (vs.size < 3) continue;
        const m = [0, 0, 0];
        let el = 0;
        for (const r of vs) {
          for (let k = 0; k < 3; k++) m[k] = em(m, k) + em(G, r * 3 + k);
          el += Math.hypot(
            em(G, r * 3) - em(G, q * 3),
            em(G, r * 3 + 1) - em(G, q * 3 + 1),
            em(G, r * 3 + 2) - em(G, q * 3 + 2),
          );
        }
        for (let k = 0; k < 3; k++) m[k] = em(m, k) / vs.size;
        el /= vs.size;
        const L = [
          em(m, 0) - em(G, q * 3),
          em(m, 1) - em(G, q * 3 + 1),
          em(m, 2) - em(G, q * 3 + 2),
        ];
        const lL = Math.hypot(...L);
        if (lL > 0.45 * el) {
          const f = (0.8 * (lL - 0.45 * el)) / lL;
          for (let k = 0; k < 3; k++) G2[q * 3 + k] = em(G2, q * 3 + k) + em(L, k) * f;
        }
      }
      G.set(G2);
    }
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < 3; k++) saida[j * 3 + k] = em(G, em(grupo, j) * 3 + k);
    }
  }
  return saida;
}
