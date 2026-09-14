import { describe, expect, it } from "vitest";
import { suggestDueDateFromSchedule } from "./due-date-suggestion";

// Referências: 2026-09-14 é segunda; 16 é quarta; 18 é sexta; 19 é sábado.
const MONDAY = "2026-09-14";
const FRIDAY = "2026-09-18";

describe("suggestDueDateFromSchedule", () => {
  it("devolve a próxima aula estritamente depois de hoje", () => {
    const result = suggestDueDateFromSchedule(
      { name: "Matemática", classDays: ["mon", "wed", "fri"], alternatingSlots: [] },
      MONDAY,
    );
    // Hoje é segunda e a matéria tem aula hoje — o prazo é a PRÓXIMA, não hoje.
    expect(result?.dueAt).toBe("2026-09-16");
  });

  // Regressão de 2026-05-15, recuperada junto com o cálculo: na sexta, a
  // próxima aula de uma matéria seg/qua/sex é a segunda seguinte, não o
  // sábado.
  it("pula o fim de semana quando hoje é sexta", () => {
    const result = suggestDueDateFromSchedule(
      { name: "Matemática", classDays: ["mon", "wed", "fri"], alternatingSlots: [] },
      FRIDAY,
    );
    expect(result?.dueAt).toBe("2026-09-21");
  });

  it("devolve null quando a matéria não tem horário cadastrado", () => {
    expect(
      suggestDueDateFromSchedule({ name: "Artes", classDays: [], alternatingSlots: [] }, MONDAY),
    ).toBeNull();
  });

  it("identifica a matéria no rótulo de procedência", () => {
    const result = suggestDueDateFromSchedule(
      { name: "História", classDays: ["tue"], alternatingSlots: [] },
      MONDAY,
    );
    expect(result?.label).toBe("Calculado pelo horário de História");
  });

  describe("revezamento quinzenal", () => {
    // Artes e ACC revezam na quarta. A âncora diz em qual semana cada uma cai.
    const artes = {
      name: "Artes",
      classDays: ["wed"] as const,
      alternatingSlots: [{ day: "wed" as const, anchorIso: "2026-09-16" }],
    };

    it("pula a semana do par", () => {
      // Segunda 14/09: a quarta desta semana (16/09) é a semana de Artes.
      expect(suggestDueDateFromSchedule(artes, MONDAY)?.dueAt).toBe("2026-09-16");
      // Já na quarta 16/09, a próxima aula de Artes é só daqui a 14 dias —
      // a quarta seguinte (23/09) pertence à ACC.
      expect(suggestDueDateFromSchedule(artes, "2026-09-16")?.dueAt).toBe("2026-09-30");
    });

    it("respeita a âncora da matéria pareada", () => {
      const acc = {
        name: "ACC",
        classDays: ["wed"] as const,
        alternatingSlots: [{ day: "wed" as const, anchorIso: "2026-09-23" }],
      };
      expect(suggestDueDateFromSchedule(acc, MONDAY)?.dueAt).toBe("2026-09-23");
    });
  });
});
