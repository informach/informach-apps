import { describe, expect, it } from "vitest";
import { applyRoutineStatusChange } from "./routine-optimistic";
import type { DashboardCounters } from "./types";

const TODAY = "2026-09-14";

function counters(overrides: Partial<DashboardCounters> = {}): DashboardCounters {
  return { overdue: 3, today: 2, week: 5, doneRecent: 1, ...overrides };
}

describe("applyRoutineStatusChange", () => {
  it("tira de 'hoje' e soma em concluídas ao concluir uma atividade de hoje", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, TODAY, "pending", "done");
    expect(next.today).toBe(1);
    expect(next.doneRecent).toBe(2);
    expect(next.overdue).toBe(3);
    expect(next.week).toBe(5);
  });

  it("devolve o item ao bucket ao reabrir", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, TODAY, "done", "pending");
    expect(next.today).toBe(3);
    expect(next.doneRecent).toBe(0);
  });

  it("usa o bucket de atrasadas quando o prazo já passou", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, "2026-09-10", "pending", "done");
    expect(next.overdue).toBe(2);
    expect(next.doneRecent).toBe(2);
  });

  it("usa o bucket dos próximos sete dias", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, "2026-09-20", "pending", "done");
    expect(next.week).toBe(4);
    // Fora da janela de sete dias atrás → não entra em "concluídas (7d)".
    expect(next.doneRecent).toBe(1);
  });

  it("não mexe em contador de janela para prazo além dos sete dias", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, "2026-12-01", "pending", "done");
    expect(next).toEqual(counters());
  });

  // Itens vindos de recado podem não ter prazo: aparecem em "para cuidar
  // hoje", mas não são atrasados nem de hoje — concluir não pode mexer nos KPIs.
  it("ignora atividade sem prazo", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, null, "pending", "done");
    expect(next).toEqual(counters());
  });

  it("não faz nada quando o status não muda", () => {
    const next = applyRoutineStatusChange(counters(), TODAY, TODAY, "done", "done");
    expect(next).toEqual(counters());
  });

  it("nunca deixa um contador negativo", () => {
    const next = applyRoutineStatusChange(
      counters({ today: 0, doneRecent: 0 }),
      TODAY,
      TODAY,
      "done",
      "pending",
    );
    expect(next.today).toBe(1);
    expect(next.doneRecent).toBe(0);
  });
});
