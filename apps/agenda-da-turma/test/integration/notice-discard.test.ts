import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNotices,
  agendaProductEvents,
  agendaStudentProfiles,
  creditReservations,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withActionIds } from "@/features/notices/drafts";
import { reserveNoticeParse } from "@/features/notices/parse-repository";
import { listReadyNotices } from "@/features/notices/repository";
import {
  type NoticeActionInput,
  parseNoticeSchema,
  type StoredExtraction,
  storedExtractionSchema,
} from "@/features/notices/schemas";
import {
  confirmNotice,
  discardDraftAction,
  discardNotice,
  getNoticeDraft,
} from "@/features/notices/service";
import { countTrialImports } from "@/features/notices/trial";

let owner: string;
let guest: string;
let outsider: string;
let child: string;

const extracted = {
  type: "task" as const,
  title: "Fazer páginas 20 e 21",
  description: null,
  dueAt: null,
  dateOrigin: "unspecified" as const,
  time: null,
  location: null,
  sourceExcerpt: "Fazer páginas 20 e 21",
};
const legacyExtraction = {
  actions: [extracted, { ...extracted, title: "Levar tesoura", sourceExcerpt: "Levar tesoura" }],
  warnings: [],
};
const action = (profileId: string): NoticeActionInput => ({
  profileId,
  type: "task",
  subjectId: null,
  profileSubjectId: null,
  title: "Fazer páginas 20 e 21",
  description: null,
  dueAt: null,
  dateOrigin: "unspecified",
  time: null,
  estimatedMinutes: null,
  location: null,
  sourceExcerpt: null,
  assignedToUserId: null,
  reminderAt: null,
  recurrence: "none",
  shareWithTurma: false,
});
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture");
  return value;
}
async function insertNotice(
  overrides: Partial<typeof agendaNotices.$inferInsert> & { parsedResult?: unknown } = {},
) {
  const [row] = await db
    .insert(agendaNotices)
    .values({
      ownerUserId: owner,
      captureProfileId: child,
      createdByUserId: owner,
      source: "teams",
      text: "Recado fictício",
      contentHash: randomUUID(),
      status: "ready",
      parsedResult: withActionIds(legacyExtraction),
      ...overrides,
    })
    .returning();
  return required(row);
}
async function reload(id: string) {
  const [row] = await db.select().from(agendaNotices).where(eq(agendaNotices.id, id));
  return required(row);
}
function storedIds(row: typeof agendaNotices.$inferSelect) {
  return storedExtractionSchema.parse(row.parsedResult).actions.map((a) => a.id);
}

beforeEach(async () => {
  owner = `discard-owner-${randomUUID()}`;
  guest = `discard-guest-${randomUUID()}`;
  outsider = `discard-outsider-${randomUUID()}`;
  await db.insert(users).values(
    [owner, guest, outsider].map((id) => ({
      id,
      name: "Adulto fictício",
      email: `${id}@e2e.local`,
      emailVerified: true,
    })),
  );
  const [profile] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: owner, name: "Criança fictícia" })
    .returning();
  child = required(profile).id;
  // Segundo adulto com acesso à criança, sem passar pelo convite (que exige
  // Pro): o que interessa aqui é o predicado de acesso, não o plano.
  const [member] = await db
    .insert(agendaFamilyMembers)
    .values({ ownerUserId: owner, userId: guest })
    .returning();
  await db
    .insert(agendaFamilyProfileAccess)
    .values({ memberId: required(member).id, profileId: child });
});
afterEach(async () => {
  const ids = [owner, guest, outsider];
  await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, ids));
  await db.delete(creditReservations).where(inArray(creditReservations.ownerId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

describe("discarding drafts", () => {
  it("discards one action and keeps the other, with the same id", async () => {
    const notice = await insertNotice();
    const [first, second] = storedIds(notice);
    const result = await discardDraftAction(owner, {
      noticeId: notice.id,
      actionId: required(first),
    });
    expect(result).toMatchObject({ ok: true, value: { remaining: 1 } });
    const draft = await getNoticeDraft(owner, notice.id);
    expect(draft?.extraction.actions.map((a) => a.id)).toEqual([second]);
    expect((await reload(notice.id)).status).toBe("ready");
    expect((await listReadyNotices(owner)).map((n) => n.id)).toContain(notice.id);
    // Descartar de novo a mesma ação não existe mais para a família.
    expect(
      await discardDraftAction(owner, { noticeId: notice.id, actionId: required(first) }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("retires the notice when the last action is discarded", async () => {
    const notice = await insertNotice();
    const [first, second] = storedIds(notice);
    await discardDraftAction(owner, { noticeId: notice.id, actionId: required(first) });
    expect(
      await discardDraftAction(owner, { noticeId: notice.id, actionId: required(second) }),
    ).toMatchObject({ ok: true, value: { remaining: 0 } });
    expect((await reload(notice.id)).status).toBe("discarded");
    expect((await listReadyNotices(owner)).map((n) => n.id)).not.toContain(notice.id);
    expect(await getNoticeDraft(owner, notice.id)).toBeNull();
    // Aba velha salvando um recado já descartado: a tela está desatualizada,
    // não há processamento em curso a esperar.
    expect(
      await confirmNotice(owner, {
        noticeId: notice.id,
        actions: [action(child)],
        allowDuplicates: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_DRAFT" } });
  });
  it("discards a whole draft only while it is ready, and only for who can resume it", async () => {
    const confirmed = await insertNotice({ status: "confirmed", confirmedAt: new Date() });
    expect(await discardNotice(owner, { noticeId: confirmed.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_DRAFT" },
    });
    expect((await reload(confirmed.id)).status).toBe("confirmed");

    const ownerCapture = await insertNotice();
    expect(await discardNotice(outsider, { noticeId: ownerCapture.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    // O convidado não capturou este: não é dele para descartar.
    expect(await discardNotice(guest, { noticeId: ownerCapture.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await discardNotice(owner, { noticeId: ownerCapture.id })).toMatchObject({
      ok: true,
      value: { id: ownerCapture.id },
    });
    expect((await reload(ownerCapture.id)).status).toBe("discarded");

    const guestCapture = await insertNotice({ createdByUserId: guest });
    expect(await discardNotice(guest, { noticeId: guestCapture.id })).toMatchObject({
      ok: true,
    });
    expect((await reload(guestCapture.id)).status).toBe("discarded");
  });
  it("keeps counting a discarded trial import against the free allowance", async () => {
    for (let i = 0; i < 4; i += 1) await insertNotice({ isTrial: true });
    await insertNotice({ isTrial: true, status: "discarded" });
    expect(await countTrialImports(owner)).toBe(5);
    const reserved = await reserveNoticeParse({
      userId: owner,
      ownerId: owner,
      profileId: child,
      isPro: false,
      input: parseNoticeSchema.parse({ profileId: child, source: "teams", text: "Outro recado" }),
      attachment: null,
      contentHash: randomUUID(),
      now: new Date(),
      trialDailyBudget: 10000,
    });
    expect(reserved).toMatchObject({ ok: false, error: { code: "TRIAL_ENDED" } });
  });
  it("replays discarded content without a new charge and restores every action", async () => {
    const stored = withActionIds(legacyExtraction);
    const [keep, drop] = stored.actions;
    const marked: StoredExtraction = {
      ...stored,
      actions: [required(keep), { ...required(drop), discardedAt: new Date().toISOString() }],
    };
    const contentHash = randomUUID();
    const notice = await insertNotice({
      status: "discarded",
      isTrial: true,
      contentHash,
      billingRunId: randomUUID(),
      parsedResult: marked,
    });
    const replay = await reserveNoticeParse({
      userId: owner,
      ownerId: owner,
      profileId: child,
      isPro: false,
      input: parseNoticeSchema.parse({
        profileId: child,
        source: "teams",
        text: "Recado fictício",
      }),
      attachment: null,
      contentHash,
      now: new Date(),
      trialDailyBudget: 10000,
    });
    expect(replay).toMatchObject({ ok: true, value: { replay: true, notice: { id: notice.id } } });
    const restored = await reload(notice.id);
    expect(restored.status).toBe("ready");
    const actions = storedExtractionSchema.parse(restored.parsedResult).actions;
    expect(actions.map((a) => a.id)).toEqual(stored.actions.map((a) => a.id));
    expect(actions.every((a) => !a.discardedAt)).toBe(true);
    expect(
      await db.select().from(creditReservations).where(eq(creditReservations.ownerId, owner)),
    ).toHaveLength(0);
    expect(
      await db.select().from(agendaProductEvents).where(eq(agendaProductEvents.userId, owner)),
    ).toHaveLength(0);
    expect((await getNoticeDraft(owner, notice.id))?.extraction.actions).toHaveLength(2);
  });
  it("never resurrects a discarded draft for an adult who cannot resume it", async () => {
    const contentHash = randomUUID();
    const notice = await insertNotice({ status: "discarded", contentHash });
    const replay = await reserveNoticeParse({
      userId: guest,
      ownerId: owner,
      profileId: child,
      isPro: true,
      input: parseNoticeSchema.parse({
        profileId: child,
        source: "teams",
        text: "Recado fictício",
      }),
      attachment: null,
      contentHash,
      now: new Date(),
      trialDailyBudget: 10000,
    });
    expect(replay).toMatchObject({ ok: true, value: { replay: true } });
    // O convidado recebe NOT_FOUND na checagem de acesso do serviço; o que não
    // pode acontecer é o recado do titular voltar para "Falta conferir".
    expect((await reload(notice.id)).status).toBe("discarded");
    expect((await listReadyNotices(owner)).map((n) => n.id)).not.toContain(notice.id);
  });
  it("gives legacy rows stable ids on first resume", async () => {
    const notice = await insertNotice({ parsedResult: legacyExtraction });
    const first = await getNoticeDraft(owner, notice.id);
    const ids = first?.extraction.actions.map((a) => a.id) ?? [];
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(storedIds(await reload(notice.id))).toEqual(ids);
    const second = await getNoticeDraft(owner, notice.id);
    expect(second?.extraction.actions.map((a) => a.id)).toEqual(ids);
    // E a lixeira funciona nelas como em qualquer outra.
    expect(
      await discardDraftAction(owner, { noticeId: notice.id, actionId: required(ids[0]) }),
    ).toMatchObject({ ok: true, value: { remaining: 1 } });
  });
});
