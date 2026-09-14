import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import type { NoticeCalendarItem } from "@/features/unified-activities/types";
import type { NoticeActionRow } from "./repository";

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
        type: a.type,
        // Com matéria vinculada, o item é lido por matéria como as atividades
        // escolares — mesmo nome e mesma cor `chart-N`. Sem vínculo, cai no
        // rótulo do tipo, que é o que existia antes para toda providência.
        subjectName: row.subjectName ?? ACTIVITY_TYPE_LABELS[a.type],
        subjectColorIndex: row.subjectColorIndex ?? 0,
        routineItem: row,
      },
    ];
  });
}
