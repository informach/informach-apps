import { describe, expect, it } from "vitest";
import {
  CLASS_DAY_VALUES,
  dayOfWeekToClassDay,
  formatClassDaysShort,
  nextClassDayIso,
  normalizeClassDays,
} from "./class-days";

describe("CLASS_DAY_VALUES", () => {
  it("é ordem canônica Seg→Sex", () => {
    expect(CLASS_DAY_VALUES).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
});

describe("dayOfWeekToClassDay", () => {
  it("mapeia getDay() do Date pra enum", () => {
    expect(dayOfWeekToClassDay(1)).toBe("mon");
    expect(dayOfWeekToClassDay(2)).toBe("tue");
    expect(dayOfWeekToClassDay(3)).toBe("wed");
    expect(dayOfWeekToClassDay(4)).toBe("thu");
    expect(dayOfWeekToClassDay(5)).toBe("fri");
  });

  it("retorna null pra Sáb/Dom (não temos enum no v1)", () => {
    expect(dayOfWeekToClassDay(0)).toBeNull();
    expect(dayOfWeekToClassDay(6)).toBeNull();
  });

  it("retorna null pra valores fora de 0..6", () => {
    expect(dayOfWeekToClassDay(-1)).toBeNull();
    expect(dayOfWeekToClassDay(7)).toBeNull();
  });
});

describe("normalizeClassDays", () => {
  it("remove duplicatas e descarta valores inválidos", () => {
    expect(normalizeClassDays(["mon", "mon", "tue", "sat", "xx"])).toEqual(["mon", "tue"]);
  });

  it("reordena pra ordem canônica Seg→Sex independente da ordem do input", () => {
    expect(normalizeClassDays(["fri", "mon", "wed"])).toEqual(["mon", "wed", "fri"]);
  });

  it("array vazio retorna array vazio", () => {
    expect(normalizeClassDays([])).toEqual([]);
  });
});

describe("nextClassDayIso", () => {
  // 2026-05-11 = segunda-feira (verificação: new Date(2026,4,11).getDay() === 1)
  // 2026-05-13 = quarta-feira
  // 2026-05-15 = sexta-feira

  it("classDays vazio retorna null", () => {
    expect(nextClassDayIso("2026-05-13", [])).toBeNull();
  });

  it("hoje é quarta + classDays=[mon,wed,fri] → próxima é sexta (skipa hoje)", () => {
    // Estritamente APÓS hoje — atividade cadastrada hoje vale pra próxima aula,
    // não pra aula de hoje.
    expect(nextClassDayIso("2026-05-13", ["mon", "wed", "fri"])).toBe("2026-05-15");
  });

  it("hoje é sexta + classDays=[mon,wed,fri] → próxima é segunda da próxima semana", () => {
    expect(nextClassDayIso("2026-05-15", ["mon", "wed", "fri"])).toBe("2026-05-18");
  });

  it("hoje é segunda + classDays=[mon] → próxima é segunda da próxima semana", () => {
    expect(nextClassDayIso("2026-05-11", ["mon"])).toBe("2026-05-18");
  });

  it("hoje é sábado + classDays=[mon,tue,thu] → próxima é segunda", () => {
    // 2026-05-09 = sábado
    expect(nextClassDayIso("2026-05-09", ["mon", "tue", "thu"])).toBe("2026-05-11");
  });

  it("hoje é domingo + classDays=[mon] → próxima é segunda", () => {
    // 2026-05-10 = domingo
    expect(nextClassDayIso("2026-05-10", ["mon"])).toBe("2026-05-11");
  });

  it("classDays todos Seg-Sex → próximo dia útil após hoje", () => {
    // 2026-05-13 = quarta → próximo dia útil = quinta
    expect(nextClassDayIso("2026-05-13", ["mon", "tue", "wed", "thu", "fri"])).toBe("2026-05-14");
  });
});

describe("formatClassDaysShort", () => {
  it("renderiza com separador ' · '", () => {
    expect(formatClassDaysShort(["mon", "tue", "thu", "fri"])).toBe("Seg · Ter · Qui · Sex");
  });

  it("array vazio retorna string vazia", () => {
    expect(formatClassDaysShort([])).toBe("");
  });

  it("normaliza ordem fora de canônica", () => {
    expect(formatClassDaysShort(["fri", "mon"])).toBe("Seg · Sex");
  });
});
