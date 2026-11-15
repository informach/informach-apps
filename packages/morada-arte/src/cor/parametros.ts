import type { Imagem } from "../leitura/imagem";
import { em } from "../numeros";
import { luminancia, type Rgb } from "./cores";
import { corNoPonto, corOriginalDaRoupa, type FonteDeCor, mascaraDaRoupa } from "./pintura";

/** Cor final = original × (1 − máscara) + peso × cor do canal, em espaço linear. */
export type AmostraParametrica = {
  original: Rgb;
  mascara: number;
  peso: Rgb;
};

/**
 * O chamador escolhe explicitamente quais partes têm canal. A fonte conserva
 * a identidade da cor, sem procurar tons parecidos nos pixels ou nos vértices.
 */
export function amostrarParametrosDaCor(
  fonte: FonteDeCor,
  u: number,
  v: number,
): AmostraParametrica {
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error("UV da cor inválido");
  if (fonte.tipo === "lisa") return { original: [1, 1, 1], mascara: 1, peso: [1, 1, 1] };
  if (fonte.tipo === "paleta") {
    const original = corNoPonto({ ...fonte, fator: [1, 1, 1] }, u, v);
    return { original, mascara: 1, peso: [...original] };
  }
  if (!fonte.mascara || !fonte.livre)
    throw new Error("Cor livre parametrizada exige máscara e luminância da peça");
  if (!Number.isFinite(fonte.livre.lum) || fonte.livre.lum < 0)
    throw new Error("Luminância da peça inválida");
  const original = corOriginalDaRoupa(fonte, u, v);
  const mascara = mascaraDaRoupa(fonte, u, v);
  const peso = (luminancia(original) / Math.max(fonte.livre.lum, 0.001)) * mascara;
  return { original, mascara, peso: [peso, peso, peso] };
}

export type ParametrosDosVertices = {
  originais: Float32Array;
  mascaras: Float32Array;
  pesos: Float32Array;
};

/**
 * Perfil opaco: RGB original em sRGB e máscara linear no canal alpha.
 * O material declara o uso e o shader restaura alpha=1 após ler a máscara.
 * Sem redimensionar: textura e máscara mantêm a mesma grade e filtragem.
 */
export function texturaComMascaraDaRoupa(fonte: Extract<FonteDeCor, { tipo: "roupa" }>): Imagem {
  const mascara = fonte.mascara;
  if (!mascara || !fonte.livre) throw new Error("Textura parametrizada exige a máscara original");
  if (
    !Number.isSafeInteger(fonte.imagem.largura) ||
    fonte.imagem.largura < 1 ||
    !Number.isSafeInteger(fonte.imagem.altura) ||
    fonte.imagem.altura < 1 ||
    mascara.largura !== fonte.imagem.largura ||
    mascara.altura !== fonte.imagem.altura ||
    mascara.dados.length !== fonte.imagem.dados.length ||
    fonte.imagem.dados.length !== fonte.imagem.largura * fonte.imagem.altura * 4
  )
    throw new Error("Textura e máscara com grades divergentes");
  const dados = new Uint8Array(fonte.imagem.dados);
  for (let i = 0; i < dados.length; i += 4) dados[i + 3] = em(mascara.dados, i);
  return { ...fonte.imagem, dados };
}

/** A cor própria da malha multiplica ambas as parcelas e conserva seus detalhes. */
export function parametrosDosVertices(
  fonte: FonteDeCor,
  uv: Float32Array | null,
  vertices: number,
  coresDoArquivo: Float32Array | null = null,
): ParametrosDosVertices {
  if (
    !Number.isSafeInteger(vertices) ||
    vertices < 0 ||
    (uv !== null && uv.length !== vertices * 2) ||
    (coresDoArquivo !== null && coresDoArquivo.length !== vertices * 3)
  )
    throw new Error("Atributos da cor parametrizada divergentes");
  const originais = new Float32Array(vertices * 3);
  const mascaras = new Float32Array(vertices);
  const pesos = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    const u = uv ? em(uv, i * 2) : 0;
    const v = uv ? em(uv, i * 2 + 1) : 0;
    const amostra = amostrarParametrosDaCor(fonte, u, v);
    mascaras[i] = amostra.mascara;
    for (let canal = 0; canal < 3; canal++) {
      const fator = coresDoArquivo ? em(coresDoArquivo, i * 3 + canal) : 1;
      if (!Number.isFinite(fator) || fator < 0) throw new Error("Cor de vértice inválida");
      originais[i * 3 + canal] = em(amostra.original, canal) * fator;
      pesos[i * 3 + canal] = em(amostra.peso, canal) * fator;
      if (
        !Number.isFinite(em(originais, i * 3 + canal)) ||
        !Number.isFinite(em(pesos, i * 3 + canal))
      )
        throw new Error("Cor parametrizada fora da faixa float32");
    }
  }
  return { originais, mascaras, pesos };
}
