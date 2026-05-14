// Lógica pura de gate de onboarding do dashboard. Extraído de
// `app/(app)/dashboard/page.tsx` pra unit test sem montar RSC + DB.
//
// Os 3 widgets de onboarding são mutuamente exclusivos e ordenados:
//   1. NoStudentsWidget — antes de qualquer outra coisa, criar perfis.
//   2. ProfilesWithoutTurmaWidget — perfis criados mas algum sem turma ativa.
//   3. NoSubjectsWidget — turma ativa existe mas não tem matérias cadastradas.
//   4. Onboarding completo → mostra dashboard real.
//
// Se essa ordem mudar (ex: "matérias antes de turma" — não vai), atualizar
// `pickDashboardGate` + atualizar `dashboard-content-skeleton`/page.tsx.

export type DashboardGate =
  | { kind: "no-students" }
  | { kind: "profiles-without-turma"; count: number }
  | { kind: "no-subjects" }
  | { kind: "ready" };

export type DashboardGateInput = {
  profilesCount: number;
  profilesWithoutTurmaCount: number;
  turmasNeedingSubjectsCount: number;
};

export function pickDashboardGate(input: DashboardGateInput): DashboardGate {
  if (input.profilesCount === 0) return { kind: "no-students" };
  if (input.profilesWithoutTurmaCount > 0) {
    return { kind: "profiles-without-turma", count: input.profilesWithoutTurmaCount };
  }
  if (input.turmasNeedingSubjectsCount > 0) return { kind: "no-subjects" };
  return { kind: "ready" };
}
