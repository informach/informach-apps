import "server-only";
import { and, db, desc, eq } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
  agendaStudentProfiles,
  agendaTasks,
  users,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
export async function findActivityHistory(userId: string, id: string) {
  const accessible = await db
    .select({ activity: agendaActivities, ownerId: agendaStudentProfiles.userId })
    .from(agendaActivities)
    .innerJoin(agendaTasks, eq(agendaTasks.sharedActivityId, agendaActivities.id))
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaActivities.id, id), accessibleProfileCondition(userId)));
  const [activity] = accessible;
  if (!activity) return null;
  const canReadPrivate = accessible.some(
    (row) => row.ownerId === activity.activity.createdByUserId,
  );
  if (!canReadPrivate && activity.activity.visibility !== "shared_with_turma") return null;
  const history = await db
    .select({ revision: agendaActivityRevisions, name: users.name })
    .from(agendaActivityRevisions)
    .leftJoin(users, eq(users.id, agendaActivityRevisions.actorId))
    .where(eq(agendaActivityRevisions.activityId, id))
    .orderBy(desc(agendaActivityRevisions.version));
  // Authorization applies to each snapshot, including the private state before
  // publication. A current recipient must never receive those old fields.
  const visibleHistory = canReadPrivate
    ? history
    : history
        .filter(({ revision }) => revision.current.visibility === "shared_with_turma")
        .map((row) => ({
          ...row,
          revision: {
            ...row.revision,
            previous:
              row.revision.previous.visibility === "shared_with_turma" ? row.revision.previous : {},
          },
        }));
  return { activity: activity.activity, history: visibleHistory };
}
