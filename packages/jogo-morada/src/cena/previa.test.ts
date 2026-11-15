import { describe, expect, it } from "vitest";
import type { DescricaoDoMorador } from "../ativos/ativos";
import { AtivosProcedurais } from "../ativos/procedurais";
import { PreviaDoMorador } from "./previa";

const descricao: DescricaoDoMorador = {
  moradorId: "mor_previa",
  fase: "adulto",
  aparencia: {
    linha: "f",
    corpo: "adulta",
    pele: 0xa07050,
    cabelo: "natural",
    roupa: "cotidiano",
    semente: 0,
  },
};

describe("prévia e confirmação do quadro", () => {
  it("não anuncia uma escolha nova a partir da confirmação de um quadro antigo", () => {
    const ativos = new AtivosProcedurais();
    const previa = new PreviaDoMorador(ativos);
    previa.definir(descricao);
    previa.atualizar(0, 16);
    expect(previa.estadoPara(descricao)).toBe("carregando");
    const antigo = previa.capturarQuadro();
    previa.confirmarQuadro(antigo);
    expect(previa.estadoPara(descricao)).toBe("simples");
    const nova = { ...descricao, aparencia: { ...descricao.aparencia, pele: 0xffffff } };
    expect(previa.estadoPara(nova)).toBe("carregando");
    previa.definir(nova);
    previa.atualizar(16, 16);
    previa.confirmarQuadro(antigo);
    expect(previa.estadoPara(nova)).toBe("carregando");
    previa.confirmarQuadro(previa.capturarQuadro());
    expect(previa.estadoPara(nova)).toBe("simples");
    previa.dispose();
    ativos.dispose();
  });
  it("fechar descarta a prévia e invalida qualquer confirmação tardia", () => {
    const ativos = new AtivosProcedurais();
    const previa = new PreviaDoMorador(ativos);
    previa.definir(descricao);
    previa.atualizar(0, 16);
    const antigo = previa.capturarQuadro();
    previa.definir(null);
    previa.atualizar(16, 16);
    previa.confirmarQuadro(antigo);
    expect(previa.estado).toBe("fechada");
    expect(previa.raiz.children).toHaveLength(0);
    previa.dispose();
    ativos.dispose();
  });
});
