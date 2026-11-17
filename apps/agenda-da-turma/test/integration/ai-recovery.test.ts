import { createHash, randomUUID } from "node:crypto";
import type { CreditAwareBillingClient } from "@informach/ai-core";
import {
  createRecoverableAiOperations,
  purgeAiOperationReceipts,
} from "@informach/ai-core/operations";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq } from "@informach/db";
import { aiOperationReceipts, creditLedger, creditReservations } from "@informach/db/schema";
import { expect, it } from "vitest";
import { z } from "zod";
import { agentRunRecorder } from "@/ai/agent-run-recorder";
import { executeAgendaClosure } from "@/features/account/closure-repository";
import { exportAgendaAccount } from "@/features/account/export-repository";
import {
  agendaAiBilling,
  agendaAiOperations,
  getAgendaAiBalance,
} from "@/features/ai/wallet-repository";
import { lockAgendaProfiles } from "@/features/family/scope";
import { lockAgendaUse } from "@/features/family/use-repository";
import { agendaFixture, family } from "./compasso-fixture";

const hash = createHash("sha256").update("Synthetic input never recorded verbatim").digest("hex");
const output = { text: "Synthetic private result" };

it("clears cached output during resumption while retaining the old request fence and debit", async () => {
  const f = await agendaFixture(true);
  const ops = await agendaAiOperations(f.actor, f.profile.id);
  let calls = 0;
  const input = options(async () => {
    calls++;
    return { value: output, actualCredits: 2 };
  });
  expect(await ops.run(input)).toEqual(output);
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: f.owner, operationId, expectedRevision: 0 }),
  );
  await db.transaction((tx) =>
    executeAgendaClosure(tx, {
      actorId: f.owner,
      operationId,
      frozenRevision: 1,
      phase: "resume",
      plan: null,
    }),
  );
  const cleared = await receipt(f.actor.familyGroupId);
  expect(cleared).toMatchObject({
    result: null,
    actualCredits: null,
    phase: "failed",
    webParticipationRevision: 0,
  });
  await db.transaction((tx) =>
    resumeWebParticipation(tx, { userId: f.owner, operationId, expectedRevision: 1 }),
  );
  await expect(ops.run(input)).rejects.toMatchObject({ code: "AI_RESULT_EXPIRED" });
  expect(calls).toBe(1);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
});

it.each([false, true])(
  "discards a late AI output after web freeze (resumed=%s) and releases its reservation",
  async (resumed) => {
    const f = await agendaFixture(true);
    const ops = await agendaAiOperations(f.actor, f.profile.id);
    const operationId = randomUUID();
    const transition = { userId: f.owner, operationId, expectedRevision: 0 };
    await expect(
      ops.run(
        options(async () => {
          await db.transaction((tx) => freezeWebParticipation(tx, transition));
          if (resumed)
            await db.transaction((tx) =>
              resumeWebParticipation(tx, { ...transition, expectedRevision: 1 }),
            );
          return { value: output, actualCredits: 2 };
        }),
      ),
    ).rejects.toBeDefined();
    const row = await receipt(f.actor.familyGroupId);
    expect(row.result).toBeNull();
    expect(row.phase).toBe("failed");
    const [hold] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, row.runId));
    expect(hold?.status).toBe("released");
    expect(await debitCount(f.actor.familyGroupId)).toBe(0);
    if (!resumed)
      await db.transaction((tx) =>
        resumeWebParticipation(tx, { ...transition, expectedRevision: 1 }),
      );
    expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  },
);
function options(call: () => Promise<{ value: { text: string }; actualCredits: number }>) {
  return {
    feature: "test.recoverable",
    model: "synthetic",
    agent: "synthetic",
    recorder: agentRunRecorder,
    tariff: "synthetic-v1",
    maxCredits: 4,
    inputHash: hash,
    parseResult: (value: unknown) => z.object({ text: z.string().min(1) }).parse(value),
    call,
  };
}
async function debitCount(groupId: string) {
  return (
    await db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.ownerId, groupId), eq(creditLedger.entryType, "consumption")))
  ).length;
}
async function custom(
  f: Awaited<ReturnType<typeof agendaFixture>>,
  binding: (billing: CreditAwareBillingClient) => CreditAwareBillingClient,
) {
  const { billing } = await agendaAiBilling(f.actor, f.profile.id);
  return createRecoverableAiOperations({
    db,
    billing: binding(billing),
    actorId: f.owner,
    groupId: f.actor.familyGroupId,
    app: "agenda-da-turma",
    scopeKey: f.profile.id,
    async authorize(tx) {
      await lockAgendaUse(tx, f.actor, [f.profile.id], "use_ai");
      await lockAgendaProfiles(tx, f.actor, [f.profile.id], "write");
    },
  });
}
async function receipt(groupId: string) {
  const [row] = await db
    .select()
    .from(aiOperationReceipts)
    .where(eq(aiOperationReceipts.groupId, groupId));
  if (!row) throw new Error("Missing receipt");
  return row;
}
function signal() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("serializes repeated input and returns the paid output without another call or debit", async () => {
  const f = await agendaFixture(true),
    ops = await agendaAiOperations(f.actor, f.profile.id);
  const entered = signal(),
    release = signal();
  let calls = 0;
  const input = options(async () => {
    calls++;
    entered.resolve();
    await release.promise;
    return { value: output, actualCredits: 2 };
  });
  const first = ops.run(input);
  await entered.promise;
  try {
    await expect(ops.run(input)).rejects.toMatchObject({ code: "AI_PROCESSING" });
  } finally {
    release.resolve();
  }
  expect(await first).toEqual(output);
  expect(await ops.run(input)).toEqual(output);
  expect(calls).toBe(1);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
});
it("recovers a committed debit whose acknowledgement was lost", async () => {
  const f = await agendaFixture(true);
  let calls = 0;
  const broken = await custom(f, (billing) => ({
    ...billing,
    async commitReservation(input) {
      await billing.commitReservation(input);
      throw new Error("lost acknowledgement");
    },
  }));
  const input = options(async () => {
    calls++;
    return { value: output, actualCredits: 2 };
  });
  await expect(broken.run(input)).rejects.toThrow("lost acknowledgement");
  const ops = await agendaAiOperations(f.actor, f.profile.id);
  expect(await ops.run(input)).toEqual(output);
  expect(calls).toBe(1);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
});
it("commits persisted output once when concurrent clients recover an interrupted commit", async () => {
  const f = await agendaFixture(true);
  let calls = 0;
  const broken = await custom(f, (billing) => ({
    ...billing,
    async commitReservation() {
      throw new Error("database unavailable before commit");
    },
  }));
  const input = options(async () => {
    calls++;
    return { value: output, actualCredits: 3 };
  });
  await expect(broken.run(input)).rejects.toThrow("database unavailable");
  expect(await debitCount(f.actor.familyGroupId)).toBe(0);
  expect((await exportAgendaAccount(f.actor)).temporaryAiResults).toEqual([]);
  const ops = await agendaAiOperations(f.actor, f.profile.id);
  expect(await Promise.all([ops.run(input), ops.run(input)])).toEqual([output, output]);
  expect(calls).toBe(1);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(17);
  expect((await exportAgendaAccount(f.actor)).temporaryAiResults.map((r) => r.result)).toEqual([
    output,
  ]);
});
it("releases provider failures and validates output before debit", async () => {
  const f = await agendaFixture(true),
    ops = await agendaAiOperations(f.actor, f.profile.id);
  let calls = 0;
  const input = options(async () => {
    calls++;
    if (calls === 1) throw new Error("provider failure");
    return { value: output, actualCredits: 2 };
  });
  await expect(ops.run(input)).rejects.toThrow("provider failure");
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  expect(await ops.run(input)).toEqual(output);
  expect(calls).toBe(2);
  await expect(
    ops.run({
      ...input,
      inputHash: createHash("sha256").update("over ceiling").digest("hex"),
      call: async () => ({ value: output, actualCredits: 5 }),
    }),
  ).rejects.toThrow("Invalid AI operation result");
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
});
it("keeps a valid unpaid output through a telemetry failure and never calls the provider again", async () => {
  const f = await agendaFixture(true),
    ops = await agendaAiOperations(f.actor, f.profile.id);
  let calls = 0;
  const input = options(async () => {
    calls++;
    return { value: output, actualCredits: 2 };
  });
  const broken = {
    ...input,
    recorder: {
      ...agentRunRecorder,
      async finish() {
        throw new Error("telemetry interrupted");
      },
    },
  };
  await expect(ops.run(broken)).rejects.toThrow("telemetry interrupted");
  expect((await getAgendaAiBalance(f.actor)).available).toBe(20);
  expect(await ops.run(input)).toEqual(output);
  expect(calls).toBe(1);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
});
it("binds cached results to the adult and checks current child grants on every replay", async () => {
  const f = await agendaFixture(true);
  let calls = 0;
  const input = options(async () => {
    calls++;
    return { value: output, actualCredits: 2 };
  });
  for (const action of ["read", "write", "use_ai"] as const)
    await family.grantAccess(f.owner, { ...f.target, action });
  const owner = await agendaAiOperations(f.actor, f.profile.id),
    guest = await agendaAiOperations(f.visitor, f.profile.id);
  await owner.run(input);
  await guest.run(input);
  expect(calls).toBe(2);
  await family.revokeAccess(f.owner, { ...f.target, action: "read" });
  await expect(guest.run(input)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(await owner.run(input)).toEqual(output);
  expect(calls).toBe(2);
  expect(await debitCount(f.actor.familyGroupId)).toBe(2);
});
it("retires private cached output without deleting the financial receipt", async () => {
  const f = await agendaFixture(true),
    ops = await agendaAiOperations(f.actor, f.profile.id);
  const input = options(async () => ({ value: output, actualCredits: 2 }));
  await ops.run(input);
  await db
    .update(aiOperationReceipts)
    .set({ expiresAt: new Date(0), leaseUntil: new Date(0) })
    .where(eq(aiOperationReceipts.groupId, f.actor.familyGroupId));
  await purgeAiOperationReceipts(db, "agenda-da-turma");
  expect(
    await db
      .select()
      .from(aiOperationReceipts)
      .where(eq(aiOperationReceipts.groupId, f.actor.familyGroupId)),
  ).toEqual([]);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
  expect((await getAgendaAiBalance(f.actor)).available).toBe(18);
});
it("rejects a late provider response after an expired attempt was replaced", async () => {
  const f = await agendaFixture(true),
    ops = await agendaAiOperations(f.actor, f.profile.id);
  const entered = signal(),
    release = signal();
  let calls = 0;
  const input = options(async () => {
    calls++;
    if (calls === 1) {
      entered.resolve();
      await release.promise;
      return { value: { text: "Late old result" }, actualCredits: 2 };
    }
    return { value: output, actualCredits: 2 };
  });
  const old = ops.run(input);
  const oldResult = expect(old).rejects.toMatchObject({ code: "AI_PROCESSING" });
  await entered.promise;
  const row = await receipt(f.actor.familyGroupId);
  await db
    .update(aiOperationReceipts)
    .set({ leaseUntil: new Date(0) })
    .where(eq(aiOperationReceipts.id, row.id));
  await db
    .update(creditReservations)
    .set({ expiresAt: new Date(0) })
    .where(eq(creditReservations.id, row.runId));
  try {
    await expect(ops.run(input)).rejects.toMatchObject({ code: "AI_PROCESSING" });
    expect(await ops.run(input)).toEqual(output);
  } finally {
    release.resolve();
  }
  await oldResult;
  expect(await ops.run(input)).toEqual(output);
  expect(await debitCount(f.actor.familyGroupId)).toBe(1);
});
