import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import { missaoNotes, missaoSessions, users } from "@informach/db/schema";
import { afterAll, expect, it } from "vitest";
import { findLesson } from "@/features/content/catalog";
import {
  archiveNote,
  editNote,
  notebookPage,
  readNoteContext,
  saveNote,
  startSession,
} from "@/features/learning/repository";
import { createProfile } from "@/features/learning/service";

const owners: string[] = [];
async function family() {
  const owner = randomUUID();
  owners.push(owner);
  await db
    .insert(users)
    .values({ id: owner, email: `${owner}@example.test`, name: "Caderno", emailVerified: true });
  const profile = await createProfile(owner, {
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId: "canguru-e",
    consent: true,
  });
  return { owner, profile };
}
afterAll(async () => {
  await db.delete(users).where(inArray(users.id, owners));
});

it("preserves frozen context without exposing grading and rejects forged ownership/items", async () => {
  const { owner, profile } = await family();
  const other = await family();
  const lesson = findLesson("fracoes-1");
  if (!lesson?.items[0]) throw new Error("Missing fixture");
  const session = await startSession(
    owner,
    profile.id,
    { ...lesson, title: "Título congelado" },
    "mission",
    randomUUID(),
  );
  const context = { sessionId: session.id, itemId: lesson.items[0].id };
  await saveNote(owner, profile.id, "Minha primeira descoberta", context);
  const page = await notebookPage(owner, profile.id);
  expect(page.items[0]?.context).toEqual({
    ...context,
    title: "Título congelado",
    prompt: lesson.items[0].prompt,
  });
  await expect(
    saveNote(other.owner, other.profile.id, "Contexto alheio", context),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(readNoteContext(owner, profile.id, session.id, "inexistente")).rejects.toMatchObject(
    { code: "ITEM" },
  );
  const note = page.items[0];
  if (!note) throw new Error("Missing note");
  await expect(editNote(other.owner, other.profile.id, note.id, "Invasão")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(archiveNote(other.owner, other.profile.id, note.id, true)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await editNote(owner, profile.id, note.id, "Texto corrigido");
  await db.delete(missaoSessions).where(eq(missaoSessions.id, session.id));
  expect((await notebookPage(owner, profile.id)).items[0]).toMatchObject({
    text: "Texto corrigido",
    context: null,
    sessionId: null,
  });
});

it("paginates tied dates without duplication and searches literal SQL wildcard characters", async () => {
  const { owner, profile } = await family();
  await db.insert(missaoNotes).values(
    Array.from({ length: 45 }, (_, i) => ({
      profileId: profile.id,
      text: i === 0 ? "Taxa 50%_ e barra \\" : `Descoberta ${i}`,
      createdAt: new Date("2026-10-01T12:00:00Z"),
    })),
  );
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await notebookPage(owner, profile.id, { cursor });
    ids.push(...page.items.map((n) => n.id));
    cursor = page.next ?? undefined;
  } while (cursor);
  expect(ids).toHaveLength(45);
  expect(new Set(ids).size).toBe(45);
  expect((await notebookPage(owner, profile.id, { search: "%_" })).items).toHaveLength(1);
  expect((await notebookPage(owner, profile.id, { search: "\\" })).items).toHaveLength(1);
  expect((await notebookPage(owner, profile.id, { search: "'; drop table" })).items).toHaveLength(
    0,
  );
});

it("archives without losing text and applies the active limit to additions and restores", async () => {
  const { owner, profile } = await family();
  await db
    .insert(missaoNotes)
    .values(Array.from({ length: 100 }, (_, i) => ({ profileId: profile.id, text: `Ideia ${i}` })));
  const first = (await notebookPage(owner, profile.id)).items[0];
  if (!first) throw new Error("Missing note");
  expect(first).toMatchObject({ archivedAt: null, sessionId: null, itemId: null });
  await expect(saveNote(owner, profile.id, "Sem espaço")).rejects.toMatchObject({ code: "LIMIT" });
  await archiveNote(owner, profile.id, first.id, true);
  await saveNote(owner, profile.id, "Nova ideia");
  await expect(archiveNote(owner, profile.id, first.id, false)).rejects.toMatchObject({
    code: "LIMIT",
  });
  const archive = await notebookPage(owner, profile.id, { archived: true, search: first.text });
  expect(archive).toMatchObject({ activeCount: 100, archivedCount: 1 });
  expect(archive.items[0]?.text).toBe(first.text);
  const another = (await notebookPage(owner, profile.id)).items.find((n) => n.id !== first.id);
  if (!another) throw new Error("Missing note");
  await archiveNote(owner, profile.id, another.id, true);
  await archiveNote(owner, profile.id, first.id, false);
  expect(
    (await notebookPage(owner, profile.id, { search: first.text })).items.some(
      (n) => n.id === first.id,
    ),
  ).toBe(true);
});
