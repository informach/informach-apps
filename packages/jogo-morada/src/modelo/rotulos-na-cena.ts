export const MAXIMO_DE_ROTULOS_NA_CENA = 24;
export type RotuloProjetado = {
  id: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  prioridade: number;
  distancia: number;
};
export type RotuloOrganizado = { id: string; x: number; y: number };
export type AreaDaInterface = { x0: number; y0: number; x1: number; y1: number };
type Deslocamento = { coluna: number; linha: number };
const LINHAS = [0, -1, 1, -2, 2, -3, 3];
const COLUNAS = [0, -1, 1];
const MARGEM = 4;

/** Organização visual limitada; as posições e os nomes dos moradores não mudam. */
export class OrganizadorDeRotulos {
  private anteriores = new Map<string, Deslocamento>();

  organizar(
    candidatos: readonly RotuloProjetado[],
    largura: number,
    altura: number,
    areasDaInterface: readonly AreaDaInterface[] = [],
  ): RotuloOrganizado[] {
    if (largura <= 0 || altura <= 0) {
      this.anteriores.clear();
      return [];
    }
    const ordenados = candidatos
      .filter(
        (c) =>
          c.largura > 0 &&
          c.altura > 0 &&
          c.largura + MARGEM * 2 <= largura &&
          c.altura + MARGEM * 2 <= altura,
      )
      .slice()
      .sort(
        (a, b) =>
          b.prioridade - a.prioridade ||
          a.distancia - b.distancia ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, MAXIMO_DE_ROTULOS_NA_CENA);
    const ocupados: { x: number; y: number; largura: number; altura: number }[] = [];
    const proximos = new Map<string, Deslocamento>();
    const resultado: RotuloOrganizado[] = [];
    for (const rotulo of ordenados) {
      const anterior = rotulo.prioridade >= 2 ? undefined : this.anteriores.get(rotulo.id);
      const deslocamentos: Deslocamento[] = anterior ? [anterior] : [];
      for (const coluna of COLUNAS)
        for (const linha of LINHAS) deslocamentos.push({ coluna, linha });
      for (const deslocamento of deslocamentos) {
        const x = Math.max(
          MARGEM + rotulo.largura / 2,
          Math.min(
            largura - MARGEM - rotulo.largura / 2,
            rotulo.x + deslocamento.coluna * (rotulo.largura + MARGEM),
          ),
        );
        const y = Math.max(
          MARGEM + rotulo.altura / 2,
          Math.min(
            altura - MARGEM - rotulo.altura / 2,
            rotulo.y + deslocamento.linha * (rotulo.altura + MARGEM),
          ),
        );
        if (
          areasDaInterface.some(
            (area) =>
              x + rotulo.largura / 2 + MARGEM > area.x0 &&
              x - rotulo.largura / 2 - MARGEM < area.x1 &&
              y + rotulo.altura / 2 + MARGEM > area.y0 &&
              y - rotulo.altura / 2 - MARGEM < area.y1,
          )
        )
          continue;
        if (
          ocupados.some(
            (o) =>
              Math.abs(o.x - x) < (o.largura + rotulo.largura) / 2 + MARGEM &&
              Math.abs(o.y - y) < (o.altura + rotulo.altura) / 2 + MARGEM,
          )
        )
          continue;
        ocupados.push({ x, y, largura: rotulo.largura, altura: rotulo.altura });
        proximos.set(rotulo.id, deslocamento);
        resultado.push({ id: rotulo.id, x, y });
        break;
      }
    }
    this.anteriores = proximos;
    return resultado;
  }

  limpar(): void {
    this.anteriores.clear();
  }
}
