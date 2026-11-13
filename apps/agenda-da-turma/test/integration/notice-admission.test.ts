import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { agendaNotices, agendaProductEvents } from "@informach/db/schema";
import { expect, it } from "vitest";
import { noticeCostQuote } from "@/features/ai/costs";
import { agendaAiBilling } from "@/features/ai/wallet-repository";
import { persistNoticeExtraction, reserveNoticeParse } from "@/features/notices/parse-repository";
import { parseNoticeSchema, storedExtractionSchema } from "@/features/notices/schemas";
import { agendaFixture, value } from "./compasso-fixture";

function admission(f: Awaited<ReturnType<typeof agendaFixture>>, contentHash = randomUUID()) {
  return {
    actor: f.actor,
    input: parseNoticeSchema.parse({
      profileId: f.profile.id,
      source: "teams",
      text: "Synthetic",
      acceptedCost: noticeCostQuote({ text: "Synthetic" }),
    }),
    attachment: null,
    contentHash,
    now: new Date(),
  };
}
it("serializes the daily per-adult attempt ceiling without a separate free-read quota", async () => {
  const f = await agendaFixture(true);
  await db.insert(agendaProductEvents).values(
    Array.from({ length: 69 }, () => ({
      userId: f.owner,
      event: "notice_attempt" as const,
      source: "teams" as const,
    })),
  );
  const results = await Promise.all([
    reserveNoticeParse(admission(f)),
    reserveNoticeParse(admission(f)),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "DAILY_LIMIT" } });
});
it("admits one in-flight copy in the same family", async () => {
  const f = await agendaFixture(true),
    input = admission(f);
  const results = await Promise.all([reserveNoticeParse(input), reserveNoticeParse(input)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "PROCESSING" } });
});
it("replaces only an abandoned unreserved run and rejects output for a removed source", async () => {
  const f = await agendaFixture(true),
    input = admission(f);
  const first = value(await reserveNoticeParse(input)).notice;
  if (!first.billingRunId) throw new Error("Missing run");
  await db
    .update(agendaNotices)
    .set({ updatedAt: new Date(Date.now() - 11 * 60000) })
    .where(eq(agendaNotices.id, first.id));
  const next = value(await reserveNoticeParse({ ...input, now: new Date() })).notice;
  expect(next.id).toBe(first.id);
  expect(next.billingRunId).not.toBe(first.billingRunId);
  await expect(
    persistNoticeExtraction(
      f.actor,
      first.id,
      first.billingRunId,
      storedExtractionSchema.parse({ actions: [], warnings: [], publicationReference: null }),
    ),
  ).rejects.toThrow();
  await db.delete(agendaNotices).where(eq(agendaNotices.id, first.id));
  if (!next.billingRunId) throw new Error("Missing run");
  await expect(
    persistNoticeExtraction(
      f.actor,
      next.id,
      next.billingRunId,
      storedExtractionSchema.parse({ actions: [], warnings: [], publicationReference: null }),
    ),
  ).rejects.toThrow();
});
it("does not replace a stale notice while its wallet reservation can still settle", async () => {
  const f = await agendaFixture(true),
    input = admission(f);
  const first = value(await reserveNoticeParse(input)).notice;
  if (!first.billingRunId) throw new Error("Missing run");
  const { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  await billing.reserveCredits({
    reservationId: first.billingRunId,
    owner,
    app: "agenda-da-turma",
    feature: "agenda.notices.parse",
    estimatedAmount: 4,
    ttlSeconds: 1800,
  });
  await db
    .update(agendaNotices)
    .set({ updatedAt: new Date(Date.now() - 11 * 60000) })
    .where(eq(agendaNotices.id, first.id));
  expect(await reserveNoticeParse({ ...input, now: new Date() })).toMatchObject({
    ok: false,
    error: { code: "PROCESSING" },
  });
  expect(
    (await db.select().from(agendaNotices).where(eq(agendaNotices.id, first.id)))[0]?.billingRunId,
  ).toBe(first.billingRunId);
});
