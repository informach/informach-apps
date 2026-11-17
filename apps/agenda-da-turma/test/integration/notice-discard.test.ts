import { randomUUID } from "node:crypto";
import { withCredits } from "@informach/ai-core";
import { db, eq } from "@informach/db";
import { agendaNotices, creditReservations } from "@informach/db/schema";
import { beforeEach, expect, it } from "vitest";
import { noticeCostQuote } from "@/features/ai/costs";
import { agendaAiBilling, getAgendaAiBalance } from "@/features/ai/wallet-repository";
import { withActionIds } from "@/features/notices/drafts";
import { reserveNoticeParse } from "@/features/notices/parse-repository";
import { listReadyNotices } from "@/features/notices/repository";
import {
  actionFieldsSchema,
  confirmNoticeSchema,
  parseNoticeSchema,
  storedExtractionSchema,
} from "@/features/notices/schemas";
import {
  confirmNotice,
  discardDraftAction,
  discardNotice,
  getNoticeDraft,
} from "@/features/notices/service";
import { agendaFixture, family, value } from "./compasso-fixture";

let f: Awaited<ReturnType<typeof agendaFixture>>;
const extracted = {
  type: "task" as const,
  title: "Pages 20 and 21",
  description: null,
  dueAt: null,
  dateOrigin: "unspecified" as const,
  time: null,
  location: null,
  sourceExcerpt: "Pages 20 and 21",
};
const legacyExtraction = {
  actions: [extracted, { ...extracted, title: "Bring scissors", sourceExcerpt: "Bring scissors" }],
  warnings: [],
};
beforeEach(async () => {
  f = await agendaFixture(true);
  for (const action of ["read", "write", "use_ai"] as const)
    await family.grantAccess(f.owner, { ...f.target, action });
});
async function notice(overrides: Partial<typeof agendaNotices.$inferInsert> = {}) {
  const [row] = await db
    .insert(agendaNotices)
    .values({
      familyGroupId: f.actor.familyGroupId,
      captureProfileId: f.profile.id,
      createdByUserId: f.owner,
      source: "teams",
      text: "Synthetic notice",
      contentHash: randomUUID(),
      status: "ready",
      parsedResult: withActionIds(legacyExtraction),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("Missing notice");
  return row;
}
async function reload(id: string) {
  const [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, id));
  if (!row) throw new Error("Missing notice");
  return row;
}
function input() {
  return parseNoticeSchema.parse({
    profileId: f.profile.id,
    source: "teams",
    text: "Synthetic notice",
    acceptedCost: noticeCostQuote({ text: "Synthetic notice" }),
  });
}
it("discards one action, keeps other stable IDs and refuses a repeated deletion", async () => {
  const n = await notice();
  const [first, second] = storedExtractionSchema.parse(n.parsedResult).actions;
  if (!first?.id || !second?.id) throw new Error("Missing actions");
  expect(await discardDraftAction(f.actor, { noticeId: n.id, actionId: first.id })).toMatchObject({
    ok: true,
    value: { remaining: 1 },
  });
  expect((await getNoticeDraft(f.actor, n.id))?.extraction.actions.map((a) => a.id)).toEqual([
    second.id,
  ]);
  expect((await listReadyNotices(f.actor)).map((n) => n.id)).toContain(n.id);
  expect(await discardDraftAction(f.actor, { noticeId: n.id, actionId: first.id })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});
it("retires the final draft action and refuses saving from a stale tab", async () => {
  const n = await notice();
  for (const action of storedExtractionSchema.parse(n.parsedResult).actions) {
    if (!action.id) throw new Error("Missing stable action ID");
    value(await discardDraftAction(f.actor, { noticeId: n.id, actionId: action.id }));
  }
  expect((await reload(n.id)).status).toBe("discarded");
  expect((await listReadyNotices(f.actor)).map((n) => n.id)).not.toContain(n.id);
  expect(await getNoticeDraft(f.actor, n.id)).toBeNull();
  expect(
    await confirmNotice(
      f.actor,
      confirmNoticeSchema.parse({
        noticeId: n.id,
        sourceReviewed: true,
        sourceProfileIds: [f.profile.id],
        actions: [actionFieldsSchema.parse({ ...extracted, profileId: f.profile.id })],
      }),
    ),
  ).toMatchObject({ ok: false, error: { code: "NOT_DRAFT" } });
});
it("only lets the capturing adult discard an unconfirmed original", async () => {
  const n = await notice();
  expect(await discardNotice(f.visitor, { noticeId: n.id })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  value(await discardNotice(f.actor, { noticeId: n.id }));
  const guest = await notice({ createdByUserId: f.visitor.userId });
  value(await discardNotice(f.visitor, { noticeId: guest.id }));
  const confirmed = await notice({
    status: "confirmed",
    sourceProfileIds: [f.profile.id],
    confirmedAt: new Date(),
  });
  expect(await discardNotice(f.actor, { noticeId: confirmed.id })).toMatchObject({
    ok: false,
    error: { code: "NOT_DRAFT" },
  });
});
it("preserves the settled debit when discarding and restores paid output without a new reservation", async () => {
  const { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  const paid = await withCredits({
    billing,
    owner,
    app: "agenda-da-turma",
    feature: "agenda.notices.parse",
    estimateCost: () => ({ estimatedAmount: 4 }),
    computeActualCost: () => ({ actualAmount: 2 }),
    call: async () => withActionIds(legacyExtraction),
  });
  const n = await notice({ billingRunId: paid.reservationId, parsedResult: paid.result });
  value(await discardNotice(f.actor, { noticeId: n.id }));
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
  const replay = value(
    await reserveNoticeParse({
      actor: f.actor,
      input: input(),
      attachment: null,
      contentHash: n.contentHash,
      now: new Date(),
    }),
  );
  expect(replay.replay).toBe(true);
  expect((await getNoticeDraft(f.actor, n.id))?.extraction.actions).toHaveLength(2);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
  expect(
    await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.ownerId, f.actor.familyGroupId)),
  ).toHaveLength(1);
});
it("cannot resurrect another adult's discarded original", async () => {
  const n = await notice({ status: "discarded" });
  expect(
    await reserveNoticeParse({
      actor: f.visitor,
      input: input(),
      attachment: null,
      contentHash: n.contentHash,
      now: new Date(),
    }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect((await reload(n.id)).status).toBe("discarded");
});
it("assigns stable IDs to historical output before editing it", async () => {
  const n = await notice({ parsedResult: legacyExtraction });
  const first = await getNoticeDraft(f.actor, n.id);
  const ids = first?.extraction.actions.map((a) => a.id) ?? [];
  expect(ids).toHaveLength(2);
  expect(
    storedExtractionSchema.parse((await reload(n.id)).parsedResult).actions.map((a) => a.id),
  ).toEqual(ids);
  expect((await getNoticeDraft(f.actor, n.id))?.extraction.actions.map((a) => a.id)).toEqual(ids);
  const id = ids[0];
  if (!id) throw new Error("Missing action ID");
  expect(await discardDraftAction(f.actor, { noticeId: n.id, actionId: id })).toMatchObject({
    ok: true,
    value: { remaining: 1 },
  });
});
