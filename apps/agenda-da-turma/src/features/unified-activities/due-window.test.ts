import { describe, expect, it } from "vitest";
import { addDaysIso } from "@/features/dashboard/date";
import { dueWindowRange, dueWindowSchema } from "./overview-types";

/**
 * As janelas de prazo do filtro da lista. "Semana" termina no mesmo sétimo dia
 * do bucket da semana em Hoje (`listRoutineIndex`): a lista recortada e a
 * rotina falam do mesmo intervalo.
 */
describe("dueWindowRange", () => {
  const today = "2026-05-11";

  it("atrasadas termina na véspera e não tem início", () => {
    expect(dueWindowRange("atrasadas", today, addDaysIso)).toEqual({
      from: null,
      to: "2026-05-10",
      column: "due",
    });
  });

  it("hoje é o próprio dia, dos dois lados", () => {
    expect(dueWindowRange("hoje", today, addDaysIso)).toEqual({
      from: today,
      to: today,
      column: "due",
    });
  });

  it("semana vai de amanhã ao sétimo dia", () => {
    // O mesmo limite de `listRoutineIndex`: due_at <= today + 7.
    expect(dueWindowRange("semana", today, addDaysIso)).toEqual({
      from: "2026-05-12",
      to: "2026-05-18",
      column: "due",
    });
  });

  it("recentes cobre os sete dias até hoje, medidos pela CONCLUSÃO", () => {
    // done AND completed_at (no fuso do app) BETWEEN today - 7 AND today. É a
    // única janela que não olha o prazo: concluir hoje uma tarefa vencida há
    // três semanas precisa entrar na conta.
    expect(dueWindowRange("recentes", today, addDaysIso)).toEqual({
      from: "2026-05-04",
      to: today,
      column: "completed",
    });
  });

  it("só a janela de concluídas troca de coluna", () => {
    const byDue = (["atrasadas", "hoje", "semana", "all"] as const).map(
      (w) => dueWindowRange(w, today, addDaysIso).column,
    );
    expect(byDue).toEqual(["due", "due", "due", "due"]);
    expect(dueWindowRange("recentes", today, addDaysIso).column).toBe("completed");
  });

  it("sem recorte não impõe limite nenhum", () => {
    expect(dueWindowRange("all", today, addDaysIso)).toEqual({
      from: null,
      to: null,
      column: "due",
    });
  });

  it("atravessa a virada do mês e do ano pela mesma aritmética de string", () => {
    expect(dueWindowRange("semana", "2026-12-29", addDaysIso)).toEqual({
      from: "2026-12-30",
      to: "2027-01-05",
      column: "due",
    });
    expect(dueWindowRange("atrasadas", "2026-03-01", addDaysIso)).toEqual({
      from: null,
      to: "2026-02-28",
      column: "due",
    });
  });

  it("cobre todos os valores do vocabulário", () => {
    for (const window of dueWindowSchema.options) {
      expect(() => dueWindowRange(window, today, addDaysIso)).not.toThrow();
    }
  });
});
