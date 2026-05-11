import {
  Atom,
  BookOpen,
  BookText,
  Bot,
  Calculator,
  Church,
  Dumbbell,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Music,
  Palette,
  PenLine,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  getSubjectColorIndex,
  getSubjectIcon,
  getSubjectIconClass,
  getSubjectTextClass,
  getSubjectTintedClass,
  isMinorNameEdit,
  levenshtein,
  pickAvailableColorIndex,
} from "./utils";

describe("getSubjectColorIndex", () => {
  it("maps Matemática to chart-1 (azul)", () => {
    expect(getSubjectColorIndex("Matemática")).toBe(1);
  });

  it("ignores case and accents", () => {
    expect(getSubjectColorIndex("MATEMATICA")).toBe(1);
    expect(getSubjectColorIndex("matemática")).toBe(1);
  });

  it("maps Português to chart-2 (verde)", () => {
    expect(getSubjectColorIndex("Português")).toBe(2);
    expect(getSubjectColorIndex("Língua Portuguesa")).toBe(2);
  });

  it("maps Ciências to chart-3 (violeta)", () => {
    expect(getSubjectColorIndex("Ciências")).toBe(3);
  });

  it("maps História to chart-4 (laranja)", () => {
    expect(getSubjectColorIndex("História")).toBe(4);
  });

  it("maps Inglês to chart-5 (rosa)", () => {
    expect(getSubjectColorIndex("Inglês")).toBe(5);
    expect(getSubjectColorIndex("Língua Inglesa")).toBe(5);
  });

  it("falls back to deterministic hash for unknown subjects", () => {
    const a = getSubjectColorIndex("Robótica");
    const b = getSubjectColorIndex("Robótica");
    expect(a).toBe(b);
    expect([1, 2, 3, 4, 5]).toContain(a);
  });

  it("returns 1 for empty string", () => {
    expect(getSubjectColorIndex("")).toBe(1);
    expect(getSubjectColorIndex("   ")).toBe(1);
  });

  it("matches curated by prefix (Matemática Aplicada → 1)", () => {
    expect(getSubjectColorIndex("Matemática Aplicada")).toBe(1);
    expect(getSubjectColorIndex("História do Brasil")).toBe(4);
  });
});

describe("class helpers", () => {
  it("returns chart-1 classes for Matemática", () => {
    expect(getSubjectTintedClass("Matemática")).toContain("chart-1");
    expect(getSubjectTextClass("Matemática")).toBe("text-chart-1");
    expect(getSubjectIconClass("Matemática")).toContain("chart-1");
  });
});

describe("pickAvailableColorIndex", () => {
  it("uses curated index when slot is free (Matemática → 1)", () => {
    expect(pickAvailableColorIndex("Matemática", [])).toBe(1);
  });

  it("avoids collision: Matemática + Redação → 1 e 2", () => {
    const first = pickAvailableColorIndex("Matemática", []);
    expect(first).toBe(1);
    const second = pickAvailableColorIndex("Redação", [first]);
    expect(second).toBe(2);
    expect(second).not.toBe(first);
  });

  it("respects curated when both subjects have distinct curated slots", () => {
    const matIdx = pickAvailableColorIndex("Matemática", []);
    const portIdx = pickAvailableColorIndex("Português", [matIdx]);
    expect(matIdx).toBe(1);
    expect(portIdx).toBe(2);
  });

  it("falls back to first free slot when curated is taken", () => {
    // Slot 1 já ocupado por Matemática; "Matemáticas" também é curated→1, mas vai pegar 2.
    expect(pickAvailableColorIndex("Matemáticas", [1])).toBe(2);
  });

  it("walks through 1..5 in order when nothing is curated", () => {
    expect([1, 2, 3, 4, 5]).toContain(pickAvailableColorIndex("Robótica", []));
    expect(pickAvailableColorIndex("Robótica", [1])).toBe(2);
    expect(pickAvailableColorIndex("Robótica", [1, 2])).toBe(3);
    expect(pickAvailableColorIndex("Robótica", [1, 2, 3, 4])).toBe(5);
  });

  it("falls back to hash when all 5 slots are taken (6th subject)", () => {
    const sixth = pickAvailableColorIndex("Empreendedorismo", [1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5]).toContain(sixth);
  });

  it("is robust to user typing: case, accents, punctuation", () => {
    expect(pickAvailableColorIndex("matemática", [])).toBe(1);
    expect(pickAvailableColorIndex("MATEMATICA", [])).toBe(1);
    expect(pickAvailableColorIndex("  Matemática  ", [])).toBe(1);
    expect(pickAvailableColorIndex("Ed. Física", [])).toBe(
      pickAvailableColorIndex("Educação Física", []),
    );
  });
});

describe("getSubjectIcon", () => {
  it("maps common BNCC subjects to specific Lucide icons", () => {
    expect(getSubjectIcon("Matemática")).toBe(Calculator);
    expect(getSubjectIcon("Português")).toBe(BookText);
    expect(getSubjectIcon("Língua Portuguesa")).toBe(BookText);
    expect(getSubjectIcon("Redação")).toBe(PenLine);
    expect(getSubjectIcon("Ciências")).toBe(FlaskConical);
    expect(getSubjectIcon("Física")).toBe(Atom);
    expect(getSubjectIcon("História")).toBe(Landmark);
    expect(getSubjectIcon("Geografia")).toBe(Globe2);
    expect(getSubjectIcon("Inglês")).toBe(Languages);
    expect(getSubjectIcon("Música")).toBe(Music);
    expect(getSubjectIcon("Arte")).toBe(Palette);
    expect(getSubjectIcon("Educação Física")).toBe(Dumbbell);
    expect(getSubjectIcon("Religião")).toBe(Church);
  });

  it("is robust to user typing variations", () => {
    expect(getSubjectIcon("matemática")).toBe(Calculator);
    expect(getSubjectIcon("MATEMÁTICA")).toBe(Calculator);
    expect(getSubjectIcon("matematica")).toBe(Calculator);
    expect(getSubjectIcon("  Matemática  ")).toBe(Calculator);
    expect(getSubjectIcon("Ed. Física")).toBe(Dumbbell);
    expect(getSubjectIcon("EDUCAÇÃO FÍSICA")).toBe(Dumbbell);
    expect(getSubjectIcon("educacao fisica")).toBe(Dumbbell);
  });

  it("matches curated by prefix for compound names", () => {
    expect(getSubjectIcon("Matemática Aplicada")).toBe(Calculator);
    expect(getSubjectIcon("História do Brasil")).toBe(Landmark);
    expect(getSubjectIcon("Língua Inglesa Avançada")).toBe(Languages);
    expect(getSubjectIcon("Música Erudita")).toBe(Music);
  });

  it("maps Robótica to Bot", () => {
    expect(getSubjectIcon("Robótica")).toBe(Bot);
    expect(getSubjectIcon("robotica")).toBe(Bot);
    expect(getSubjectIcon("Robótica Educacional")).toBe(Bot);
  });

  it("falls back to BookOpen for unknown subjects", () => {
    expect(getSubjectIcon("Empreendedorismo")).toBe(BookOpen);
    expect(getSubjectIcon("Xadrez")).toBe(BookOpen);
    expect(getSubjectIcon("")).toBe(BookOpen);
    expect(getSubjectIcon("   ")).toBe(BookOpen);
  });

  it("does NOT match curated when it appears mid-word (no false positives)", () => {
    // "Historiador" não deve casar com "historia" (sem fronteira de palavra).
    expect(getSubjectIcon("Historiador")).toBe(BookOpen);
  });
});

describe("levenshtein", () => {
  it("retorna 0 pra strings iguais", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("retorna length da outra quando uma é vazia", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("conta substituições, inserções e remoções", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3); // k→s, e→i, +g
    expect(levenshtein("flaw", "lawn")).toBe(2); // -f, +n
    expect(levenshtein("matematica", "matemtica")).toBe(1); // remove 'a'
  });
});

describe("isMinorNameEdit", () => {
  it("aceita só diferença de acento/caixa/espaço (normalize-equal)", () => {
    expect(isMinorNameEdit("Matemática", "matematica")).toBe(true);
    expect(isMinorNameEdit("MATEMÁTICA", "matemática")).toBe(true);
    expect(isMinorNameEdit("  Matemática  ", "Matemática")).toBe(true);
    expect(isMinorNameEdit("Ed. Física", "Educação Física")).toBe(false); // normalize: "ed fisica" vs "educacao fisica" — distância > 3
  });

  it("aceita erro de digitação curto (Levenshtein ≤ 3)", () => {
    expect(isMinorNameEdit("Matemtica", "Matemática")).toBe(true); // +a
    expect(isMinorNameEdit("Matematic", "Matemática")).toBe(true); // +a no final
    expect(isMinorNameEdit("Cienias", "Ciências")).toBe(true); // +c
    expect(isMinorNameEdit("Geogarfia", "Geografia")).toBe(true); // swap
  });

  it("rejeita mudança grande de palavra", () => {
    expect(isMinorNameEdit("Matemática", "Educação Física")).toBe(false);
    expect(isMinorNameEdit("História", "Geografia")).toBe(false);
    expect(isMinorNameEdit("Matemática", "Matemática Aplicada")).toBe(false); // +10 chars
  });

  it("rejeita quando diferença de tamanho já passa do limite (short-circuit)", () => {
    // Sem entrar no DP — só pelo tamanho.
    expect(isMinorNameEdit("ABC", "ABCDEFGH")).toBe(false);
  });
});
