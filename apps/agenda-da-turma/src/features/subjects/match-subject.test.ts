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

  // Aliases — pares que escolas BR usam intercambiavelmente mas têm
  // distância de edição grande (escapam do Levenshtein ≤ 3).
  describe("aliases", () => {
    it("casa Português ↔ Língua Portuguesa nos dois sentidos", () => {
      const withLP = [{ id: "x", name: "Língua Portuguesa" }] as const;
      expect(findClosestSubject(withLP, "Português")?.id).toBe("x");
      expect(findClosestSubject(withLP, "português")?.id).toBe("x");
      expect(findClosestSubject(withLP, "LP")?.id).toBe("x");

      const withPort = [{ id: "y", name: "Português" }] as const;
      expect(findClosestSubject(withPort, "Língua Portuguesa")?.id).toBe("y");
      expect(findClosestSubject(withPort, "lingua portuguesa")?.id).toBe("y");
    });

    it("casa Mat / Matemática / Cálculo", () => {
      const withMat = [{ id: "1", name: "Matemática" }] as const;
      expect(findClosestSubject(withMat, "Mat")?.id).toBe("1");
      expect(findClosestSubject(withMat, "Cálculo")?.id).toBe("1");

      const withCalc = [{ id: "2", name: "Cálculo" }] as const;
      expect(findClosestSubject(withCalc, "Matemática")?.id).toBe("2");
    });

    it("casa Educação Física via abreviações", () => {
      const ef = [{ id: "3", name: "Educação Física" }] as const;
      expect(findClosestSubject(ef, "Ed Física")?.id).toBe("3");
      expect(findClosestSubject(ef, "Ed Fis")?.id).toBe("3");
      expect(findClosestSubject(ef, "EF")?.id).toBe("3");
      expect(findClosestSubject(ef, "Edu. Física")?.id).toBe("3");
    });

    it("casa História / Hist e Geografia / Geo", () => {
      const subs = [
        { id: "h", name: "História" },
        { id: "g", name: "Geografia" },
      ] as const;
      expect(findClosestSubject(subs, "Hist")?.id).toBe("h");
      expect(findClosestSubject(subs, "Geo")?.id).toBe("g");
    });

    it("casa Inglês ↔ Língua Inglesa", () => {
      const ing = [{ id: "i", name: "Língua Inglesa" }] as const;
      expect(findClosestSubject(ing, "Inglês")?.id).toBe("i");
      expect(findClosestSubject(ing, "Eng")?.id).toBe("i");
    });

    it("casa Artes ↔ Educação Artística", () => {
      const a = [{ id: "a", name: "Educação Artística" }] as const;
      expect(findClosestSubject(a, "Artes")?.id).toBe("a");
      expect(findClosestSubject(a, "Arte")?.id).toBe("a");
    });

    it("não cruza grupos diferentes", () => {
      // Biologia (grupo separado) NÃO casa com Ciências (outro grupo) — no
      // Ensino Médio são matérias distintas.
      const ciencias = [{ id: "c", name: "Ciências" }] as const;
      expect(findClosestSubject(ciencias, "Biologia")).toBeNull();

      const bio = [{ id: "b", name: "Biologia" }] as const;
      expect(findClosestSubject(bio, "Ciências")).toBeNull();
    });

    it("não casa por distância duas matérias de grupos conhecidos diferentes", () => {
      // normalize("Ed. Física") = "ed fisica" e normalize("Física") = "fisica":
      // distância 3, dentro do limite. São matérias distintas, e casar aqui
      // ainda herdaria o horário de Educação Física no prazo sugerido.
      const ef = [{ id: "ef", name: "Ed. Física" }] as const;
      expect(findClosestSubject(ef, "Física")).toBeNull();
      const fisica = [{ id: "f", name: "Física" }] as const;
      expect(findClosestSubject(fisica, "Ed. Física")).toBeNull();
    });

    it("alias vence Levenshtein quando ambos resolveriam", () => {
      // "Matematica" (sem acento, hint) tem distância 0 com "Matemática"
      // (Pass 1). Não testa Pass 2. Mas "Mat" (3 chars) tem distância 7
      // com "Matemática" — Levenshtein não pegaria; alias pega.
      const subs = [{ id: "m", name: "Matemática" }] as const;
      expect(findClosestSubject(subs, "Mat")?.id).toBe("m");
    });
  });
});
