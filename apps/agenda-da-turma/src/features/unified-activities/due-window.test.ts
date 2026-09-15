import { describe, expect, it } from "vitest";
import { addDaysIso } from "@/features/dashboard/date";
import { dueWindowRange, dueWindowSchema } from "./overview-types";

/**
 * A janela de prazo existe para que os contadores da rotina possam LEVAR à
 * lista. Os limites abaixo replicam os `COUNT(*) FILTER` de
 * `getRoutineCounters` — se um dos dois mudar sem o outro, um contador passa a
 * abrir uma lista que discorda dele, que é pior do que um contador que não
 * abre nada.
 */
describe("dueWindowRange", () => {
  const today = "2026-05-11";

  it("atrasadas termina na véspera e não tem início", () => {
    // `getRoutineCounters`: status = 'pending' AND due_at < today
    expect(dueWindowRange("atrasadas", today, addDaysIso)).toEqual({
      from: null,
      to: "2026-05-10",
    });
  });

  it("hoje é o próprio dia, dos dois lados", () => {
    // `getRoutineCounters`: status = 'pending' AND due_at = today
    expect(dueWindowRange("hoje", today, addDaysIso)).toEqual({
      from: today,
      to: today,
    });
  });

  it("semana vai de amanhã ao sétimo dia", () => {
    // `getRoutineCounters`: due_at BETWEEN tomorrow AND today + 7
    expect(dueWindowRange("semana", today, addDaysIso)).toEqual({
      from: "2026-05-12",
      to: "2026-05-18",
    });
  });

  it("recentes cobre os sete dias até hoje", () => {
    // `getRoutineCounters`: due_at BETWEEN today - 7 AND today
    expect(dueWindowRange("recentes", today, addDaysIso)).toEqual({
      from: "2026-05-04",
      to: today,
    });
  });

  it("sem recorte não impõe limite nenhum", () => {
    expect(dueWindowRange("all", today, addDaysIso)).toEqual({ from: null, to: null });
  });

  it("atravessa a virada do mês e do ano pela mesma aritmética de string", () => {
    expect(dueWindowRange("semana", "2026-12-29", addDaysIso)).toEqual({
      from: "2026-12-30",
      to: "2027-01-05",
    });
    expect(dueWindowRange("atrasadas", "2026-03-01", addDaysIso)).toEqual({
      from: null,
      to: "2026-02-28",
    });
  });

  it("cobre todos os valores do vocabulário", () => {
    for (const window of dueWindowSchema.options) {
      expect(() => dueWindowRange(window, today, addDaysIso)).not.toThrow();
    }
  });
});
