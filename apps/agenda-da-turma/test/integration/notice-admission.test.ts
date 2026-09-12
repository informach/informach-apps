import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  agendaNotices,
  agendaProductEvents,
  agendaStudentProfiles,
  creditReservations,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { persistNoticeExtraction, reserveNoticeParse } from "@/features/notices/parse-repository";
import { parseNoticeSchema } from "@/features/notices/schemas";

let owner: string;
let profileId: string;
const extraction = {
  actions: [
    {
      type: "material" as const,
      title: "Material fictício",
      description: null,
      dueAt: null,
      dateOrigin: "unspecified" as const,
      time: null,
      location: null,
      sourceExcerpt: "Levar material",
    },
  ],
  warnings: [],
};
beforeEach(async () => {
  owner = `admission-test-${randomUUID()}`;
  await db.insert(users).values({
    id: owner,
    name: "Adulto fictício",
    email: `${owner}@e2e.local`,
    emailVerified: true,
  });
  const [profile] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: owner, name: "Criança fictícia" })
    .returning();
  if (!profile) throw new Error("Missing fixture profile");
  profileId = profile.id;
});
afterEach(async () => {
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, owner));
  await db.delete(creditReservations).where(eq(creditReservations.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});
function reserve(hash: string, budget = 10000) {
  return reserveNoticeParse({
    userId: owner,
    ownerId: owner,
    profileId,
    isPro: false,
    input: parseNoticeSchema.parse({ profileId, source: "teams", text: "Levar material" }),
    attachment: null,
    contentHash: hash,
    now: new Date(),
    trialDailyBudget: budget,
  });
}
describe("trial admission and interrupted extraction", () => {
  it("admits at most five distinct imports even when requests arrive concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(randomUUID())));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.code === "TRIAL_ENDED")).toBe(
      true,
    );
  });
  it("admits one in-flight copy and enforces a zero global trial budget", async () => {
    expect(await reserve(randomUUID(), 0)).toMatchObject({
      ok: false,
      error: { code: "TRIAL_BUSY" },
    });
    const hash = randomUUID();
    const pair = await Promise.all([reserve(hash), reserve(hash)]);
    expect(pair.filter((r) => r.ok)).toHaveLength(1);
    expect(pair.find((r) => !r.ok)).toMatchObject({ ok: false, error: { code: "PROCESSING" } });
  });
  it("recovers persisted, charged output without another billable reservation", async () => {
    const hash = randomUUID();
    const first = await reserve(hash);
    if (!first.ok || !first.value.notice.billingRunId) throw new Error("Missing admission");
    const notice = first.value.notice;
    const runId = first.value.notice.billingRunId;
    await persistNoticeExtraction(notice.id, runId, extraction);
    await db.insert(creditReservations).values({
      id: runId,
      ownerType: "user",
      ownerId: owner,
      estimatedAmount: 1,
      status: "committed",
      app: "agenda-da-turma",
      feature: "agenda.notices.parse",
      expiresAt: new Date(),
      resolvedAt: new Date(),
    });
    await db
      .update(agendaNotices)
      .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(agendaNotices.id, notice.id));
    const recovered = await reserve(hash);
    expect(recovered).toMatchObject({
      ok: true,
      value: {
        replay: true,
        notice: { id: notice.id, status: "ready", billingRunId: runId, parsedResult: extraction },
      },
    });
    expect(
      await db.select().from(creditReservations).where(eq(creditReservations.ownerId, owner)),
    ).toHaveLength(1);
  });
  it("releases an abandoned uncharged slot and refuses to charge output after its source was deleted", async () => {
    const first = await reserve(randomUUID());
    if (!first.ok || !first.value.notice.billingRunId) throw new Error("Missing admission");
    await db
      .update(agendaNotices)
      .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(agendaNotices.id, first.value.notice.id));
    const fresh = await Promise.all(Array.from({ length: 5 }, () => reserve(randomUUID())));
    expect(fresh.filter((r) => r.ok)).toHaveLength(5);
    const [expired] = await db
      .select()
      .from(agendaNotices)
      .where(eq(agendaNotices.id, first.value.notice.id));
    expect(expired?.status).toBe("failed");
    await db.delete(agendaNotices).where(eq(agendaNotices.id, first.value.notice.id));
    await expect(
      persistNoticeExtraction(first.value.notice.id, first.value.notice.billingRunId, extraction),
    ).rejects.toThrow("removed");
  });
});
