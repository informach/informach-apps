import { randomUUID } from "node:crypto";
import { withCredits } from "@informach/ai-core";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { createCompassoWallet } from "@informach/billing/credits";
import { PRODUCTS } from "@informach/config/products";
import { db, eq } from "@informach/db";
import { agendaNotices, creditLedger, creditReservations } from "@informach/db/schema";
import { expect, it } from "vitest";
import { noticeCostQuote } from "@/features/ai/costs";
import { agendaAiBilling, getAgendaAiBalance } from "@/features/ai/wallet-repository";
import {
  finishNoticeParse,
  persistNoticeExtraction,
  reserveNoticeParse,
} from "@/features/notices/parse-repository";
import { parseNoticeSchema, storedExtractionSchema } from "@/features/notices/schemas";
import { agendaFixture, family, value } from "./compasso-fixture";

async function permitted() {
  const f = await agendaFixture(true);
  for (const action of ["read", "write", "use_ai"] as const)
    await family.grantAccess(f.owner, { ...f.target, action });
  return f;
}
it("requires current read, write and AI grants even after the wallet adapter was created", async () => {
  const f = await agendaFixture(true);
  await expect(agendaAiBilling(f.visitor, f.profile.id)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  for (const action of ["read", "write"] as const)
    await family.grantAccess(f.owner, { ...f.target, action });
  await expect(agendaAiBilling(f.visitor, f.profile.id)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await family.grantAccess(f.owner, { ...f.target, action: "use_ai" });
  const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
  await family.revokeAccess(f.owner, { ...f.target, action: "read" });
  let calls = 0;
  await expect(
    withCredits({
      billing,
      owner,
      app: "agenda-da-turma",
      feature: "agenda.notices.parse",
      estimateCost: () => ({ estimatedAmount: 4 }),
      computeActualCost: () => ({ actualAmount: 2 }),
      call: async () => {
        calls++;
        return "output";
      },
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(calls).toBe(0);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
});
it("uses one family balance across apps and records the adult and canonical person", async () => {
  const f = await permitted();
  const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
  const result = await withCredits({
    billing,
    owner,
    app: "agenda-da-turma",
    feature: "agenda.notices.parse",
    estimateCost: () => ({ estimatedAmount: 8 }),
    computeActualCost: () => ({ actualAmount: 3 }),
    call: async () => {
      expect((await getAgendaAiBalance(f.actor)).available).toBe(12);
      return "output";
    },
  });
  expect(result.balanceAfter).toBe(17);
  const [entry] = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.id, result.ledgerEntryId));
  expect(entry).toMatchObject({
    ownerType: "family",
    ownerId: f.actor.familyGroupId,
    app: "compasso",
    consumerApp: "agenda-da-turma",
    actorUserId: f.visitor.userId,
    personId: f.target.personId,
    amount: -3,
  });
  const wallet = createCompassoWallet({ db, products: PRODUCTS });
  await wallet.consume(
    { actorId: f.owner, groupId: f.actor.familyGroupId },
    { app: "cozya", feature: "test", amount: 2 },
  );
  expect((await getAgendaAiBalance(f.actor)).available).toBe(15);
});
it("prevents cross-adult settlement, but can settle or release an authorized call after revocation", async () => {
  const f = await permitted();
  const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
  const first = await billing.reserveCredits({
    owner,
    app: "agenda-da-turma",
    feature: "test",
    estimatedAmount: 4,
  });
  const second = await billing.reserveCredits({
    owner,
    app: "agenda-da-turma",
    feature: "test",
    estimatedAmount: 3,
  });
  const wrong = createCompassoWallet({ db, products: PRODUCTS });
  await expect(
    wrong.commit(
      { actorId: f.owner, groupId: f.actor.familyGroupId },
      { reservationId: first.id, actualAmount: 1 },
    ),
  ).rejects.toThrow();
  await family.revokeMember(f.owner, f.actor.familyGroupId, f.visitor.userId);
  await billing.commitReservation({ reservationId: first.id, actualAmount: 2 });
  await billing.releaseReservation({ reservationId: second.id, reason: "llm_error" });
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
});
it("returns reserved credits on provider failure and rejects spending above the accepted ceiling", async () => {
  const f = await permitted();
  const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
  await expect(
    withCredits({
      billing,
      owner,
      app: "agenda-da-turma",
      feature: "test",
      estimateCost: () => ({ estimatedAmount: 4 }),
      computeActualCost: () => ({ actualAmount: 4 }),
      call: async () => {
        throw new Error("provider failure");
      },
    }),
  ).rejects.toThrow("provider failure");
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  const reservation = await billing.reserveCredits({
    owner,
    app: "agenda-da-turma",
    feature: "test",
    estimatedAmount: 2,
  });
  await expect(
    billing.commitReservation({ reservationId: reservation.id, actualAmount: 3 }),
  ).rejects.toThrow("ceiling");
  await billing.releaseReservation({ reservationId: reservation.id, reason: "validation_failed" });
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
});
function admission(f: Awaited<ReturnType<typeof permitted>>, hash = randomUUID()) {
  const text = "Synthetic school notice";
  return {
    actor: f.visitor,
    contentHash: hash,
    now: new Date(),
    attachment: null,
    input: parseNoticeSchema.parse({
      profileId: f.profile.id,
      source: "other",
      text,
      acceptedCost: noticeCostQuote({ text }),
    }),
  };
}
const extraction = storedExtractionSchema.parse({
  actions: [],
  warnings: [],
  publicationReference: null,
});
it("serializes duplicate admissions by family and never gives another adult an unreviewed original", async () => {
  const f = await permitted(),
    input = admission(f);
  const results = await Promise.all([reserveNoticeParse(input), reserveNoticeParse(input)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "PROCESSING" } });
  expect(await reserveNoticeParse({ ...input, actor: f.actor })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  const other = await permitted();
  expect(await reserveNoticeParse(admission(other, input.contentHash))).toMatchObject({ ok: true });
});
it("recovers committed output without another debit and never retries charged corrupt data", async () => {
  const f = await permitted(),
    input = admission(f);
  const { notice } = value(await reserveNoticeParse(input));
  const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
  if (!notice.billingRunId) throw new Error("Missing run");
  const reservation = await billing.reserveCredits({
    reservationId: notice.billingRunId,
    owner,
    app: "agenda-da-turma",
    feature: "agenda.notices.parse",
    estimatedAmount: 4,
  });
  await persistNoticeExtraction(f.visitor, notice.id, reservation.id, extraction);
  await billing.commitReservation({ reservationId: reservation.id, actualAmount: 2 });
  await db
    .update(agendaNotices)
    .set({ updatedAt: new Date(Date.now() - 11 * 60000) })
    .where(eq(agendaNotices.id, notice.id));
  expect(await reserveNoticeParse(input)).toMatchObject({
    ok: true,
    value: { replay: true, notice: { id: notice.id, status: "ready" } },
  });
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
  await db.update(agendaNotices).set({ parsedResult: null }).where(eq(agendaNotices.id, notice.id));
  expect(await reserveNoticeParse(input)).toMatchObject({
    ok: false,
    error: { code: "RECOVERY_REQUIRED" },
  });
  expect(await finishNoticeParse(notice.id, randomUUID(), "failed")).toBe(false);
});

it.each([false, true])(
  "rejects late notice output after freeze (resumed: %s) and releases credits",
  async (resume) => {
    const f = await permitted();
    const { notice } = value(await reserveNoticeParse(admission(f)));
    if (!notice.billingRunId) throw new Error("Missing run");
    const { billing, owner } = await agendaAiBilling(f.visitor, f.profile.id);
    await expect(
      withCredits({
        billing,
        owner,
        runId: notice.billingRunId,
        app: "agenda-da-turma",
        feature: "agenda.notices.parse",
        estimateCost: () => ({ estimatedAmount: 4 }),
        computeActualCost: () => ({ actualAmount: 2 }),
        call: async ({ reservation }) => {
          const operationId = randomUUID();
          await db.transaction((tx) =>
            freezeWebParticipation(tx, {
              userId: f.visitor.userId,
              operationId,
              expectedRevision: 0,
            }),
          );
          if (resume)
            await db.transaction((tx) =>
              resumeWebParticipation(tx, {
                userId: f.visitor.userId,
                operationId,
                expectedRevision: 1,
              }),
            );
          await persistNoticeExtraction(f.visitor, notice.id, reservation.id, extraction);
          return extraction;
        },
      }),
    ).rejects.toThrow();
    const [stored] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, notice.id));
    expect(stored?.parsedResult).toBeNull();
    const [reservation] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, notice.billingRunId));
    expect(reservation?.status).toBe("released");
    expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  },
);

it("revalidates the notice author and current profile grants before persisting output", async () => {
  const f = await permitted();
  const { notice } = value(await reserveNoticeParse(admission(f)));
  if (!notice.billingRunId) throw new Error("Missing run");
  await expect(
    persistNoticeExtraction(f.actor, notice.id, notice.billingRunId, extraction),
  ).rejects.toThrow();
  await family.revokeAccess(f.owner, { ...f.target, action: "write" });
  await expect(
    persistNoticeExtraction(f.visitor, notice.id, notice.billingRunId, extraction),
  ).rejects.toThrow();
  const [stored] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, notice.id));
  expect(stored?.parsedResult).toBeNull();
});
