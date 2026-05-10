import "server-only";

import { and, asc, count, type Database, db, eq, sql } from "@informach/db";
import { type AgendaStudentProfile, agendaStudentProfiles } from "@informach/db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

export type NewStudentProfilePayload = {
  userId: string;
  name: string;
  birthDate: string;
};

export type StudentProfileUpdatePayload = Pick<NewStudentProfilePayload, "name" | "birthDate">;

export type InsertWithinLimitResult =
  | { ok: true; profile: AgendaStudentProfile }
  | { ok: false; current: number };

export async function insertStudentProfile(
  payload: NewStudentProfilePayload,
): Promise<AgendaStudentProfile> {
  return insertStudentProfileWithClient(db, payload);
}

export async function insertStudentProfileWithinLimit(
  payload: NewStudentProfilePayload,
  limit: number,
): Promise<InsertWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      await lockProfileLimitForUser(tx, payload.userId);

      const current = await countProfilesByUserWithClient(tx, payload.userId);
      if (current >= limit) {
        return { ok: false as const, current };
      }

      const profile = await insertStudentProfileWithClient(tx, payload);
      return { ok: true as const, profile };
    },
    { isolationLevel: "read committed" },
  );
}

async function insertStudentProfileWithClient(
  client: DbClient,
  payload: NewStudentProfilePayload,
): Promise<AgendaStudentProfile> {
  const inserted = await client.insert(agendaStudentProfiles).values(payload).returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("agenda.student_profiles: insert returning empty");
  }
  return row;
}

async function lockProfileLimitForUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:student_profiles:${userId}`}))`,
  );
}

export async function findStudentProfilesByUser(userId: string): Promise<AgendaStudentProfile[]> {
  return db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, userId))
    .orderBy(asc(agendaStudentProfiles.createdAt));
}

export async function findStudentProfileByIdForUser(
  userId: string,
  id: string,
): Promise<AgendaStudentProfile | null> {
  const [row] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.userId, userId), eq(agendaStudentProfiles.id, id)))
    .limit(1);
  return row ?? null;
}

export async function updateStudentProfileForUser(
  userId: string,
  id: string,
  payload: StudentProfileUpdatePayload,
): Promise<AgendaStudentProfile | null> {
  const [row] = await db
    .update(agendaStudentProfiles)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(agendaStudentProfiles.userId, userId), eq(agendaStudentProfiles.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteStudentProfileForUser(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.userId, userId), eq(agendaStudentProfiles.id, id)))
    .returning({ id: agendaStudentProfiles.id });
  return rows.length > 0;
}

export async function countStudentProfilesByUser(userId: string): Promise<number> {
  return countProfilesByUserWithClient(db, userId);
}

async function countProfilesByUserWithClient(client: DbClient, userId: string): Promise<number> {
  const [row] = await client
    .select({ count: count() })
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, userId));
  return Number(row?.count ?? 0);
}
