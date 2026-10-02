import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  missaoAttempts,
  missaoFamilies,
  missaoProfiles,
  missaoSessions,
  users,
} from "@informach/db/schema";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/jobs/weekly-report/route";
import { findLesson } from "@/features/content/catalog";
import { weekStart } from "@/features/family/desafio";
import { completeWeeklyReport, listFamiliesForWeeklyReport } from "@/features/learning/repository";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";

const owners: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  emails.clearOutbox();
});
afterAll(async () => {
  await db.delete(users).where(inArray(users.id, owners));
});
const request = (query = "") =>
  new Request(`http://localhost:3005/api/jobs/weekly-report${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });

it("bounds batches, resumes pending families and preserves deduplication after a partial failure", async () => {
  const ids = Array.from({ length: 41 }, () => randomUUID()).sort();
  owners.push(...ids);
  await db
    .insert(users)
    .values(
      ids.map((id) => ({ id, email: `${id}@example.test`, name: "Lote", emailVerified: true })),
    );
  await db
    .insert(missaoFamilies)
    .values(ids.map((userId) => ({ userId, consentVersion: "test", weeklyReportEmail: true })));
  const profiles = await db
    .insert(missaoProfiles)
    .values(
      ids.map((userId) => ({
        userId,
        nickname: "Sol",
        grade: 6,
        avatar: "cometa",
        courseId: "canguru-e",
      })),
    )
    .returning();
  const lesson = findLesson("fracoes-1");
  if (!lesson) throw new Error("Missing fixture");
  const sessions = await db
    .insert(missaoSessions)
    .values(
      profiles.flatMap((profile) =>
        Array.from({ length: profile.userId === ids[0] ? 1000 : 20 }, (_, i) => ({
          profileId: profile.id,
          lessonId: lesson.id,
          version: lesson.version,
          mode: "mission" as const,
          snapshot: lesson,
          requestKey: randomUUID(),
          completedAt: new Date(),
          createdAt: new Date(Date.now() - i * 86_400_000),
        })),
      ),
    )
    .returning();
  const attempts = sessions.flatMap((session) =>
    lesson.items.map((item) => ({
      id: randomUUID(),
      sessionId: session.id,
      itemId: item.id,
      skillId: item.skillId,
      familyId: item.familyId,
      answer: "Teste de carga",
      correct: true,
      result: "correct" as const,
      helpCount: 0,
      createdAt: session.createdAt,
    })),
  );
  for (let i = 0; i < attempts.length; i += 500)
    await db.insert(missaoAttempts).values(attempts.slice(i, i + 500));
  const realSend = emails.sendEmail.bind(emails);
  const failedId = ids[0];
  vi.spyOn(emails, "sendEmail").mockImplementation((input) =>
    input.userId === failedId
      ? Promise.resolve({
          ok: false,
          status: "failed",
          deliveryId: randomUUID(),
          reason: "Simulated provider outage",
        })
      : realSend(input),
  );
  const durations: number[] = [];
  let cursor: string | null = null;
  let week = "";
  let processed = 0;
  do {
    const response = await POST(
      request(cursor ? `?after=${encodeURIComponent(cursor)}&week=${week}` : ""),
    );
    const data = await response.json();
    expect([200, 503]).toContain(response.status);
    expect(data.processed).toBeLessThanOrEqual(20);
    expect(data.processed).toBeGreaterThan(0);
    processed += data.processed;
    durations.push(data.durationMs);
    cursor = data.nextCursor;
    week = data.semana;
    expect(decodeURIComponent(response.headers.get("x-next-cursor") ?? "")).toBe(cursor ?? "");
  } while (cursor);
  expect(processed).toBe(41);
  expect(emails.getOutbox()).toHaveLength(40);
  expect((await listFamiliesForWeeklyReport({ week })).map((f) => f.userId)).toEqual([failedId]);
  vi.restoreAllMocks();
  const resumed = await POST(request());
  expect(await resumed.json()).toMatchObject({ processed: 1, enviados: 1, done: true });
  expect(emails.getOutbox()).toHaveLength(41);
  expect(await (await POST(request())).json()).toMatchObject({ processed: 0, done: true });
  console.info(
    "WEEKLY_LOAD",
    JSON.stringify({
      families: 41,
      profiles: profiles.length,
      sessions: sessions.length,
      attempts: attempts.length,
      largestProfileAttempts: 1000 * lesson.items.length,
      batchDurationsMs: durations,
      transport: "memory",
      checkpointResume: true,
    }),
  );
  // An older worker cannot move the checkpoint backwards.
  if (!failedId) throw new Error("Missing owner");
  await completeWeeklyReport(failedId, "2020-01-06");
  const [family] = await db
    .select()
    .from(missaoFamilies)
    .where(eq(missaoFamilies.userId, failedId));
  expect(family?.weeklyReportProcessedWeek).toBe(weekStart(new Date()));
  expect(await listFamiliesForWeeklyReport({ week: "2099-01-05", limit: 50 })).toHaveLength(41);
  expect((await POST(request("?week=2020-01-06"))).status).toBe(409);
  await db
    .update(missaoFamilies)
    .set({ weeklyReportEmail: false })
    .where(inArray(missaoFamilies.userId, ids));
}, 60000);
