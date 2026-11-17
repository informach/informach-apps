import type { EntradaDeCatalogo } from "@informach/morada-sim/conteudo";

export const ASSENTO_MM = 430;
export const COLCHAO_MM = 520;

export type CaixaDoMovel = {
  centro: [number, number, number];
  tamanho: [number, number, number];
};

/** Geometria local em metros; as superfícies de uso coincidem com `apoio`. */
export function formasDoMovel(entrada: EntradaDeCatalogo | undefined): CaixaDoMovel[] {
  const [x0, z0, x1, z1] = entrada?.pegada ?? [-250, -250, 250, 250];
  const largura = Math.max(20, x1 - x0);
  const fundura = Math.max(20, z1 - z0);
  const altura = Math.max(12, entrada?.altura ?? 500);
  const x = (x0 + x1) / 2;
  const z = (z0 + z1) / 2;
  const caixa = (
    cx: number,
    cy: number,
    cz: number,
    l: number,
    a: number,
    f: number,
  ): CaixaDoMovel => ({
    centro: [cx / 1000, cy / 1000, cz / 1000],
    tamanho: [l / 1000, a / 1000, f / 1000],
  });
  const inteiro = caixa(x, altura / 2, z, largura, altura, fundura);
  const comportamento = entrada?.comportamento;
  if (entrada?.categoria === "camas") {
    const apoio = Math.min(altura, COLCHAO_MM);
    const base = caixa(x, apoio / 2, z, largura, apoio, fundura);
    if (comportamento === "berco") {
      const colchao = Math.round(altura * 0.62);
      const espessura = Math.min(60, largura / 6, fundura / 6);
      return [
        caixa(x, colchao - 60, z, largura, 120, fundura),
        caixa(x0 + espessura / 2, altura / 2, z, espessura, altura, fundura),
        caixa(x1 - espessura / 2, altura / 2, z, espessura, altura, fundura),
        caixa(x, altura / 2, z0 + espessura / 2, largura, altura, espessura),
        caixa(x, altura / 2, z1 - espessura / 2, largura, altura, espessura),
      ];
    }
    if (comportamento === "beliche") {
      const cima = Math.round(altura * 0.62);
      return [
        base,
        caixa(x, cima - 60, z, largura, 120, fundura),
        caixa(x, altura / 2, z0 + 30, largura, altura, 60),
      ];
    }
    return altura <= apoio
      ? [base]
      : [
          base,
          caixa(x, (altura + apoio) / 2, z0 + 40, largura, altura - apoio, Math.min(80, fundura)),
        ];
  }
  if (comportamento === "sofa" || entrada?.categoria === "cadeiras") {
    const assento = Math.min(altura, ASSENTO_MM);
    return altura <= assento
      ? [inteiro]
      : [
          caixa(x, assento / 2, z, largura, assento, fundura),
          caixa(
            x,
            (altura + assento) / 2,
            z0 + 40,
            largura,
            altura - assento,
            Math.min(80, fundura),
          ),
        ];
  }
  return [inteiro];
}
