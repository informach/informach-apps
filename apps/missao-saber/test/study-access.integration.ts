import { randomBytes, randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { db, eq, inArray, sql } from "@informach/db";
import {
  familyAppProfiles,
  missaoFamilies,
  missaoProfiles,
  missaoReports,
  missaoStudyCodes,
  missaoStudyDevices,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  competitionView,
  createCompetition,
  listCompetitions,
  startTurn,
} from "@/features/competition/service";
import { findLesson } from "@/features/content/catalog";
import { lockStudentAccess, studentAccessCondition } from "@/features/family/scope";
import { mayDeliverWeeklySnapshot, weeklySnapshot } from "@/features/family/weekly-repository";
import { experiencesForItem } from "@/features/labs/runtime/catalog";
import { labToNotebook, listLabs, saveLab, startLab } from "@/features/labs/runtime/repository";
import {
  clearFamily,
  completeWeeklyReport,
  getFamily,
  getProfiles,
  history,
  listFamiliesForWeeklyReport,
  notebookPage,
  readSession,
  saveNote,
  saveReport,
  setRoutine,
  setWeeklyReportEmail,
} from "@/features/learning/repository";
import { answer, begin, hint } from "@/features/learning/service";
import { desafiosPorFaixa } from "@/features/pecas/catalogo";
import { listSolves, recordSolve } from "@/features/pecas/repository";

import {
  cleanupStudyAccess,
  consumeCodeAttempt,
  createStudyCode,
  createStudyDevice,
  endStudyDevice,
  listStudyDevices,
  readStudyDevice,
  redeemStudyCode,
  revokeStudyDevice,
} from "@/features/study-access/repository";

let owner = "";
let other = "";
let profile = "";
let sibling = "";
let familyGroupId = "";
const family = createFamilyService({ db });
const deviceInput = () => ({ profileIds: [profile], label: "Tablet da família", remember: false });

beforeEach(async () => {
  owner = randomUUID();
  other = randomUUID();
  await db.insert(users).values(
    [owner, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: "Responsible",
      emailVerified: true,
    })),
  );
  familyGroupId = (await family.createGroup(owner, "Study family")).id;
  await db.insert(missaoFamilies).values({ userId: owner, consentVersion: "fixture-v1" });
  const activate = async (name: string) => {
    const person = await family.createPerson(owner, {
      groupId: familyGroupId,
      kind: "dependent",
      displayName: name,
    });
    const result = await family.activateProfile(
      owner,
      { groupId: familyGroupId, personId: person.id, app: "missao-saber" },
      async (tx, activationId) => {
        const [row] = await tx
          .insert(missaoProfiles)
          .values({
            familyProfileId: activationId,
            userId: owner,
            grade: 6,
            courseId: "olitef-n1",
          })
          .returning();
        if (!row) throw new Error("Missing student fixture");
        return row.id;
      },
    );
    return result.value;
  };
  profile = await activate("Lua");
  sibling = await activate("Sol");
});

afterEach(async () => {
  await db
    .update(missaoFamilies)
    .set({ weeklyReportEmail: false })
    .where(inArray(missaoFamilies.userId, [owner, other]));
  await db.delete(missaoReports).where(inArray(missaoReports.userId, [owner, other]));
});

describe("real PostgreSQL study credentials", () => {
  it("freezes personal writes and delivery and never revives old study credentials on resumption", async () => {
    const parent = { kind: "parent" as const, userId: owner, familyGroupId };
    const issued = await createStudyDevice(owner, deviceInput());
    const pending = await createStudyCode(owner, deviceInput());
    await setWeeklyReportEmail(owner, true);
    const students = await weeklySnapshot(parent);
    expect(await readStudyDevice(issued.token)).not.toBeNull();
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: owner, operationId, expectedRevision: 0 }),
    );
    for (const operation of [
      () => getFamily(owner),
      () => setRoutine(owner, 20),
      () => setWeeklyReportEmail(owner, true),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "unavailable" });
    expect((await listFamiliesForWeeklyReport()).some((row) => row.userId === owner)).toBe(false);
    expect(
      await mayDeliverWeeklySnapshot(owner, `${owner}@example.test`, [{ actor: parent, students }]),
    ).toBe(false);
    await completeWeeklyReport(owner, "2026-11-09");
    const [stored] = await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, owner));
    expect(stored).toMatchObject({ dailyMinutes: 10, weeklyReportProcessedWeek: null });
    expect(await readStudyDevice(issued.token)).toBeNull();
    await setRoutine(other, 15);
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: owner, operationId, expectedRevision: 1 }),
    );
    expect(
      await mayDeliverWeeklySnapshot(owner, `${owner}@example.test`, [{ actor: parent, students }]),
    ).toBe(false);
    expect(
      await mayDeliverWeeklySnapshot(owner, `${owner}@example.test`, [
        { actor: parent, students: await weeklySnapshot(parent) },
      ]),
    ).toBe(true);
    expect(await readStudyDevice(issued.token)).toBeNull();
    await expect(redeemStudyCode(pending.code)).rejects.toMatchObject({ code: "CODE" });
    await expect(
      db.transaction((tx) =>
        lockStudentAccess(
          tx,
          { ...parent, kind: "study", deviceId: issued.device.id, profileId: profile },
          [profile],
        ),
      ),
    ).rejects.toMatchObject({ code: "PROFILE" });
    await setRoutine(owner, 20);
    expect((await getFamily(owner)).dailyMinutes).toBe(20);
    expect(
      await readStudyDevice((await createStudyDevice(owner, deviceInput())).token),
    ).not.toBeNull();
  });
  it("keeps the child authority through puzzle reads and writes and checks Compasso coverage in the transaction", async () => {
    const free = desafiosPorFaixa.find((entry) => entry.gratuito);
    const paid = desafiosPorFaixa.find((entry) => !entry.gratuito);
    if (!free || !paid) throw new Error("Missing puzzle coverage fixtures");
    const access = await createStudyDevice(owner, deviceInput());
    const actor = {
      kind: "study" as const,
      userId: owner,
      familyGroupId,
      deviceId: access.device.id,
      profileId: profile,
    };
    await expect(recordSolve(actor, profile, paid.id, 100)).rejects.toMatchObject({ code: "PLAN" });
    await Promise.all(
      [120, 90, 200].map((seconds) => recordSolve(actor, profile, free.id, seconds)),
    );
    expect(await listSolves(actor, profile)).toMatchObject([{ solves: 3, bestSeconds: 90 }]);
    expect(await listSolves({ ...actor, profileId: sibling }, profile)).toEqual([]);
    await expect(recordSolve(actor, sibling, free.id, 40)).rejects.toMatchObject({
      code: "PROFILE",
    });
    await startCompassoTrial(
      { db, trialHashSecret: "isolated-study-credit-trial-secret-32-characters" },
      owner,
      familyGroupId,
    );
    await recordSolve(actor, profile, paid.id, 100);
    expect(await listSolves(actor, profile)).toHaveLength(2);
    await revokeStudyDevice(owner, access.device.id);
    await expect(recordSolve(actor, profile, free.id, 20)).rejects.toMatchObject({
      code: "PROFILE",
    });
    expect(await listSolves(actor, profile)).toEqual([]);
    // A delegated credential disappearing does not remove the student's confirmed history.
    const parent = { kind: "parent" as const, userId: owner, familyGroupId };
    expect(await listSolves(parent, profile)).toHaveLength(2);
  });
  async function profileTarget(nativeId = profile) {
    const [row] = await db
      .select({ personId: familyAppProfiles.personId })
      .from(missaoProfiles)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
      .where(eq(missaoProfiles.id, nativeId));
    if (!row) throw new Error("Missing canonical student");
    return { groupId: familyGroupId, personId: row.personId, app: "missao-saber", userId: other };
  }
  async function inviteCaregiver() {
    const invitation = await family.createInvitation(owner, familyGroupId, `${other}@example.test`);
    await family.acceptInvitation(other, invitation.token);
    const target = await profileTarget();
    for (const action of ["read", "write"] as const)
      await family.grantAccess(owner, { ...target, action });
    return target;
  }
  it("preserves the child capability through missions, notes, reports and replay without losing confirmed history", async () => {
    const target = await inviteCaregiver();
    const device = await createStudyDevice(other, deviceInput());
    const actor = {
      kind: "study" as const,
      userId: other,
      familyGroupId,
      deviceId: device.device.id,
      profileId: profile,
    };
    const parent = { kind: "parent" as const, userId: owner, familyGroupId };
    expect((await getProfiles(actor)).map((entry) => entry.id)).toEqual([profile]);
    const input = {
      profileId: profile,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    };
    const [first, retry] = await Promise.all([begin(actor, input), begin(actor, input)]);
    expect(first.id).toBe(retry.id);
    const lesson = findLesson("fracoes-1");
    const item = lesson?.items[0];
    if (item?.type !== "choice") throw new Error("Missing authored fixture");
    await hint(actor, { sessionId: first.id, itemId: item.id, level: 1 });
    const response = {
      sessionId: first.id,
      itemId: item.id,
      answer: item.answer,
      requestKey: randomUUID(),
    };
    await Promise.all([answer(actor, response), answer(actor, response)]);
    await saveNote(actor, profile, "Uma descoberta sobre frações", {
      sessionId: first.id,
      itemId: item.id,
    });
    expect((await notebookPage(parent, profile)).items).toHaveLength(1);
    const report = {
      sessionId: first.id,
      itemId: item.id,
      category: "not_understood" as const,
      detail: "",
      requestKey: randomUUID(),
    };
    const savedReport = await saveReport(actor, report);
    expect((await saveReport(actor, report)).id).toBe(savedReport.id);
    await expect(
      begin(actor, { ...input, profileId: sibling, requestKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "PROFILE" });
    await family.revokeAccess(owner, { ...target, action: "read" });
    await family.grantAccess(owner, { ...target, action: "read" });
    await expect(answer(actor, response)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveReport(actor, report)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(history(actor, profile)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await history(parent, profile)).evidence).toHaveLength(1);
    expect((await readSession(parent, first.id)).saved).toHaveLength(1);
  });
  it("atomically records laboratory assistance and refuses child writes after device revocation", async () => {
    const device = await createStudyDevice(owner, deviceInput());
    const actor = {
      kind: "study" as const,
      userId: owner,
      familyGroupId,
      deviceId: device.device.id,
      profileId: profile,
    };
    const session = await begin(actor, {
      profileId: profile,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const item = findLesson("fracoes-1")?.items[0];
    if (!item) throw new Error("Missing item");
    const experience = experiencesForItem("fracoes-1", item.id)[0];
    if (!experience) throw new Error("Missing experience");
    const input = {
      id: randomUUID(),
      profileId: profile,
      experienceId: experience.id,
      context: { sessionId: session.id, itemId: item.id },
    };
    const [run, replay] = await Promise.all([startLab(actor, input), startLab(actor, input)]);
    expect(replay.id).toBe(run.id);
    expect((await readSession(actor, session.id)).givenHints).toMatchObject([
      { count: 1, itemId: item.id },
    ]);
    expect(await listLabs(actor, profile)).toHaveLength(1);
    const save = {
      id: run.id,
      profileId: profile,
      revision: run.revision,
      document: { ...run.document, prediction: "Metade do inteiro" },
    };
    const saved = await saveLab(actor, save);
    await labToNotebook(actor, {
      id: run.id,
      profileId: profile,
      noteId: randomUUID(),
      revision: saved.revision,
    });
    await revokeStudyDevice(owner, device.device.id);
    await expect(saveLab(actor, save)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const parent = { kind: "parent" as const, userId: owner, familyGroupId };
    expect((await notebookPage(parent, profile)).items).toHaveLength(1);
    expect(await listLabs(parent, profile)).toHaveLength(1);
  });
  it("keeps read-only caregivers out of writing and requires every participant before revealing a competition", async () => {
    const target = await inviteCaregiver();
    await family.revokeAccess(owner, { ...target, action: "write" });
    const guest = { kind: "parent" as const, userId: other, familyGroupId };
    const parent = { kind: "parent" as const, userId: owner, familyGroupId };
    expect(
      (await getProfiles(guest)).map((entry) => ({ id: entry.id, write: entry.canWrite })),
    ).toEqual([{ id: profile, write: false }]);
    expect((await history(guest, profile)).evidence).toEqual([]);
    await expect(saveNote(guest, profile, "Não autorizado")).rejects.toMatchObject({
      code: "PROFILE",
    });
    const session = await begin(parent, {
      profileId: profile,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const item = findLesson("fracoes-1")?.items[0];
    if (!item) throw new Error("Missing content");
    await saveReport(parent, {
      sessionId: session.id,
      itemId: item.id,
      category: "not_understood",
      detail: "Relato compartilhado do estudante",
      requestKey: randomUUID(),
    });
    expect((await readSession(guest, session.id)).sessionReports).toMatchObject([
      { detail: "Relato compartilhado do estudante" },
    ]);
    const id = await createCompetition(parent, {
      titulo: "Encontro em casa",
      area: "matematica",
      perfis: [profile, sibling],
      problemas: 1,
      desafios: 0,
      segundosProblema: 90,
      segundosDesafio: 300,
      requestKey: randomUUID(),
    });
    expect(await listCompetitions(guest)).toEqual([]);
    await expect(competitionView(guest, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const second = await profileTarget(sibling);
    await family.grantAccess(owner, { ...second, action: "read" });
    expect((await competitionView(guest, id)).competidores).toHaveLength(2);
    await expect(startTurn(guest, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const person of [target, second])
      await family.grantAccess(owner, { ...person, action: "write" });
    expect((await startTurn(guest, id)).status).toBe("running");
    await family.revokeAccess(owner, { ...second, action: "read" });
    expect(await listCompetitions(guest)).toEqual([]);
  });
  it("lets a granted adult opt in without inventing consent and binds email delivery to exact grants", async () => {
    const target = await inviteCaregiver();
    const actor = { kind: "parent" as const, userId: other, familyGroupId };
    await setWeeklyReportEmail(other, true);
    const [prefs] = await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, other));
    expect(prefs).toMatchObject({ weeklyReportEmail: true, consentVersion: null, consentAt: null });
    const receipts = [{ actor, students: await weeklySnapshot(actor) }];
    expect(await mayDeliverWeeklySnapshot(other, `${other}@example.test`, receipts)).toBe(true);
    await family.revokeAccess(owner, { ...target, action: "read" });
    await family.grantAccess(owner, { ...target, action: "read" });
    expect(await mayDeliverWeeklySnapshot(other, `${other}@example.test`, receipts)).toBe(false);
    await setWeeklyReportEmail(other, false);
  });
  it("lets a granted caregiver issue a device, and regranting access cannot revive its old capability", async () => {
    const target = await inviteCaregiver();
    const device = await createStudyDevice(other, deviceInput());
    expect((await readStudyDevice(device.token))?.profileIds).toEqual([profile]);
    await family.revokeAccess(owner, { ...target, action: "write" });
    expect(await readStudyDevice(device.token)).toBeNull();
    await family.grantAccess(owner, { ...target, action: "write" });
    expect(await readStudyDevice(device.token)).toBeNull();
    const renewed = await createStudyDevice(other, deviceInput());
    expect((await readStudyDevice(renewed.token))?.profileIds).toEqual([profile]);
  });
  it("preserves devices through renames but requires a fresh grant after archiving and restoring a person", async () => {
    const target = await profileTarget();
    const device = await createStudyDevice(owner, deviceInput());
    const person = (await family.listPeople(owner, familyGroupId)).find(
      (entry) => entry.id === target.personId,
    );
    if (!person) throw new Error("Missing person");
    await family.updatePerson(owner, {
      groupId: target.groupId,
      personId: target.personId,
      expectedVersion: person.version,
      displayName: "Novo nome",
      color: person.color,
      avatar: person.avatar,
    });
    expect(await readStudyDevice(device.token)).not.toBeNull();
    await family.archivePerson(owner, familyGroupId, target.personId);
    expect(await readStudyDevice(device.token)).toBeNull();
    await family.restorePerson(owner, familyGroupId, target.personId);
    expect(await readStudyDevice(device.token)).toBeNull();
    expect(
      await readStudyDevice((await createStudyDevice(owner, deviceInput())).token),
    ).not.toBeNull();
  });
  it("rejects forged issuer, family, student and management authority at the repository", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    const actor = {
      kind: "study" as const,
      userId: owner,
      familyGroupId,
      deviceId: access.device.id,
      profileId: profile,
    };
    const visible = (authority: typeof actor, action: "read" | "manage" | "use_ai" = "read") =>
      db
        .select({ id: missaoProfiles.id })
        .from(missaoProfiles)
        .where(studentAccessCondition(authority, missaoProfiles.id, action));
    expect(await visible(actor)).toEqual([{ id: profile }]);
    expect(await visible({ ...actor, userId: other })).toEqual([]);
    expect(await visible({ ...actor, familyGroupId: randomUUID() })).toEqual([]);
    expect(await visible({ ...actor, profileId: sibling })).toEqual([]);
    expect(await visible(actor, "manage")).toEqual([]);
    expect(await visible(actor, "use_ai")).toEqual([]);
  });
  it("limits concurrently issued devices within the same family", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => createStudyDevice(owner, deviceInput())),
    );
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(10);
    expect(await listStudyDevices(owner)).toHaveLength(10);
  });
  it("rejects a pending code after the issuing caregiver loses access", async () => {
    const target = await inviteCaregiver();
    const access = await createStudyCode(other, deviceInput());
    await family.revokeAccess(owner, { ...target, action: "read" });
    await family.grantAccess(owner, { ...target, action: "read" });
    await expect(redeemStudyCode(access.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("rechecks a device revoked while a domain write waits for its row lock", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    const actor = {
      kind: "study" as const,
      userId: owner,
      familyGroupId,
      deviceId: access.device.id,
      profileId: profile,
    };
    let markLocked = () => {};
    let unlock = () => {};
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const revoke = db.transaction(async (tx) => {
      await tx
        .update(missaoStudyDevices)
        .set({ revokedAt: new Date() })
        .where(eq(missaoStudyDevices.id, access.device.id));
      markLocked();
      await release;
    });
    await locked;
    const writing = db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('application_name', ${`device-write-${access.device.id}`}, true)`,
      );
      await lockStudentAccess(tx, actor, [profile]);
      await tx.update(missaoProfiles).set({ grade: 7 }).where(eq(missaoProfiles.id, profile));
    });
    // Observe PostgreSQL's actual wait, rather than relying on a scheduling sleep.
    try {
      await expect
        .poll(async () => {
          const rows = await db.execute(
            sql`select 1 from pg_stat_activity where application_name = ${`device-write-${access.device.id}`} and wait_event_type = 'Lock'`,
          );
          return rows.length;
        })
        .toBe(1);
    } finally {
      unlock();
    }
    await revoke;
    await expect(writing).rejects.toMatchObject({ code: "PROFILE" });
    const [row] = await db
      .select({ grade: missaoProfiles.grade })
      .from(missaoProfiles)
      .where(eq(missaoProfiles.id, profile));
    expect(row?.grade).toBe(6);
  });
  it("stores hashes, restricts the profile set and omits credentials from the device list", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    expect((await readStudyDevice(access.token))?.profileIds).toEqual([profile]);
    const [stored] = await db
      .select()
      .from(missaoStudyDevices)
      .where(eq(missaoStudyDevices.id, access.device.id));
    expect(stored?.tokenHash).not.toBe(access.token);
    expect(await readStudyDevice(randomUUID())).toBeNull();
    expect(await readStudyDevice(randomBytes(32).toString("hex"))).toBeNull();
    expect(JSON.stringify(await listStudyDevices(owner))).not.toContain(access.token);
    expect(JSON.stringify(await listStudyDevices(owner))).not.toContain(stored?.tokenHash);
  });
  it("cannot grant profiles owned by another family", async () => {
    await expect(createStudyDevice(other, deviceInput())).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });
  it("authorizes multiple siblings only when the parent explicitly includes them", async () => {
    const access = await createStudyDevice(owner, {
      ...deviceInput(),
      profileIds: [profile, sibling],
    });
    expect((await readStudyDevice(access.token))?.profileIds.sort()).toEqual(
      [profile, sibling].sort(),
    );
  });
  it("revokes immediately without allowing another owner to revoke it", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    expect(await revokeStudyDevice(other, access.device.id)).toBe(false);
    expect(await readStudyDevice(access.token)).not.toBeNull();
    expect(await revokeStudyDevice(owner, access.device.id)).toBe(true);
    expect(await readStudyDevice(access.token)).toBeNull();
  });
  it("ends a bearer connection and rejects expired credentials", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await db
      .update(missaoStudyDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyDevices.id, access.device.id));
    expect(await readStudyDevice(access.token)).toBeNull();
    await endStudyDevice(access.token);
    expect((await listStudyDevices(owner))[0]?.revokedAt).not.toBeNull();
  });
  it("cannot keep studying after the owning account is blocked", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await db.update(users).set({ banned: true }).where(eq(users.id, owner));
    expect(await readStudyDevice(access.token)).toBeNull();
  });
  it("consumes a connection code exactly once under concurrent replay", async () => {
    const pairing = await createStudyCode(owner, { ...deviceInput(), remember: true });
    const results = await Promise.allSettled([
      redeemStudyCode(pairing.code),
      redeemStudyCode(pairing.code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "fulfilled") {
        expect((await readStudyDevice(result.value.token))?.profileIds).toEqual([profile]);
        expect(result.value.device.expiresAt.getTime() - Date.now()).toBeGreaterThan(
          29 * 24 * 60 * 60_000,
        );
      }
    await expect(redeemStudyCode(pairing.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("rejects revoked and expired invitations", async () => {
    const first = await createStudyCode(owner, deviceInput());
    await revokeStudyDevice(owner, first.device.id);
    await expect(redeemStudyCode(first.code)).rejects.toMatchObject({ code: "CODE" });
    const second = await createStudyCode(owner, deviceInput());
    await db
      .update(missaoStudyDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyDevices.id, second.device.id));
    await expect(redeemStudyCode(second.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("limits concurrent connection attempts and opens a new window after ten minutes", async () => {
    const address = randomUUID();
    const now = new Date();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeCodeAttempt(address, now)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    await expect(consumeCodeAttempt(address, now)).rejects.toMatchObject({ code: "RATE_LIMIT" });
    await expect(
      consumeCodeAttempt(address, new Date(now.getTime() + 10 * 60_000)),
    ).resolves.toBeUndefined();
  });
  it("deletes study access when the family is cleared", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await clearFamily({ kind: "parent", userId: owner, familyGroupId });
    expect(await readStudyDevice(access.token)).toBeNull();
    expect(await listStudyDevices(owner)).toEqual([]);
  });
  it("erases archived app history without erasing the shared person or restoring study authority", async () => {
    const device = await createStudyDevice(owner, deviceInput());
    const [native] = await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profile));
    if (!native) throw new Error("Missing native student");
    const [activation] = await db
      .select()
      .from(familyAppProfiles)
      .where(eq(familyAppProfiles.id, native.familyProfileId));
    if (!activation) throw new Error("Missing activation");
    await family.archivePerson(owner, familyGroupId, activation.personId);
    expect(await readStudyDevice(device.token)).toBeNull();
    await clearFamily({ kind: "parent", userId: owner, familyGroupId });
    expect(await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profile))).toEqual(
      [],
    );
    await family.restorePerson(owner, familyGroupId, activation.personId);
    expect(
      (await family.listPeople(owner, familyGroupId)).some(
        (person) => person.id === activation.personId,
      ),
    ).toBe(true);
    expect(await readStudyDevice(device.token)).toBeNull();
  });
  it("rejects a code whose own expiry elapsed even if the device has time left", async () => {
    const pairing = await createStudyCode(owner, deviceInput());
    await db
      .update(missaoStudyCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyCodes.deviceId, pairing.device.id));
    await expect(redeemStudyCode(pairing.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("keeps active devices visible ahead of historical connections and cleans only old credentials", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    const old = new Date(Date.now() - 32 * 24 * 60 * 60_000);
    await db.insert(missaoStudyDevices).values(
      Array.from({ length: 31 }, () => ({
        userId: owner,
        familyGroupId,
        label: "Encerrado",
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: old,
        revokedAt: old,
      })),
    );
    expect((await listStudyDevices(owner))[0]?.id).toBe(access.device.id);
    await cleanupStudyAccess();
    expect(await listStudyDevices(owner)).toHaveLength(1);
    expect(await readStudyDevice(access.token)).not.toBeNull();
  });
});
