import type { ActivityListItem } from "@/features/activities/types";
import type { ProfileSubjectActivityListItem } from "@/features/profile-subject-activities/types";

// Discriminated union usada pelas vistas que misturam atividades de turma e
// extracurriculares (dashboard buckets, calendar range). Item de turma ganha
// `source: "turma"` no boundary; item extracurricular já vem com `source:
// "extra"` do repositório próprio. Renderers (cards, blips) verificam
// `source` antes de acessar campos exclusivos como `schoolName` (só turma)
// ou `profileSubjectStatus` (só extra).
export type UnifiedActivityListItem =
  | (ActivityListItem & { source: "turma" })
  | ProfileSubjectActivityListItem;

export function withTurmaSource(item: ActivityListItem): ActivityListItem & { source: "turma" } {
  return { ...item, source: "turma" as const };
}
