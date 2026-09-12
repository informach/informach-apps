import { addDaysIso } from "@/features/dashboard/date";
import type { NoticeActionInput } from "@/features/notices/schemas";

// Suggestions are only applied by an explicit family action. They never
// change the deadline extracted from the school communication.
export function suggestReminder(action: Pick<NoticeActionInput, "dueAt" | "type">) {
  if (!action.dueAt) return null;
  const days =
    action.type === "material" || action.type === "exam" || action.type === "project" ? 2 : 1;
  return new Date(`${addDaysIso(action.dueAt, -days)}T19:00:00-03:00`).toISOString();
}
