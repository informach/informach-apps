import { describe, expect, it } from "vitest";
import { findClosestSubject } from "./match-subject";

const subjects = [
  { id: "1", name: "Matemática" },
  { id: "2", name: "Português" },
  { id: "3", name: "Educação Física" },
  { id: "4", name: "História" },
  { id: "5", name: "Inglês" },
] as const;

describe("findClosestSubject", () => {
  it("retorna null para hint nulo ou vazio", () => {
    expect(findClosestSubject(subjects, null)).toBeNull();
    expect(findClosestSubject(subjects, "")).toBeNull();
    expect(findClosestSubject(subjects, undefined)).toBeNull();
  });

  it("casa nome canônico em pt-BR (acentuação/caixa irrelevante)", () => {
    expect(findClosestSubject(subjects, "Matemática")?.id).toBe("1");
    expect(findClosestSubject(subjects, "matemática")?.id).toBe("1");
    expect(findClosestSubject(subjects, "MATEMATICA")?.id).toBe("1");
    expect(findClosestSubject(subjects, "matematica")?.id).toBe("1");
  });

  it("casa variações com pontuação (Ed. Física vs Educação Física)", () => {
    expect(findClosestSubject(subjects, "Educação Física")?.id).toBe("3");
    expect(findClosestSubject(subjects, "educacao fisica")?.id).toBe("3");
  });

  it("casa erro de digitação dentro do limite de Levenshtein", () => {
    expect(findClosestSubject(subjects, "Matemtica")?.id).toBe("1");
    expect(findClosestSubject(subjects, "Portuges")?.id).toBe("2");
    expect(findClosestSubject(subjects, "Historia")?.id).toBe("4");
  });

  it("retorna null quando a diferença é grande demais", () => {
    expect(findClosestSubject(subjects, "Química")).toBeNull();
    expect(findClosestSubject(subjects, "Biologia")).toBeNull();
  });

  it("retorna null com array vazio", () => {
    expect(findClosestSubject([], "Matemática")).toBeNull();
  });
});
