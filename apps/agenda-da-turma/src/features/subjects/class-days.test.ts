import { describe, expect, it } from "vitest";
import {
  CLASS_DAY_VALUES,
  dayOfWeekToClassDay,
  formatClassDaysShort,
  isSubjectActiveOnDate,
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

describe("nextClassDayIso com alternatingSlots (quinzenal)", () => {
  // Cenário 1: Artes ↔ ACC na quarta. Artes classDays=[wed], slot pra wed.
  // Anchor da Artes: 2026-05-13 (qua). Próxima Artes: 2026-05-27.
  // Anchor da ACC: 2026-05-20 (qua). Próxima ACC: 2026-06-03.

  it("Artes só na quarta de 15 em 15: anchor 2026-05-13, hoje 2026-05-14 → próxima 2026-05-27", () => {
    // Quinta-feira (14/05). Quarta passada (13/05) foi Artes. Próxima Artes = qua de 27/05.
    const result = nextClassDayIso(
      "2026-05-14",
      ["wed"],
      [{ day: "wed", anchorIso: "2026-05-13" }],
    );
    expect(result).toBe("2026-05-27");
  });

  it("Artes só na quarta: hoje é sex 2026-05-22 (semana ACC), próxima Artes em 2026-05-27", () => {
    const result = nextClassDayIso(
      "2026-05-22",
      ["wed"],
      [{ day: "wed", anchorIso: "2026-05-13" }],
    );
    expect(result).toBe("2026-05-27");
  });

  it("Artes na quarta: hoje é seg 2026-05-25 (semana Artes), próxima quarta 2026-05-27 cai na minha", () => {
    const result = nextClassDayIso(
      "2026-05-25",
      ["wed"],
      [{ day: "wed", anchorIso: "2026-05-13" }],
    );
    expect(result).toBe("2026-05-27");
  });

  it("ACC na quarta (anchor 2026-05-20): hoje seg 2026-05-11, próxima ACC é 2026-05-20", () => {
    const result = nextClassDayIso(
      "2026-05-11",
      ["wed"],
      [{ day: "wed", anchorIso: "2026-05-20" }],
    );
    expect(result).toBe("2026-05-20");
  });

  // Cenário 2: Matemática [mon,tue,wed,fri], slot só pra fri.
  // Anchor Mat (fri) = 2026-05-15. Próxima Mat-fri = 2026-05-29.

  it("Mat mon/tue/wed weekly + fri quinzenal: hoje qua 2026-05-13 → próxima é qui? NÃO, próxima é sex 2026-05-15 (anchor)", () => {
    const result = nextClassDayIso(
      "2026-05-13",
      ["mon", "tue", "wed", "fri"],
      [{ day: "fri", anchorIso: "2026-05-15" }],
    );
    // 2026-05-15 (sex) — anchor cai na minha semana → vale como ocorrência.
    expect(result).toBe("2026-05-15");
  });

  it("Mat com fri quinzenal: hoje sex 2026-05-15 → próxima Mat = seg 2026-05-18 (weekly)", () => {
    const result = nextClassDayIso(
      "2026-05-15",
      ["mon", "tue", "wed", "fri"],
      [{ day: "fri", anchorIso: "2026-05-15" }],
    );
    expect(result).toBe("2026-05-18");
  });

  it("Mat com fri quinzenal: hoje qui 2026-05-21 (semana ACC/Rob), pula fri 2026-05-22 → seg 2026-05-25", () => {
    // Mat tem [mon,tue,wed,fri]. Sex 22 cai na semana do par (Rob), então pula.
    // Próxima ocorrência válida é segunda 25/05.
    const result = nextClassDayIso(
      "2026-05-21",
      ["mon", "tue", "wed", "fri"],
      [{ day: "fri", anchorIso: "2026-05-15" }],
    );
    expect(result).toBe("2026-05-25");
  });

  it("Robótica só na sex quinzenal (anchor 2026-05-22): hoje qua 2026-05-13 → próxima 2026-05-22", () => {
    const result = nextClassDayIso(
      "2026-05-13",
      ["fri"],
      [{ day: "fri", anchorIso: "2026-05-22" }],
    );
    expect(result).toBe("2026-05-22");
  });

  it("Robótica só sex quinzenal: hoje sáb 2026-05-23 (semana ACC/Rob acabou) → próxima 2026-06-05", () => {
    // Anchor 2026-05-22. Sex 22 era Robótica. Sex 29 é Mat. Sex 05/06 é Rob.
    const result = nextClassDayIso(
      "2026-05-23",
      ["fri"],
      [{ day: "fri", anchorIso: "2026-05-22" }],
    );
    expect(result).toBe("2026-06-05");
  });

  it("anchor 6 meses atrás continua funcionando (paridade % 2 estável)", () => {
    // Anchor 2025-11-19 (qua) → semanas pares depois.
    // 2026-05-13 está a ~25 semanas do anchor — paridade preservada (% 2).
    const result = nextClassDayIso(
      "2026-05-11",
      ["wed"],
      [{ day: "wed", anchorIso: "2025-11-19" }],
    );
    // (2026-05-13 - 2025-11-19) = 175 dias = 25 semanas → ímpar → pula → próxima minha em 2026-05-20.
    expect(result).toBe("2026-05-20");
  });

  it("slot pra dia que não está em classDays é ignorado (defensivo)", () => {
    // Mat tem [mon, tue, wed] mas alguém passou slot pra fri por engano.
    // Como fri não está em classDays, o slot não tem efeito.
    const result = nextClassDayIso(
      "2026-05-13",
      ["mon", "tue", "wed"],
      [{ day: "fri", anchorIso: "2026-05-15" }],
    );
    // hoje qua → próxima é qui? Não, qui não está em classDays. Próxima é seg 18/05.
    expect(result).toBe("2026-05-18");
  });

  it("alternatingSlots vazio se comporta como sem slots (backward compat)", () => {
    const result = nextClassDayIso("2026-05-13", ["mon", "wed", "fri"], []);
    expect(result).toBe("2026-05-15");
  });
});

describe("isSubjectActiveOnDate", () => {
  // 2026-05-13 = quarta. 2026-05-15 = sex. 2026-05-09 = sáb. 2026-05-10 = dom.

  it("classDays vazio → false sempre", () => {
    expect(isSubjectActiveOnDate("2026-05-13", [])).toBe(false);
  });

  it("matéria seg/qua/sex no dia qua → true", () => {
    expect(isSubjectActiveOnDate("2026-05-13", ["mon", "wed", "fri"])).toBe(true);
  });

  it("matéria seg/qua/sex no dia ter → false", () => {
    // 2026-05-12 = terça
    expect(isSubjectActiveOnDate("2026-05-12", ["mon", "wed", "fri"])).toBe(false);
  });

  it("matéria mon-fri no dia sábado → false (sábado fora do enum)", () => {
    expect(isSubjectActiveOnDate("2026-05-09", ["mon", "tue", "wed", "thu", "fri"])).toBe(false);
  });

  it("matéria mon-fri no dia domingo → false", () => {
    expect(isSubjectActiveOnDate("2026-05-10", ["mon", "tue", "wed", "thu", "fri"])).toBe(false);
  });

  it("slot quinzenal: anchor 2026-05-13 (qua), target 2026-05-13 → true (mesma semana)", () => {
    expect(
      isSubjectActiveOnDate("2026-05-13", ["wed"], [{ day: "wed", anchorIso: "2026-05-13" }]),
    ).toBe(true);
  });

  it("slot quinzenal: anchor 2026-05-13 (qua), target 2026-05-20 → false (semana da pareada)", () => {
    expect(
      isSubjectActiveOnDate("2026-05-20", ["wed"], [{ day: "wed", anchorIso: "2026-05-13" }]),
    ).toBe(false);
  });

  it("slot quinzenal: anchor 2026-05-13, target 2026-05-27 → true (volta minha semana)", () => {
    expect(
      isSubjectActiveOnDate("2026-05-27", ["wed"], [{ day: "wed", anchorIso: "2026-05-13" }]),
    ).toBe(true);
  });

  it("Mat seg/ter/qua/sex weekly + fri quinzenal: target seg → true (sem slot pra seg)", () => {
    expect(
      isSubjectActiveOnDate(
        "2026-05-11",
        ["mon", "tue", "wed", "fri"],
        [{ day: "fri", anchorIso: "2026-05-15" }],
      ),
    ).toBe(true);
  });

  it("Mat fri quinzenal: target sex 2026-05-15 (anchor) → true", () => {
    expect(
      isSubjectActiveOnDate(
        "2026-05-15",
        ["mon", "tue", "wed", "fri"],
        [{ day: "fri", anchorIso: "2026-05-15" }],
      ),
    ).toBe(true);
  });

  it("Mat fri quinzenal: target sex 2026-05-22 (semana Rob) → false", () => {
    expect(
      isSubjectActiveOnDate(
        "2026-05-22",
        ["mon", "tue", "wed", "fri"],
        [{ day: "fri", anchorIso: "2026-05-15" }],
      ),
    ).toBe(false);
  });

  it("slot pra dia que não está em classDays é ignorado", () => {
    // Defensivo — invariante já garantida pelo service mas vale testar.
    expect(
      isSubjectActiveOnDate("2026-05-13", ["wed"], [{ day: "fri", anchorIso: "2026-05-15" }]),
    ).toBe(true);
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
