import "server-only";
import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  emailUnsubscribes,
  familyAccessGrants,
  familyAppProfiles,
  familyPeople,
  missaoFamilies,
  missaoProfiles,
  users,
  webParticipations,
} from "@informach/db/schema";
import type { ParentAuthority } from "./authority";
import { studentAccessCondition } from "./scope";

/** Stable authorization references bind an email body to the exact readable population. */
export async function weeklySnapshot(actor: ParentAuthority) {
  return db
    .select({
      id: missaoProfiles.id,
      grantId: familyAccessGrants.id,
      delegationKey: familyAppProfiles.delegationKey,
      version: familyPeople.version,
      nickname: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
      grade: missaoProfiles.grade,
      gradeYear: missaoProfiles.gradeYear,
      courseId: missaoProfiles.courseId,
      webRevision: sql<number>`coalesce(${webParticipations.revision}, 0)`,
    })
    .from(missaoProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .leftJoin(webParticipations, eq(webParticipations.userId, actor.userId))
    .innerJoin(
      familyAccessGrants,
      and(
        eq(familyAccessGrants.profileId, familyAppProfiles.id),
        eq(familyAccessGrants.userId, actor.userId),
        eq(familyAccessGrants.action, "read"),
      ),
    )
    .where(studentAccessCondition(actor, missaoProfiles.id))
    .orderBy(missaoProfiles.id);
}
export type WeeklyReceipt = {
  actor: ParentAuthority;
  students: Awaited<ReturnType<typeof weeklySnapshot>>;
};
export async function mayDeliverWeeklySnapshot(
  userId: string,
  email: string,
  receipts: WeeklyReceipt[],
) {
  const [recipient] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(missaoFamilies, eq(missaoFamilies.userId, users.id))
    .leftJoin(
      emailUnsubscribes,
      and(
        eq(emailUnsubscribes.userId, users.id),
        eq(emailUnsubscribes.category, "missao.weekly-report"),
      ),
    )
    .where(
      and(
        eq(users.id, userId),
        eq(users.email, email),
        eq(users.emailVerified, true),
        activeWebParticipationCondition(users.id),
        eq(missaoFamilies.weeklyReportEmail, true),
        isNull(emailUnsubscribes.userId),
        sql`(${users.banned} = false OR ${users.banExpiresAt} <= statement_timestamp())`,
      ),
    );
  if (!recipient || !receipts.length) return false;
  for (const receipt of receipts) {
    if (
      receipt.actor.userId !== userId ||
      JSON.stringify(await weeklySnapshot(receipt.actor)) !== JSON.stringify(receipt.students)
    )
      return false;
  }
  return true;
}
