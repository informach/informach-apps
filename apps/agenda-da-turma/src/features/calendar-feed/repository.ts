import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { agendaCalendarFeeds } from "@informach/db/schema";
import { hashFamilyToken } from "@/features/family/tokens";
export async function replaceCalendarFeed(userId: string, token: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:feed:${userId}`}))`);
    await tx
      .update(agendaCalendarFeeds)
      .set({ revokedAt: new Date() })
      .where(eq(agendaCalendarFeeds.userId, userId));
    await tx.insert(agendaCalendarFeeds).values({ userId, tokenHash: hashFamilyToken(token) });
  });
}
export async function deleteCalendarFeeds(userId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:feed:${userId}`}))`);
    await tx
      .update(agendaCalendarFeeds)
      .set({ revokedAt: new Date() })
      .where(eq(agendaCalendarFeeds.userId, userId));
  });
}
export async function findActiveCalendarFeed(userId: string) {
  const [row] = await db
    .select({ id: agendaCalendarFeeds.id })
    .from(agendaCalendarFeeds)
    .where(
      and(eq(agendaCalendarFeeds.userId, userId), sql`${agendaCalendarFeeds.revokedAt} IS NULL`),
    );
  return Boolean(row);
}
export async function findCalendarFeedByToken(token: string) {
  const [feed] = await db
    .select()
    .from(agendaCalendarFeeds)
    .where(
      and(
        eq(agendaCalendarFeeds.tokenHash, hashFamilyToken(token)),
        sql`${agendaCalendarFeeds.revokedAt} IS NULL`,
      ),
    );
  return feed ?? null;
}
