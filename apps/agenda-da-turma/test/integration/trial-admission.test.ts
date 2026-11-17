import { withCredits } from "@informach/ai-core";
import { startCompassoTrial } from "@informach/billing/compasso";
import { db, eq } from "@informach/db";
import { creditLedger, users } from "@informach/db/schema";
import { expect, it } from "vitest";
import { agendaAiBilling, getAgendaAiBalance } from "@/features/ai/wallet-repository";
import { agendaFixture } from "./compasso-fixture";

const config = { db, trialHashSecret: "agenda-test-trial-secret".repeat(3) };
it("funds the shared trial before the first speech reservation and never grants twice", async () => {
  const f = await agendaFixture(false);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(0);
  await startCompassoTrial(config, f.owner, f.actor.familyGroupId);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  await startCompassoTrial(config, f.owner, f.actor.familyGroupId);
  const { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  await withCredits({
    billing,
    owner,
    app: "agenda-da-turma",
    feature: "agenda.activities.transcribe_audio",
    estimateCost: () => ({ estimatedAmount: 2 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async () => "Synthetic transcript",
  });
  expect((await getAgendaAiBalance(f.actor)).available).toBe(19);
});
it("shares all twenty credits across eligible operations without inventing separate free pools", async () => {
  const f = await agendaFixture(true),
    { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  for (const feature of ["agenda.subjects.parse_voice", "agenda.notices.parse"])
    await withCredits({
      billing,
      owner,
      app: "agenda-da-turma",
      feature,
      estimateCost: () => ({ estimatedAmount: 10 }),
      computeActualCost: () => ({ actualAmount: 10 }),
      call: async () => "Synthetic output",
    });
  let calls = 0;
  await expect(
    withCredits({
      billing,
      owner,
      app: "agenda-da-turma",
      feature: "agenda.activities.transcribe_audio",
      estimateCost: () => ({ estimatedAmount: 1 }),
      computeActualCost: () => ({ actualAmount: 1 }),
      call: async () => {
        calls++;
        return "no";
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(0);
});
it("rechecks verified identity before spending even after preparing the wallet", async () => {
  const f = await agendaFixture(true),
    { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  const before = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.ownerId, f.actor.familyGroupId));
  await db.update(users).set({ emailVerified: false }).where(eq(users.id, f.owner));
  let calls = 0;
  await expect(
    withCredits({
      billing,
      owner,
      app: "agenda-da-turma",
      feature: "agenda.activities.transcribe_audio",
      estimateCost: () => ({ estimatedAmount: 1 }),
      computeActualCost: () => ({ actualAmount: 1 }),
      call: async () => {
        calls++;
        return "no";
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  expect(
    await db.select().from(creditLedger).where(eq(creditLedger.ownerId, f.actor.familyGroupId)),
  ).toEqual(before);
});
