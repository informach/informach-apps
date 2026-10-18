import { describe, expect, it } from "vitest";
import {
  failureText,
  type LastRun,
  lateAfterMinutes,
  ROUTINES,
  routineState,
  summaryText,
} from "./routines";

const now = new Date("2026-10-17T15:00:00Z");
const every5 = {
  app: "cozya",
  job: "email-retry",
  label: "x",
  intervalMinutes: 5,
  schedule: "a cada 5 minutos",
};
const daily = { ...every5, job: "billing-reconcile", intervalMinutes: 24 * 60 };
const hourly = { ...every5, job: "cozya-retention", intervalMinutes: 60 };
const sixHours = { ...every5, job: "billing-dunning", intervalMinutes: 6 * 60 };

function routine(app: string, job: string) {
  const found = ROUTINES.find((item) => item.app === app && item.job === job);
  if (!found) throw new Error(`rotina ${app}/${job} fora do catálogo`);
  return found;
}

function run(minutesAgo: number, overrides: Partial<LastRun> = {}): LastRun {
  const startedAt = new Date(now.getTime() - minutesAgo * 60_000);
  return {
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 2000),
    ok: true,
    errorName: null,
    summary: {},
    ...overrides,
  };
}

describe("situação das rotinas", () => {
  it("rotina de até uma hora atrasa depois de duas vezes e meia a frequência", () => {
    expect(routineState(every5, run(12), now)).toBe("ok");
    expect(routineState(every5, run(13), now)).toBe("late");
    expect(lateAfterMinutes(hourly)).toBe(150);
  });

  it("rotina diária atrasa com 26 horas, e a de seis horas com oito", () => {
    expect(lateAfterMinutes(daily)).toBe(26 * 60);
    expect(routineState(daily, run(25 * 60), now)).toBe("ok");
    expect(routineState(daily, run(27 * 60), now)).toBe("late");
    expect(lateAfterMinutes(sixHours)).toBe(8 * 60);
  });

  it("rotina de segunda e terça atrasa com oito dias, não com dezessete", () => {
    const weekly = routine("missao-saber", "weekly-report");
    // De terça a segunda são seis dias: ainda em dia.
    expect(routineState(weekly, run(6 * 24 * 60), now)).toBe("ok");
    expect(routineState(weekly, run(8 * 24 * 60 + 1), now)).toBe("late");
    expect(lateAfterMinutes(routine("admin", "admin-weekly"))).toBe(8 * 24 * 60);
  });

  it("execução sem fim para no meio pelo tempo máximo da rotina, não pela frequência", () => {
    const weekly = routine("missao-saber", "weekly-report");
    expect(routineState(weekly, run(50, { finishedAt: null, ok: null }), now)).toBe("running");
    expect(routineState(weekly, run(61, { finishedAt: null, ok: null }), now)).toBe("interrupted");
    // Antes, uma rotina semanal ficava "em execução" por uma semana inteira.
    const adminWeekly = routine("admin", "admin-weekly");
    expect(routineState(adminWeekly, run(31, { finishedAt: null, ok: null }), now)).toBe(
      "interrupted",
    );
    expect(routineState(daily, run(31, { finishedAt: null, ok: null }), now)).toBe("interrupted");
  });

  it("mostra falha recente e execução sem fim", () => {
    expect(routineState(every5, run(3, { ok: false, errorName: "Http503" }), now)).toBe("failed");
    expect(routineState(every5, run(2, { finishedAt: null, ok: null }), now)).toBe("running");
    expect(routineState(every5, run(45, { finishedAt: null, ok: null }), now)).toBe("interrupted");
  });

  it("diferencia rotina parada de propósito de rotina que nunca rodou", () => {
    expect(routineState(every5, null, now)).toBe("never");
    expect(routineState({ ...every5, pausedNote: "Parada." }, null, now)).toBe("paused");
    // Ligada de novo: volta a ser avaliada pelas execuções.
    expect(routineState({ ...every5, pausedNote: "Parada." }, run(1), now)).toBe("ok");
  });

  it("a conciliação da Suíte Edi, ligada com a cobrança, sem registro é nunca rodou", () => {
    const edi = routine("edi", "reconcile");
    expect(edi.pausedNote).toBeUndefined();
    expect(routineState(edi, null, now)).toBe("never");
    // Hoje todos os crons do catálogo estão ligados no Railway.
    expect(ROUTINES.filter((item) => item.pausedNote)).toEqual([]);
  });

  it("escreve a falha e o resumo em português, sem texto livre", () => {
    expect(failureText("Http503")).toBe("respondeu 503");
    expect(failureText("PostgresError")).toBe("falhou com PostgresError");
    expect(failureText(null)).toBe("falhou");
    expect(summaryText({ released: 1, retried: 2, mystery: 9 })).toBe("1 liberada, 2 reenviados");
    expect(summaryText({ ok: true })).toBe("sem números");
  });

  it("não repete rotina no catálogo", () => {
    const keys = ROUTINES.map((routine) => `${routine.app}/${routine.job}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
