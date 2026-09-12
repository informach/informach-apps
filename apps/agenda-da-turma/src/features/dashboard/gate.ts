// School configuration is progressive. An incomplete profile never hides
// another child's routine, extracurriculars or administrative notices.
export type DashboardGate = { kind: "no-students" } | { kind: "ready" };
export type DashboardGateInput = {
  profilesCount: number;
  profilesWithoutTurmaCount: number;
  turmasNeedingSubjectsCount: number;
};
export function pickDashboardGate(input: DashboardGateInput): DashboardGate {
  return input.profilesCount === 0 ? { kind: "no-students" } : { kind: "ready" };
}
