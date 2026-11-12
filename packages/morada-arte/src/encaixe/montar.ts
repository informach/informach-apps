import { ErroDeArte } from "../erros";
import type { Corpo, Primitiva } from "../leitura/corpo";
import { indiceDoOsso, malhaDoCorpo } from "../leitura/corpo";
import { blocoDoItem, geometriaDaFamilia, type Item } from "../leitura/item";
import type { Familia, Pele } from "../leitura/tabelas";
import { em, item } from "../numeros";
import { posicoesDaPeca } from "./posicoes";

/**
 * Monta uma peça ou um cabelo num corpo: é `prepararPele` e `montarItem` da
 * página de referência, feitos uma vez no empacotador para o navegador só
 * carregar a malha pronta.
 */

export type LigacaoDaPele = {
  corpo: Corpo;
  pele: Pele;
  familia: Familia;
  /** A primitiva de pele do corpo (`<corpo>_corpo`). */
  malha: Primitiva;
  b2g: Uint32Array;
  /** Posições da pele na ordem do Blender, com uma forma do corpo somada (ou nenhuma). */
  posicoes(delta: Float32Array | null): Float64Array;
  /** As formas do corpo (gravidez), na ordem do arquivo. */
  formas: { nome: string; posicoes: Float32Array }[];
  ossoDaCabeca: number;
};

export function prepararPele(corpo: Corpo, pele: Pele, familia: Familia): LigacaoDaPele {
  const malha = malhaDoCorpo(corpo, "corpo")?.primitivas[0];
  if (!malha) throw new ErroDeArte(corpo.arquivo, `não achei a malha ${corpo.id}_corpo`, "meshes");
  const b2g = Uint32Array.from(pele.b2g);
  const nv = b2g.length;
  if (nv !== familia.nv) {
    throw new ErroDeArte(
      corpo.arquivo,
      `a pele tem ${nv} vértices e a malha-base da família ${familia.nome} tem ${familia.nv}`,
      "peles.txt",
    );
  }
  const vertices = malha.posicoes.length / 3;
  for (const g of b2g) {
    if (g >= vertices) {
      throw new ErroDeArte(
        corpo.arquivo,
        `peles.txt aponta para o vértice ${g}, que o corpo não tem`,
        "b2g",
      );
    }
  }
  const posicoes = (delta: Float32Array | null): Float64Array => {
    const P = new Float64Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const g = em(b2g, i) * 3;
      for (let k = 0; k < 3; k++) {
        P[i * 3 + k] = em(malha.posicoes, g + k) + (delta ? em(delta, g + k) : 0);
      }
    }
    return P;
  };
  return {
    corpo,
    pele,
    familia,
    malha,
    b2g,
    posicoes,
    formas: malha.formas.map((f) => ({ nome: f.nome, posicoes: f.posicoes })),
    ossoDaCabeca: indiceDoOsso(corpo, "Head"),
  };
}

export type Pesos = {
  /** Quatro ossos por vértice, pelo índice no esqueleto do corpo. */
  ossos: Uint16Array;
  pesos: Float32Array;
};

export type PecaMontada = {
  id: string;
  tipo: "pele" | "cabeca";
  posicoes: Float32Array;
  normais: Float32Array;
  /** UV já na convenção do glTF (v para baixo). */
  uv: Float32Array;
  indices: Uint32Array;
  /** Faixas do índice por material: [início, quantidade, material]. */
  grupos: [number, number, string][];
  pesos: Pesos;
  /**
   * Só nas peças com saia e pesos próprios (`solta`): os pesos da pele embaixo,
   * que a página usa no lugar dos de pano quando o corpo senta, deita ou agacha.
   */
  pesosDobrado: Pesos | null;
  /** As formas do corpo (gravidez) levadas à peça, como deslocamentos. */
  formas: { nome: string; posicoes: Float32Array }[];
  solta: boolean;
  saiaFechada: boolean;
};

/** `BufferGeometry.computeVertexNormals()` do three para geometria com índice, em 32 bits. */
export function normaisDosVertices(
  posicoes: Float32Array,
  indices: ArrayLike<number>,
): Float32Array {
  const normais = new Float32Array(posicoes.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = em(indices, i) * 3;
    const b = em(indices, i + 1) * 3;
    const c = em(indices, i + 2) * 3;
    const cbx = em(posicoes, c) - em(posicoes, b);
    const cby = em(posicoes, c + 1) - em(posicoes, b + 1);
    const cbz = em(posicoes, c + 2) - em(posicoes, b + 2);
    const abx = em(posicoes, a) - em(posicoes, b);
    const aby = em(posicoes, a + 1) - em(posicoes, b + 1);
    const abz = em(posicoes, a + 2) - em(posicoes, b + 2);
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    // o three lê as três normais antes de gravar qualquer uma
    const lidas = [a, b, c].map(
      (v) => [em(normais, v), em(normais, v + 1), em(normais, v + 2)] as const,
    );
    [a, b, c].forEach((v, k) => {
      const lida = item(lidas, k);
      normais[v] = lida[0] + nx;
      normais[v + 1] = lida[1] + ny;
      normais[v + 2] = lida[2] + nz;
    });
  }
  for (let i = 0; i < normais.length; i += 3) {
    const x = em(normais, i);
    const y = em(normais, i + 1);
    const z = em(normais, i + 2);
    const escala = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    normais[i] = x * escala;
    normais[i + 1] = y * escala;
    normais[i + 2] = z * escala;
  }
  return normais;
}

function pesosDaPeleEmbaixo(
  ligacao: LigacaoDaPele,
  tri: Uint16Array,
  bar: Uint16Array,
  nv: number,
): Pesos {
  const { malha, b2g, familia } = ligacao;
  const ossos = new Uint16Array(nv * 4);
  const pesos = new Float32Array(nv * 4);
  for (let j = 0; j < nv; j++) {
    const t = em(tri, j) * 3;
    const w = [em(bar, j * 2) / 65535, em(bar, j * 2 + 1) / 65535];
    w.push(1 - em(w, 0) - em(w, 1));
    const acumulado = new Map<number, number>();
    for (let q = 0; q < 3; q++) {
      const gv = em(b2g, em(familia.tris, t + q));
      for (let k = 0; k < 4; k++) {
        const osso = em(malha.ossos, gv * 4 + k);
        const x = em(malha.pesos, gv * 4 + k) * em(w, q);
        if (x > 0) acumulado.set(osso, (acumulado.get(osso) ?? 0) + x);
      }
    }
    const maiores = [...acumulado.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const total = maiores.reduce((s, x) => s + x[1], 0) || 1;
    maiores.forEach(([osso, x], k) => {
      ossos[j * 4 + k] = osso;
      pesos[j * 4 + k] = x / total;
    });
  }
  return { ossos, pesos };
}

export type OpcoesDeMontagem = {
  /** Cabelo, barba e bigode trocam o material do arquivo por `Cabelo` (cor livre). */
  cabelo: boolean;
};

export function montarItem(
  ligacao: LigacaoDaPele,
  peca: Item,
  opcoes: OpcoesDeMontagem,
): PecaMontada {
  const { cabecalho, arquivo } = peca;
  const fam = ligacao.familia.nome;
  if (!cabecalho.familias[fam]) {
    throw new ErroDeArte(
      arquivo,
      `a peça não foi encaixada na família ${fam} (corpo ${ligacao.corpo.id})`,
      "familias",
    );
  }
  if (cabecalho.tipo === "mao") {
    throw new ErroDeArte(
      arquivo,
      "objeto de mão ainda não é montado pelo empacotador (pegada, contato da palma e pose de segurar)",
      "tipo",
    );
  }
  const geometria = geometriaDaFamilia(peca, fam);
  const nv = geometria.nv;
  const indices = Uint32Array.from(geometria.indices);
  let posicoes: Float32Array;
  let pesos: Pesos;
  let pesosDobrado: Pesos | null = null;
  let formas: PecaMontada["formas"] = [];

  if (cabecalho.tipo === "pele") {
    const tri = blocoDoItem(peca, `${fam}_tri`, Uint16Array);
    const bar = blocoDoItem(peca, `${fam}_bar`, Uint16Array);
    const off = blocoDoItem(peca, `${fam}_off`, Int16Array);
    for (const t of tri) {
      if (t * 3 + 2 >= ligacao.familia.tris.length) {
        throw new ErroDeArte(
          arquivo,
          `triângulo ${t} fora da malha-base ${fam}`,
          `blocos.${fam}_tri`,
        );
      }
    }
    const liga = { tri, bar, off, indices: geometria.indices };
    posicoes = posicoesDaPeca(ligacao.posicoes(null), ligacao.familia, liga);
    formas = ligacao.formas.map((forma) => {
      const pk = posicoesDaPeca(ligacao.posicoes(forma.posicoes), ligacao.familia, liga);
      for (let i = 0; i < pk.length; i++) pk[i] = em(pk, i) - em(posicoes, i);
      return { nome: forma.nome, posicoes: pk };
    });
    // pesos: os dos três vértices da pele, pelas baricêntricas (os 4 maiores); peças com pesos próprios
    // (saia como pano, barra da blusa sem as coxas) trazem os delas
    const daPele = pesosDaPeleEmbaixo(ligacao, tri, bar, nv);
    const po = peca.blocos.get(`${fam}_osso`);
    const pp = peca.blocos.get(`${fam}_peso`);
    const nomes = ligacao.corpo.ossos.map((o) => o.nome);
    const mapa = (cabecalho.ossos ?? []).map((nome) => nomes.indexOf(nome));
    if (po && pp && mapa.every((x) => x >= 0)) {
      const proprios: Pesos = { ossos: new Uint16Array(nv * 4), pesos: new Float32Array(nv * 4) };
      for (let j = 0; j < nv * 4; j++) {
        const osso = mapa[em(po, j)];
        if (osso === undefined) {
          throw new ErroDeArte(
            arquivo,
            `osso ${em(po, j)} fora da lista de ossos`,
            `blocos.${fam}_osso`,
          );
        }
        proprios.ossos[j] = osso;
        proprios.pesos[j] = em(pp, j) / 255;
      }
      pesos = proprios;
      if (cabecalho.solta) pesosDobrado = daPele;
    } else {
      pesos = daPele;
    }
  } else {
    const nrm = blocoDoItem(peca, `${fam}_pos`, Float32Array);
    const [hmin, hmax] = ligacao.pele.cabeca;
    const M = ligacao.pele.afim;
    posicoes = new Float32Array(nv * 3);
    pesos = { ossos: new Uint16Array(nv * 4), pesos: new Float32Array(nv * 4) };
    for (let j = 0; j < nv; j++) {
      const q = [0, 1, 2].map(
        (k) => em(hmin, k) + em(nrm, j * 3 + k) * (em(hmax, k) - em(hmin, k)),
      );
      for (let r = 0; r < 3; r++) {
        const linha = item(M, r);
        posicoes[j * 3 + r] =
          linha[0] * em(q, 0) + linha[1] * em(q, 1) + linha[2] * em(q, 2) + linha[3];
      }
      pesos.ossos[j * 4] = ligacao.ossoDaCabeca;
      pesos.pesos[j * 4] = 1;
    }
  }

  // UV do Blender (v para cima) → glTF (v para baixo), como as texturas são carregadas
  const uvBruto = geometria.uv;
  const uv =
    uvBruto instanceof Uint16Array
      ? Float32Array.from(uvBruto, (x) => x / 65535)
      : Float32Array.from(uvBruto);
  for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - em(uv, i);

  return {
    id: cabecalho.id,
    tipo: cabecalho.tipo,
    posicoes,
    normais: normaisDosVertices(posicoes, indices),
    uv,
    indices,
    grupos: geometria.grupos.map(([ini, n, material]) => [
      ini,
      n,
      opcoes.cabelo ? "Cabelo" : material,
    ]),
    pesos,
    pesosDobrado,
    formas,
    solta: cabecalho.solta === true,
    saiaFechada: cabecalho.saia_fechada === true,
  };
}
