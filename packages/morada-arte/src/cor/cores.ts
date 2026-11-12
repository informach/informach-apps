import type { TabelasDaPagina } from "../leitura/pagina";

/**
 * As contas de cor da página de referência, em espaço linear (é onde o three
 * multiplica textura por cor de material e onde o shader das roupas mistura a
 * cor livre).
 */

export type Rgb = [number, number, number];

/** sRGB (0..1) → linear, com as constantes do three. */
export function srgbParaLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : (c * 0.9478672986 + 0.0521327014) ** 2.4;
}

/** Linear (0..1) → sRGB, com as constantes do three. */
export function linearParaSrgb(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * c ** 0.41666 - 0.055;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export const ehHex = (texto: string): boolean => HEX.test(texto);

/** `#rrggbb` → cor linear, como `new THREE.Color(hex)`. */
export function hexParaLinear(hex: string): Rgb {
  if (!HEX.test(hex)) throw new RangeError(`"${hex}" não é uma cor #rrggbb`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [
    srgbParaLinear(((n >> 16) & 255) / 255),
    srgbParaLinear(((n >> 8) & 255) / 255),
    srgbParaLinear((n & 255) / 255),
  ];
}

export const inteiroParaHex = (cor: number): string =>
  `#${cor.toString(16).padStart(6, "0").toUpperCase()}`;

export const luminancia = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Um tom pronto pelo nome, ou a própria cor. */
export function corPeloNome(tabela: Record<string, string>, valor: string): string | null {
  const pronta = tabela[valor];
  if (pronta) return pronta;
  return HEX.test(valor) ? valor : null;
}

export type TomDePele = {
  /** Fator que multiplica a paleta nas partes de pele (`aplicarTom`: tom ÷ REF). */
  pele: Rgb;
  /** Fator cinza que multiplica a paleta nos traços do rosto. */
  rosto: number;
};

export function tomDePele(tabelas: TabelasDaPagina, pele: string): TomDePele | null {
  const hex = corPeloNome(tabelas.TONS, pele);
  if (!hex) return null;
  const tom = hexParaLinear(hex);
  const ref = hexParaLinear(tabelas.REF);
  const tabelado = tabelas.ROSTO[pele];
  // rostoPorLuz: os traços escurecem junto com a pele
  const porLuz = Math.min(Math.max(0.28 + (luminancia(tom) - 0.03) / 0.25, 0.28), 1);
  return {
    pele: [tom[0] / ref[0], tom[1] / ref[1], tom[2] / ref[2]],
    rosto: tabelado ?? porLuz,
  };
}

export type CorLivre = {
  /** A cor escolhida, linear. */
  cor: Rgb;
  /** Luminância linear da cor principal da peça na textura (`mascaras.json`). */
  lum: number;
};

/**
 * O shader das roupas, depois do mapa: onde a máscara vale, a cor escolhida
 * com o sombreado da textura (luminância do pixel ÷ luminância da cor
 * principal); fora dela, a textura como está.
 */
export function comCorLivre(textura: Rgb, mascara: number, livre: CorLivre | null): Rgb {
  if (!livre) return textura;
  const k = luminancia(textura) / Math.max(livre.lum, 0.001);
  return [
    textura[0] + (livre.cor[0] * k - textura[0]) * mascara,
    textura[1] + (livre.cor[1] * k - textura[1]) * mascara,
    textura[2] + (livre.cor[2] * k - textura[2]) * mascara,
  ];
}
