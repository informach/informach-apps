import "server-only";
import { eq, inArray } from "@informach/db";
import { agendaActivities, agendaSubjects, agendaTasks, agendaTurmas } from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";

type Dependencies = {
  classIds?: readonly string[];
  taskIds?: readonly string[];
  subjectIds?: readonly string[];
};
const lockedSchoolContext = Symbol("agenda-school-context");
export type SchoolContextLocks = {
  readonly [lockedSchoolContext]: true;
  readonly classIds: ReadonlySet<string>;
};
async function dependencyClasses(tx: FamilyTransaction, dependencies: Dependencies) {
  const taskIds = [...new Set(dependencies.taskIds ?? [])];
  const subjectIds = [...new Set(dependencies.subjectIds ?? [])];
  requireFamilyCondition(taskIds.length <= 100 && subjectIds.length <= 100, "INVALID_INPUT");
  const classes = new Set(dependencies.classIds ?? []);
  requireFamilyCondition(classes.size <= 100, "INVALID_INPUT");
  if (subjectIds.length) {
    const rows = await tx
      .select({ id: agendaSubjects.turmaId })
      .from(agendaSubjects)
      .where(inArray(agendaSubjects.id, subjectIds));
    for (const row of rows) classes.add(row.id);
  }
  if (taskIds.length) {
    const subjects = await tx
      .select({ id: agendaSubjects.turmaId })
      .from(agendaTasks)
      .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaTasks.subjectId))
      .where(inArray(agendaTasks.id, taskIds));
    const publications = await tx
      .select({ id: agendaActivities.turmaId })
      .from(agendaTasks)
      .innerJoin(agendaActivities, eq(agendaActivities.id, agendaTasks.sharedActivityId))
      .where(inArray(agendaTasks.id, taskIds));
    for (const row of [...subjects, ...publications]) classes.add(row.id);
  }
  return [...classes].sort();
}
/** School dependency → family → native profile → task/publication. Never acquire this after family locks. */
export async function lockTaskSchoolContexts(
  tx: FamilyTransaction,
  dependencies: Dependencies,
): Promise<SchoolContextLocks> {
  const ids = await dependencyClasses(tx, dependencies);
  if (ids.length) {
    const locked = await tx
      .select({ id: agendaTurmas.id })
      .from(agendaTurmas)
      .where(inArray(agendaTurmas.id, ids))
      .orderBy(agendaTurmas.id)
      .for("update");
    requireFamilyCondition(
      locked.length === ids.length,
      "CONFLICT",
      "A turma mudou. Atualize a página.",
    );
  }
  return { [lockedSchoolContext]: true, classIds: new Set(ids) };
}
/** Recheck after native rows are locked; a changed dependency must restart from the page, never invert locks. */
export async function assertTaskSchoolContexts(
  tx: FamilyTransaction,
  locks: SchoolContextLocks,
  dependencies: Dependencies,
) {
  const current = await dependencyClasses(tx, dependencies);
  requireFamilyCondition(
    locks[lockedSchoolContext] && current.every((id) => locks.classIds.has(id)),
    "CONFLICT",
    "A turma da atividade mudou. Atualize a página.",
  );
}
