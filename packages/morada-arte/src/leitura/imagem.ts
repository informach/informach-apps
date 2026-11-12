import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { ErroDeArte } from "../erros";
import { em } from "../numeros";

/** Imagem RGBA de 8 bits, linhas de cima para baixo (como o glTF lê as texturas: v = 0 no alto). */
export type Imagem = {
  arquivo: string;
  largura: number;
  altura: number;
  /** Quatro bytes por pixel. */
  dados: Uint8Array;
};

export function lerPng(caminho: string): Imagem {
  let bytes: Buffer;
  try {
    bytes = readFileSync(caminho);
  } catch {
    throw new ErroDeArte(caminho, "arquivo não encontrado");
  }
  try {
    const png = PNG.sync.read(bytes);
    return {
      arquivo: caminho,
      largura: png.width,
      altura: png.height,
      dados: new Uint8Array(png.data),
    };
  } catch (erro) {
    throw new ErroDeArte(
      caminho,
      `PNG inválido: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

/** PNG RGBA de 8 bits, sem data nem texto: os mesmos pixels dão sempre os mesmos bytes. */
export function escreverPng(imagem: Pick<Imagem, "largura" | "altura" | "dados">): Uint8Array {
  const png = new PNG({ width: imagem.largura, height: imagem.altura });
  png.data = Buffer.from(imagem.dados);
  return new Uint8Array(PNG.sync.write(png, { colorType: 6, deflateLevel: 9, deflateStrategy: 3 }));
}

export type Filtro = "proximo" | "bilinear";
export type Borda = "segura" | "repete";

const naBorda = (i: number, tamanho: number, borda: Borda): number => {
  if (borda === "repete") return ((i % tamanho) + tamanho) % tamanho;
  return Math.min(Math.max(i, 0), tamanho - 1);
};

/**
 * Amostra uma textura no UV do glTF, como a GPU: `proximo` pega o texel que
 * contém o ponto; `bilinear` mistura os quatro em volta, com o centro do texel
 * em (i + 0,5) ÷ tamanho. Cada texel passa por `tabela` (256 valores) antes da
 * mistura: é assim que a GPU trata uma textura sRGB (converte para linear e só
 * depois filtra). Sem tabela, devolve os canais de 0 a 255.
 */
export function amostrar(
  imagem: Imagem,
  u: number,
  v: number,
  filtro: Filtro,
  borda: Borda,
  tabela: ArrayLike<number> | null = null,
): [number, number, number, number] {
  const { largura, altura, dados } = imagem;
  const texel = (x: number, y: number, canal: number): number => {
    const bruto = em(
      dados,
      (naBorda(y, altura, borda) * largura + naBorda(x, largura, borda)) * 4 + canal,
    );
    return tabela ? em(tabela, bruto) : bruto;
  };
  if (filtro === "proximo") {
    const x = Math.floor(u * largura);
    const y = Math.floor(v * altura);
    return [texel(x, y, 0), texel(x, y, 1), texel(x, y, 2), texel(x, y, 3)];
  }
  const fx = u * largura - 0.5;
  const fy = v * altura - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const canal = (c: number): number =>
    (texel(x0, y0, c) * (1 - tx) + texel(x0 + 1, y0, c) * tx) * (1 - ty) +
    (texel(x0, y0 + 1, c) * (1 - tx) + texel(x0 + 1, y0 + 1, c) * tx) * ty;
  return [canal(0), canal(1), canal(2), canal(3)];
}
