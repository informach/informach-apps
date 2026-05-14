import { describe, expect, it } from "vitest";
import { type DashboardGateInput, pickDashboardGate } from "./gate";

function input(overrides: Partial<DashboardGateInput> = {}): DashboardGateInput {
  return {
    profilesCount: 1,
    profilesWithoutTurmaCount: 0,
    turmasNeedingSubjectsCount: 0,
    ...overrides,
  };
}

describe("pickDashboardGate", () => {
  it("retorna no-students quando user não tem perfis", () => {
    expect(pickDashboardGate(input({ profilesCount: 0 }))).toEqual({ kind: "no-students" });
  });

  it("no-students tem prioridade sobre outros sinais", () => {
    // Hipótese impossível na prática (sem perfis → não há perfil sem turma)
    // mas o gate ordena defensivamente: profilesCount=0 sempre ganha.
    expect(
      pickDashboardGate(
        input({
          profilesCount: 0,
          profilesWithoutTurmaCount: 5,
          turmasNeedingSubjectsCount: 3,
        }),
      ),
    ).toEqual({ kind: "no-students" });
  });

  it("retorna profiles-without-turma quando há perfis mas algum sem turma", () => {
    expect(pickDashboardGate(input({ profilesCount: 2, profilesWithoutTurmaCount: 1 }))).toEqual({
      kind: "profiles-without-turma",
      count: 1,
    });
  });

  it("profiles-without-turma propaga o count", () => {
    expect(pickDashboardGate(input({ profilesCount: 3, profilesWithoutTurmaCount: 2 }))).toEqual({
      kind: "profiles-without-turma",
      count: 2,
    });
  });

  it("profiles-without-turma tem prioridade sobre no-subjects", () => {
    expect(
      pickDashboardGate(
        input({
          profilesCount: 2,
          profilesWithoutTurmaCount: 1,
          turmasNeedingSubjectsCount: 1,
        }),
      ),
    ).toEqual({ kind: "profiles-without-turma", count: 1 });
  });

  it("retorna no-subjects quando perfis e turmas OK mas turma sem matéria", () => {
    expect(
      pickDashboardGate(
        input({
          profilesCount: 1,
          profilesWithoutTurmaCount: 0,
          turmasNeedingSubjectsCount: 1,
        }),
      ),
    ).toEqual({ kind: "no-subjects" });
  });

  it("retorna ready quando onboarding completo", () => {
    expect(
      pickDashboardGate(
        input({
          profilesCount: 1,
          profilesWithoutTurmaCount: 0,
          turmasNeedingSubjectsCount: 0,
        }),
      ),
    ).toEqual({ kind: "ready" });
  });

  it("ready quando múltiplos perfis e turmas todos configurados", () => {
    expect(
      pickDashboardGate(
        input({
          profilesCount: 3,
          profilesWithoutTurmaCount: 0,
          turmasNeedingSubjectsCount: 0,
        }),
      ),
    ).toEqual({ kind: "ready" });
  });
});
