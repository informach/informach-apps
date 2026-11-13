import { listar } from "@informach/morada-sim";
import { doCatalogo } from "@informach/morada-sim/conteudo";
import { criarMundoDaProva } from "@informach/morada-sim/testes";
import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { ASSENTO_MM, COLCHAO_MM, formasDoMovel } from "./formas-do-movel";
import { AtivosProcedurais } from "./procedurais";

describe("móveis procedurais utilizáveis", () => {
  it("cama e sofá têm superfície abaixo do morador, sem caixa até o topo da cabeceira", () => {
    for (const [catalogo, apoio] of [
      ["cama_casal_madeira_bege", COLCHAO_MM],
      ["sofa_3_lugares_bege", ASSENTO_MM],
    ] as const) {
      // Usa também as peças do bairro: os ids da biblioteca podem evoluir.
      const mundo = criarMundoDaProva();
      const entrada =
        doCatalogo(catalogo) ??
        listar(mundo.estado.objetos)
          .map((objeto) => doCatalogo(objeto.catalogo))
          .find((item) => item?.comportamento === (apoio === COLCHAO_MM ? "cama_casal" : "sofa"));
      if (!entrada) throw new Error("sem móvel da prova");
      const formas = formasDoMovel(entrada);
      expect(formas.length).toBeGreaterThan(1);
      const base = formas[0];
      if (!base) throw new Error("sem base");
      expect((base.centro[1] + base.tamanho[1] / 2) * 1000).toBeCloseTo(apoio);
      expect(formas.slice(1).every((forma) => forma.tamanho[2] <= 0.08)).toBe(true);
    }
  });

  it("colchões do berço e do beliche coincidem com as alturas de apoio", () => {
    const ativos = new AtivosProcedurais();
    const mundo = criarMundoDaProva();
    for (const objeto of listar(mundo.estado.objetos)) {
      const entrada = doCatalogo(objeto.catalogo);
      if (!entrada || !["berco", "beliche"].includes(entrada.comportamento ?? "")) continue;
      const formas = formasDoMovel(entrada);
      const ponto = entrada.comportamento === "berco" ? "berco" : "deitar_2";
      const altura = ativos.apoio(objeto, ponto, "deitado") / 1000;
      expect(
        formas.some(
          (forma) => Math.abs(forma.centro[1] + forma.tamanho[1] / 2 - altura) < 0.000001,
        ),
      ).toBe(true);
    }
    ativos.dispose();
  });

  it("mantém um único lote de instâncias e atualiza os limites ao filtrar objetos", () => {
    const ativos = new AtivosProcedurais();
    const mundo = criarMundoDaProva();
    const objeto = listar(mundo.estado.objetos).find(
      (item) => doCatalogo(item.catalogo)?.comportamento === "cama_casal",
    );
    if (!objeto) throw new Error("sem cama");
    const visual = ativos.criarObjetos([
      { objeto, entrada: doCatalogo(objeto.catalogo), posicao: [3, 0, 4] },
    ]);
    expect(visual.raiz).toBeInstanceOf(InstancedMesh);
    const malha = visual.raiz as InstancedMesh;
    expect(malha.count).toBe(2);
    const matriz = new Matrix4();
    malha.getMatrixAt(0, matriz);
    const centro = new Vector3().setFromMatrixPosition(matriz);
    expect(centro.y).toBeCloseTo(COLCHAO_MM / 2000);
    visual.definirVisiveis(() => false);
    expect(malha.count).toBe(0);
    visual.definirVisiveis(() => true);
    expect(malha.count).toBe(2);
    expect(malha.boundingSphere?.radius).toBeGreaterThan(0);
    visual.dispose();
    ativos.dispose();
  });
});
