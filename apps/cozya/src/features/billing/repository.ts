import type { SubjectRef } from "@informach/billing";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";

export const billingDb = db;

export async function findUserEmailById(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.email ?? null;
}

export async function resolveSubjectEmail(subject: SubjectRef): Promise<string> {
  if (subject.type !== "user") {
    throw new Error(`@informach/cozya: only user subjects are supported, got '${subject.type}'`);
  }

  const email = await findUserEmailById(subject.id);
  if (!email) {
    throw new Error(`@informach/cozya: user ${subject.id} not found`);
  }

  return email;
}
