import { describe, expect, it } from "vitest";
import { computeFirstSteps, type FirstStepsInput, firstStepsProgress } from "./first-steps";

const empty: FirstStepsInput = {
  profileCount: 0,
  profilesWithoutTurma: 0,
  turmasNeedingSchedule: [],
  activityCount: 0,
};
const ids = (input: FirstStepsInput) =>
  Object.fromEntries(computeFirstSteps(input).map((step) => [step.id, step.done]));

describe("computeFirstSteps", () => {
  it("starts with nothing done and nothing skipped", () => {
    expect(ids(empty)).toEqual({
      crianca: false,
      turma: false,
      horario: false,
      atividade: false,
    });
    expect(firstStepsProgress(computeFirstSteps(empty))).toEqual({
      done: 0,
      total: 4,
      complete: false,
    });
  });
  it("closes the turma step only when every child is linked", () => {
    const onlyChild = { ...empty, profileCount: 1, profilesWithoutTurma: 1 };
    expect(ids(onlyChild)).toMatchObject({ crianca: true, turma: false });
    expect(ids({ ...onlyChild, profilesWithoutTurma: 0 })).toMatchObject({
      crianca: true,
      turma: true,
    });
    // Três filhos, um vinculado: ainda há trabalho por fazer.
    expect(ids({ ...empty, profileCount: 3, profilesWithoutTurma: 2 })).toMatchObject({
      turma: false,
    });
  });
  it("closes the horário step when no turma is missing a schedule", () => {
    const linked = { ...empty, profileCount: 1, profilesWithoutTurma: 0 };
    expect(ids({ ...linked, turmasNeedingSchedule: [{ turmaId: "t1" }] })).toMatchObject({
      horario: false,
    });
    expect(ids(linked)).toMatchObject({ horario: true });
    // Sem turma, o horário não pode estar pronto.
    expect(ids({ ...empty, profileCount: 1, profilesWithoutTurma: 1 })).toMatchObject({
      horario: false,
    });
  });
  it("points the horário step at the turma that still needs a schedule", () => {
    const steps = computeFirstSteps({
      ...empty,
      profileCount: 1,
      profilesWithoutTurma: 0,
      turmasNeedingSchedule: [{ turmaId: "t1" }, { turmaId: "t2" }],
    });
    expect(steps.find((s) => s.id === "horario")?.href).toBe("/turmas/t1/materias");
    expect(computeFirstSteps(empty).find((s) => s.id === "horario")?.href).toBe("/familia/turmas");
  });
  it("completes when every step is satisfied", () => {
    const done = computeFirstSteps({
      profileCount: 1,
      profilesWithoutTurma: 0,
      turmasNeedingSchedule: [],
      activityCount: 3,
    });
    expect(firstStepsProgress(done)).toEqual({ done: 4, total: 4, complete: true });
  });
});
