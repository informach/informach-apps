import { describe, expect, it } from "vitest";
import {
  MAXIMO_DE_ROTULOS_NA_CENA,
  OrganizadorDeRotulos,
  type RotuloProjetado,
} from "./rotulos-na-cena";

const rotulo = (id: string, dados: Partial<RotuloProjetado> = {}): RotuloProjetado => ({
  id,
  x: 195,
  y: 550,
  largura: 112,
  altura: 24,
  prioridade: 0,
  distancia: 10,
  ...dados,
});
describe("nomes sem sobreposição na câmera", () => {
  it("traz para dentro a âncora fora da borda de um corpo visível sem cobrir o painel", () => {
    const nomes = new OrganizadorDeRotulos().organizar(
      [
        rotulo("a", { x: 410, y: 550 }),
        rotulo("b", { x: 430, y: 580 }),
        rotulo("c", { x: 420, y: 680 }),
      ],
      390,
      844,
      [{ x0: 12, y0: 647, x1: 378, y1: 832 }],
    );
    expect(nomes).toHaveLength(3);
    for (const nome of nomes) {
      expect(nome.x).toBeLessThanOrEqual(330);
      expect(nome.y + 12 + 4).toBeLessThanOrEqual(647);
    }
  });
  it("mantém os nomes acima do painel compacto e libera a área quando o painel fecha", () => {
    const organizador = new OrganizadorDeRotulos();
    const candidatos = [rotulo("a", { y: 645 }), rotulo("b", { y: 645 })];
    const areas = [{ x0: 12, y0: 647, x1: 378, y1: 832 }];
    const resultado = organizador.organizar(candidatos, 390, 844, areas);
    expect(resultado).toHaveLength(2);
    for (const r of resultado) expect(r.y + 12 + 4).toBeLessThanOrEqual(647);
    const livres = organizador.organizar([rotulo("a", { y: 645, prioridade: 2 })], 390, 844);
    expect(livres).toEqual([{ id: "a", x: 195, y: 645 }]);
  });

  it("não põe nome sobre um painel que ocupa todo o espaço disponível", () => {
    expect(
      new OrganizadorDeRotulos().organizar([rotulo("a")], 390, 844, [
        { x0: 0, y0: 0, x1: 390, y1: 844 },
      ]),
    ).toEqual([]);
  });
  it("organiza quatro nomes no celular sem mover os moradores e conserva a posição em quadros iguais", () => {
    const organizador = new OrganizadorDeRotulos();
    const candidatos = ["a", "b", "c", "d"].map((id) => rotulo(id));
    const antes = structuredClone(candidatos);
    const nomes = organizador.organizar(candidatos, 390, 844);
    expect(nomes).toHaveLength(4);
    for (let i = 0; i < nomes.length; i++)
      for (let j = i + 1; j < nomes.length; j++) {
        const a = nomes[i],
          b = nomes[j];
        if (!a || !b) throw new Error("Nome ausente");
        expect(Math.abs(a.x - b.x) >= 116 || Math.abs(a.y - b.y) >= 28).toBe(true);
      }
    expect(organizador.organizar(candidatos, 390, 844)).toEqual(nomes);
    expect(candidatos).toEqual(antes);
    const movidos = candidatos.map((c) => ({ ...c, x: c.x + 1 }));
    expect(organizador.organizar(movidos, 390, 844)).toEqual(
      nomes.map((n) => ({ ...n, x: n.x + 1 })),
    );
  });

  it("mantém os nomes inteiros na borda e libera a posição de quem saiu", () => {
    const organizador = new OrganizadorDeRotulos();
    const entradas = [rotulo("a", { x: 0, y: 0 }), rotulo("b", { x: 0, y: 0 })];
    for (const n of organizador.organizar(entradas, 390, 844)) {
      expect(n.x).toBeGreaterThanOrEqual(60);
      expect(n.y).toBeGreaterThanOrEqual(16);
      expect(n.x).toBeLessThanOrEqual(330);
      expect(n.y).toBeLessThanOrEqual(828);
    }
    organizador.organizar([], 390, 844);
    expect(organizador.organizar([rotulo("a")], 390, 844)).toEqual([{ id: "a", x: 195, y: 550 }]);
    organizador.limpar();
    expect(organizador.organizar([rotulo("a")], 0, 844)).toEqual([]);
  });

  it("prioriza o morador dirigido e limita rótulos mesmo quando há mais gente que espaço", () => {
    const organizador = new OrganizadorDeRotulos();
    const candidatos = Array.from({ length: 100 }, (_, i) =>
      rotulo(`pessoa-${i}`, { distancia: i + 1 }),
    );
    candidatos.push(rotulo("meu", { prioridade: 2, distancia: 1000 }));
    const resultado = organizador.organizar(candidatos, 390, 844);
    expect(resultado[0]).toEqual({ id: "meu", x: 195, y: 550 });
    expect(resultado.length).toBeLessThanOrEqual(MAXIMO_DE_ROTULOS_NA_CENA);
    expect(resultado.some((n) => n.id === "pessoa-99")).toBe(false);
  });

  it("trocar quem é dirigido dá prioridade à âncora desse morador", () => {
    const organizador = new OrganizadorDeRotulos();
    organizador.organizar([rotulo("a"), rotulo("b")], 390, 844);
    expect(
      organizador.organizar([rotulo("a"), rotulo("b", { prioridade: 2 })], 390, 844)[0],
    ).toEqual({ id: "b", x: 195, y: 550 });
  });
});
