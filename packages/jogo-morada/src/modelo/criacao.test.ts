import { impedimentoDaFundacao } from "@informach/morada-sim";
import { describe, expect, it } from "vitest";
import {
  conferirRascunho,
  descricaoDaPrevia,
  familiaDeExemplo,
  rascunhoParaConfirmar,
  removerMoradorDoRascunho,
} from "./criacao";

describe("rascunho local e referências familiares", () => {
  it("remover um morador preserva vínculos dos demais pelos identificadores locais", () => {
    const exemplo = familiaDeExemplo(null, ["a", "b", "c", "d"]);
    const semLia = removerMoradorDoRascunho(exemplo, "a");
    const rascunho = rascunhoParaConfirmar(semLia);
    expect(rascunho.moradores.map((m) => m.nome)).toEqual(["Marcos", "Nina", "Vó Ana"]);
    expect(rascunho.relacoes).toEqual([{ a: 0, b: 1, tipo: "genitor" }]);
    expect(impedimentoDaFundacao(rascunho, 8)).toBeNull();
    expect(exemplo.moradores).toHaveLength(4);
    expect(exemplo.relacoes).toHaveLength(4);
  });
  it("nomes iguais não mudam a identidade nem os vínculos enviados", () => {
    const exemplo = familiaDeExemplo(null, ["a", "b", "c", "d"]);
    for (const m of exemplo.moradores) m.dados.nome = "Lua";
    const rascunho = rascunhoParaConfirmar(exemplo);
    expect(rascunho.moradores.map((m) => m.nome)).toEqual(["Lua", "Lua", "Lua", "Lua"]);
    expect(rascunho.relacoes).toHaveLength(4);
    expect(impedimentoDaFundacao(rascunho, 8)).toBeNull();
    expect(JSON.stringify(rascunho)).not.toContain('"chave"');
  });
  it("não deixa enviar referências removidas, nomes vazios nem família sem moradores", () => {
    const exemplo = familiaDeExemplo(null, ["a", "b", "c", "d"]);
    const primeiro = exemplo.moradores[0];
    if (!primeiro) throw new Error("Morador ausente");
    primeiro.dados.nome = " ";
    expect(conferirRascunho(exemplo).success).toBe(false);
    primeiro.dados.nome = "Lia";
    const relacao = exemplo.relacoes[0];
    if (!relacao) throw new Error("Relação ausente");
    relacao.b = "inexistente";
    expect(() => rascunhoParaConfirmar(exemplo)).toThrow(/removido/);
    expect(() =>
      removerMoradorDoRascunho({ ...exemplo, moradores: [primeiro], relacoes: [] }, primeiro.chave),
    ).toThrow(/pelo menos/);
    expect(descricaoDaPrevia(primeiro.dados)).toMatchObject({
      moradorId: "mor_previa",
      aparencia: { corpo: "adulta" },
    });
  });
});
