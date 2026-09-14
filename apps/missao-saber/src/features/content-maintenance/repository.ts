import "server-only";
import { and, db, desc, eq, inArray, sql } from "@informach/db";
import {
  missaoContentControls,
  missaoProfiles,
  missaoReports,
  missaoReportUpdates,
  missaoSessions,
  users,
} from "@informach/db/schema";

export async function managerIdentity(userId: string) {
  const [user] = await db
    .select({ email: users.email, verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));
  return user;
}

export async function maintenanceHistory(page = 0) {
  return db
    .select()
    .from(missaoContentControls)
    .orderBy(desc(missaoContentControls.createdAt), desc(missaoContentControls.id))
    .limit(201)
    .offset(page * 200);
}
export async function contentReports(status: "pending" | "resolved" = "pending", page = 0) {
  const recurrence = sql<number>`(
    select count(*)::int from ${missaoReports} recurring
    where recurring.lesson_id = ${missaoReports.lessonId}
      and recurring.item_id = ${missaoReports.itemId}
      and recurring.category is not distinct from ${missaoReports.category}
  )`;
  const priority = sql<number>`case ${missaoReports.category}
    when 'possible_error' then 4 when 'figure_issue' then 3
    when 'app_difficulty' then 2 else 1 end`;
  return db
    .select({
      id: missaoReports.id,
      userId: missaoReports.userId,
      profileId: missaoReports.profileId,
      profileNickname: missaoProfiles.nickname,
      sessionId: missaoReports.sessionId,
      lessonId: missaoReports.lessonId,
      version: missaoReports.version,
      itemId: missaoReports.itemId,
      category: missaoReports.category,
      detail: missaoReports.detail,
      status: missaoReports.status,
      createdAt: missaoReports.createdAt,
      recurrence,
      priority,
      snapshot: missaoSessions.snapshot,
    })
    .from(missaoReports)
    .leftJoin(missaoProfiles, eq(missaoProfiles.id, missaoReports.profileId))
    .leftJoin(missaoSessions, eq(missaoSessions.id, missaoReports.sessionId))
    .where(
      status === "resolved"
        ? eq(missaoReports.status, "resolved")
        : inArray(missaoReports.status, ["open", "investigating"]),
    )
    .orderBy(desc(priority), desc(recurrence), missaoReports.createdAt, missaoReports.id)
    .limit(51)
    .offset(page * 50);
}

export async function reportedVersion(reportId: string) {
  const [row] = await db
    .select({
      report: missaoReports,
      snapshot: missaoSessions.snapshot,
    })
    .from(missaoReports)
    .innerJoin(missaoSessions, eq(missaoSessions.id, missaoReports.sessionId))
    .where(eq(missaoReports.id, reportId));
  return row ?? null;
}
export async function reportHistory(reportIds: string[]) {
  if (!reportIds.length) return [];
  return db
    .select()
    .from(missaoReportUpdates)
    .where(inArray(missaoReportUpdates.reportId, reportIds))
    .orderBy(missaoReportUpdates.createdAt, missaoReportUpdates.id);
}
export async function recordContentControl(input: typeof missaoContentControls.$inferInsert) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`missao:content:${input.lessonId}`}, 0))`,
    );
    await tx.insert(missaoContentControls).values(input);
  });
}
export async function updateReport(
  actorId: string,
  id: string,
  status: "investigating" | "resolved",
  note: string,
) {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(missaoReports)
      .where(eq(missaoReports.id, id))
      .for("update");
    if (!report) return null;
    if (report.status === status && report.resolution === note) return report;
    if (report.status === "resolved") return report;
    const now = new Date();
    const [updated] = await tx
      .update(missaoReports)
      .set({
        status,
        resolution: note,
        resolvedAt: status === "resolved" ? now : null,
        resolvedBy: status === "resolved" ? actorId : null,
      })
      .where(
        and(eq(missaoReports.id, id), inArray(missaoReports.status, ["open", "investigating"])),
      )
      .returning();
    if (updated)
      await tx.insert(missaoReportUpdates).values({ reportId: id, actorId, status, note });
    return updated ?? report;
  });
}
