import type { NoticeCalendarItem } from "@/features/unified-activities/types";
import type { NoticeActionRow } from "./repository";
import { ACTION_LABELS } from "./schemas";

export function noticeCalendarItems(rows: NoticeActionRow[]): NoticeCalendarItem[] {
  return rows.flatMap((row) => {
    const a = row.action;
    if (!a.dueAt || a.status === "canceled") return [];
    return [
      {
        source: "notice",
        activityId: a.id,
        studentProfileId: a.profileId,
        studentProfileName: row.profileName,
        title: a.title,
        description: a.description,
        dueAt: a.dueAt,
        activityCreatedAt: a.createdAt,
        createdByUserId: a.createdByUserId,
        status: a.status,
        // Existing calendar glyphs classify administrative actions as reminders;
        // the precise label and full domain object are retained for display.
        type: a.type === "task" || a.type === "exam" || a.type === "project" ? a.type : "reminder",
        subjectName: ACTION_LABELS[a.type],
        subjectColorIndex: 0,
        routineItem: row,
      },
    ];
  });
}
