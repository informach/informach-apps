import { describe, expect, it } from "vitest";
import {
  birthMonthValue,
  effectiveGrade,
  gradeLabel,
  gradeOptions,
  gradeRangeLabel,
  gradeRangeSentence,
  inGrade,
  ofGrade,
  schoolYear,
  suggestedGrade,
} from "./school-year";

describe("ano escolar", () => {
  it("vira o ano letivo junto com o ano civil no fuso da escola", () => {
    expect(schoolYear(new Date("2026-06-15T12:00:00Z"))).toBe(2026);
    // 31/12 às 23h em Brasília ainda é 2026, mesmo já sendo 2027 em UTC.
    expect(schoolYear(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(schoolYear(new Date("2027-01-01T03:30:00Z"))).toBe(2027);
  });

  it("sugere o ano pela regra de corte de 31 de março", () => {
    // Nascido em março de 2014 completa 12 até 31/03/2026: 7º ano.
    expect(suggestedGrade("2014-03", 2026)).toBe(7);
    // Nascido em abril de 2014 completa 12 depois do corte: 6º ano.
    expect(suggestedGrade("2014-04", 2026)).toBe(6);
    expect(suggestedGrade("2020-01", 2026)).toBe(1);
    expect(suggestedGrade("2008-05", 2026)).toBe(12);
    // Fora da escola básica: sem sugestão, o responsável escolhe.
    expect(suggestedGrade("2021-06", 2026)).toBeNull();
    expect(suggestedGrade("2007-01", 2026)).toBeNull();
    expect(suggestedGrade("2014", 2026)).toBeNull();
    expect(suggestedGrade("2014-13", 2026)).toBeNull();
  });

  it("avança o ano efetivo a cada virada, sem passar da 3ª série", () => {
    const perfil = { grade: 6, gradeYear: 2026 };
    expect(effectiveGrade(perfil, new Date("2026-09-26T12:00:00Z"))).toBe(6);
    expect(effectiveGrade(perfil, new Date("2027-02-01T12:00:00Z"))).toBe(7);
    expect(effectiveGrade(perfil, new Date("2029-02-01T12:00:00Z"))).toBe(9);
    expect(effectiveGrade({ grade: 12, gradeYear: 2026 }, new Date("2027-06-01T12:00:00Z"))).toBe(
      12,
    );
    // Relógio atrasado em relação ao ano gravado nunca recua o perfil.
    expect(effectiveGrade({ grade: 8, gradeYear: 2027 }, new Date("2026-06-01T12:00:00Z"))).toBe(8);
  });

  it("rotula fundamental e médio do jeito que a família fala", () => {
    expect(gradeLabel(6)).toBe("6º ano");
    expect(gradeLabel(10)).toBe("1ª série do EM");
    expect(gradeLabel(12)).toBe("3ª série do EM");
    expect(gradeOptions([7, 6, 10])).toEqual([
      { value: 6, label: "6º ano" },
      { value: 7, label: "7º ano" },
      { value: 10, label: "1ª série do EM" },
    ]);
  });

  it("resume a faixa de anos do catálogo", () => {
    expect(gradeRangeLabel([6, 7])).toBe("6º e 7º ano");
    expect(gradeRangeLabel([7])).toBe("7º ano");
    expect(gradeRangeLabel([9, 8, 6, 7])).toBe("do 6º ao 9º ano");
    expect(gradeRangeLabel([10, 11])).toBe("1ª e 2ª série do EM");
    expect(gradeRangeLabel([10, 11, 12])).toBe("da 1ª à 3ª série do EM");
    expect(gradeRangeLabel([9, 10])).toBe("9º ano e 1ª série do EM");
    expect(gradeRangeLabel([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(
      "do 2º ano à 3ª série do EM",
    );
  });

  it("monta a frase da faixa para os textos públicos", () => {
    expect(gradeRangeSentence([6, 7])).toBe("para o 6º e 7º ano");
    expect(gradeRangeSentence([6, 7, 8, 9])).toBe("do 6º ao 9º ano");
    expect(gradeRangeSentence([12])).toBe("para a 3ª série do EM");
    expect(gradeRangeSentence([10, 11])).toBe("para a 1ª e 2ª série do EM");
  });

  it("concorda o artigo com ano e série", () => {
    expect(inGrade(7)).toBe("no 7º ano");
    expect(inGrade(10)).toBe("na 1ª série do EM");
    expect(ofGrade(9)).toBe("do 9º ano");
    expect(ofGrade(11)).toBe("da 2ª série do EM");
  });

  it("converte o mês gravado de volta para o campo do formulário", () => {
    expect(birthMonthValue(null)).toBe("");
    expect(birthMonthValue("2014-03-01")).toBe("2014-03");
    expect(birthMonthValue(new Date("2014-03-01T00:00:00Z"))).toBe("2014-03");
  });
});
