import "server-only";
import { sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { profileAccessCondition } from "@informach/family/access";

// Attribution remains in history; an adult without current permission cannot
// remain responsible in the routine, its filters, reminders or edit defaults.
export const currentAssigneeId = sql<string | null>`CASE WHEN ${profileAccessCondition(
  agendaTasks.assignedToUserId,
  "agenda-da-turma",
  agendaStudentProfiles.familyProfileId,
)} THEN ${agendaTasks.assignedToUserId} ELSE NULL END`;
