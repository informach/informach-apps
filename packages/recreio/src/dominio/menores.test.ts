import { describe, expect, it } from "vitest";
import { exigirNascimentoDeMenor, faixasDoMenor, idadeNoMes } from "./menores";

describe("faixas de perfil sob responsabilidade", () => {
  const agora = { ano: 2026, mes: 11 };
  it.each([
    [0, "L"],
    [5, "L"],
    [6, "6"],
    [9, "6"],
    [10, "10"],
    [11, "10"],
    [12, "12"],
    [13, "12"],
    [14, "14"],
    [15, "14"],
    [16, "16"],
    [17, "16"],
  ] as const)("idade %i usa limite %s e mantém faixa social separada", (idade, classificacao) => {
    expect(faixasDoMenor({ ano: agora.ano - idade, mes: agora.mes }, agora)).toEqual({
      social: idade <= 12 ? "ate_12" : "13_17",
      classificacao,
      precisaContaAdulta: false,
    });
  });
  it("avança no mês informado sem guardar dia de nascimento", () => {
    const nascimento = { ano: 2013, mes: 12 };
    expect(idadeNoMes(nascimento, agora)).toBe(12);
    expect(faixasDoMenor(nascimento, { ano: 2026, mes: 12 }).social).toBe("13_17");
    expect(idadeNoMes(nascimento, { ano: 2027, mes: 1 })).toBe(13);
  });
  it("recusa nascimento futuro e cadastro inicial de adulto", () => {
    expect(() => exigirNascimentoDeMenor({ ano: 2026, mes: 12 }, agora)).toThrow();
    expect(() => exigirNascimentoDeMenor({ ano: 2008, mes: 11 }, agora)).toThrow();
    expect(() => exigirNascimentoDeMenor({ ano: 2008, mes: 12 }, agora)).not.toThrow();
  });
  it("idade adulta pendente conserva proteção e nunca recebe classificação 18", () => {
    expect(faixasDoMenor({ ano: 2008, mes: 11 }, agora)).toEqual({
      social: "13_17",
      classificacao: "16",
      precisaContaAdulta: true,
    });
  });
});
