import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type CourseTemplate,
  courseFolderName,
  courseTemplateFrom,
  lessonCards,
  migrateCourseSetup,
  readCourseTemplate,
  sameCourse,
  startingLesson,
} from "../src/shared/courseTemplate.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Project } from "../src/shared/types.ts";

/**
 * One course template for both uses (shared/courseTemplate.ts): Novo projeto starts a lesson of
 * the course from it, and the file each course keeps (main/courseTemplates.ts) is found again,
 * moved up from the first version, and never shared by two courses.
 */

const userData = mkdtempSync(join(tmpdir(), "ediaula-cursos-"));
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(userData)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { getCourseTemplate, saveCourseTemplate, localMusicPath } = await import(
  "../src/main/courseTemplates.ts"
);
hook.deregister();

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind: "video",
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

/** A finished vertical lesson with its music, an opening card and the tracks of the course. */
const finished = (): Project => ({
  version: 1,
  id: "p1",
  name: "Aula 3",
  course: "Sistema Zero",
  createdAt: 0,
  updatedAt: 0,
  palette: "sistema-zero",
  paletteFonts: true,
  captions: { look: "karaoke", position: "bottom", size: 40, burn: true },
  audio: { ducking: { depth: 0.3 } },
  settings: { width: 1080, height: 1920, fps: 30 },
  assets: [
    media("tela"),
    media("trilha", { kind: "audio", hasVideo: false, width: 0, height: 0, name: "Trilha leve" }),
    media("abertura", { kind: "image", duration: 0, generated: "annotation", name: "Abertura" }),
  ],
  tracks: [
    { id: "a", kind: "video", name: "Anotações", muted: true, hidden: false, locked: true },
    { id: "v", kind: "video", name: "Tela", muted: false, hidden: true, locked: false, height: 90 },
    {
      id: "m",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
      duck: true,
    },
  ],
  clips: [
    { id: "c1", assetId: "tela", trackId: "v", start: 5, in: 0, duration: 100, volume: 1 },
    { id: "c2", assetId: "trilha", trackId: "m", start: 0, in: 0, duration: 105, volume: 0.3 },
    {
      id: "c3",
      assetId: "abertura",
      trackId: "a",
      start: 0,
      in: 0,
      duration: 5,
      volume: 1,
      annotation: { kind: "card", text: "Aula 3", color: "#111111" },
    },
  ],
});

const empty = (course = "sistema  zero"): Project => ({
  version: 1,
  id: "p2",
  name: "Aula 4",
  course,
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [
    { id: "t1", kind: "video", name: "Vídeo 1", muted: false, hidden: false, locked: false },
  ],
  clips: [],
});

test("a lesson becomes the template, and a new lesson of the course starts from it", () => {
  const saved = courseTemplateFrom(finished(), { now: 42 });
  // Round trip: what is kept on disk is read back the same, captions of any size included.
  const t = readCourseTemplate(JSON.parse(JSON.stringify(saved)));
  assert.ok(t);
  assert.deepEqual(t, saved);
  assert.equal(t.savedAt, 42);
  assert.deepEqual(
    t.tracks?.map((tr) => tr.name),
    ["Anotações", "Tela", "Música"],
  );
  // Muted, hidden and locked are a moment's choice, not the course's.
  assert.ok(!JSON.stringify(t.tracks).includes("muted"));
  assert.ok(!JSON.stringify(t.tracks).includes("hidden"));
  assert.deepEqual(t.music, {
    volume: 0.3,
    ducking: true,
    file: { path: "C:/aulas/trilha", name: "Trilha leve" },
    track: 2,
    duck: { depth: 0.3 },
  });
  assert.deepEqual(t.cards, { opening: true, closing: false });

  const { project, musicTrack } = startingLesson(empty(), t);
  assert.ok(projectSchema.safeParse(project).success);
  // The format is the one chosen in Novo projeto, not the template's.
  assert.deepEqual(project.settings, { width: 1920, height: 1080, fps: 30 });
  assert.equal(project.tracks.length, 3);
  assert.ok(project.tracks.every((tr) => !tr.locked && !tr.muted && !tr.hidden));
  assert.ok(!project.tracks.some((tr) => finished().tracks.some((old) => old.id === tr.id)));
  assert.equal(project.tracks[1].height, 90);
  assert.equal(musicTrack, project.tracks[2].id);
  assert.equal(project.palette, "sistema-zero");
  assert.equal(project.captions?.size, 40);
  assert.deepEqual(project.audio?.ducking, { depth: 0.3 });
  assert.deepEqual(project.pendingStart, { opening: true });
  // The template is not offered again on a lesson started from it.
  assert.deepEqual(project.templateOffer, { course: "sistema  zero", answer: "applied" });
});

test("cards of both kinds count, so none is made twice", () => {
  const p = finished();
  assert.deepEqual(lessonCards(p), { opening: true, closing: false });
  // The full-screen template of Modelos, named after it, at the end.
  const closing: Project = {
    ...p,
    assets: [
      ...p.assets,
      media("fim", {
        kind: "image",
        duration: 0,
        generated: "annotation",
        name: "Encerramento animado · Fim",
      }),
    ],
    clips: [
      ...p.clips,
      { id: "c4", assetId: "fim", trackId: "a", start: 105, in: 0, duration: 5, volume: 1 },
    ],
  };
  assert.deepEqual(lessonCards(closing), { opening: true, closing: true });
});

test("courses are the same however they were typed, and folder names are safe on Windows", () => {
  assert.ok(sameCourse("Sistema Zero", "  sistema   zero"));
  assert.ok(!sameCourse("Sistema Zero", undefined));
  assert.equal(courseFolderName("CON"), "_CON");
  assert.equal(courseFolderName("lpt1"), "_lpt1");
  assert.equal(courseFolderName('A/B: "C"?'), "AB C");
  assert.equal(courseFolderName("..."), "sem curso");
  // Only files on this computer are opened: a network path would send the person's credentials.
  assert.ok(localMusicPath("C:\\Músicas\\trilha.mp3"));
  assert.ok(!localMusicPath("\\\\servidor\\musicas\\trilha.mp3"));
  assert.ok(!localMusicPath("//servidor/musicas/trilha.mp3"));
  assert.ok(!localMusicPath("trilha.mp3"));
});

// Folder names that differ only in case are the same folder on Windows, the only system the app runs on.
test("two courses with the same folder name never share a template file", {
  skip: process.platform !== "win32" && "Windows only",
}, async () => {
  const one: CourseTemplate = {
    version: 2,
    course: "Aula: 1",
    format: { width: 1920, height: 1080, fps: 30 },
    palette: "a",
  };
  const two: CourseTemplate = {
    version: 2,
    course: "Aula 1",
    format: { width: 1080, height: 1920, fps: 30 },
    palette: "b",
  };
  const first = await saveCourseTemplate("Aula: 1", one);
  const second = await saveCourseTemplate("Aula 1", two);
  assert.notEqual(first, second);
  assert.ok(second.endsWith(join("Aula 1 (2)", "modelo.json")));
  assert.equal((await getCourseTemplate("aula: 1"))?.palette, "a");
  assert.equal((await getCourseTemplate("Aula 1"))?.palette, "b");
  // Saving again writes over the course's own file, not the other's.
  assert.equal(await saveCourseTemplate("Aula 1", { ...two, palette: "c" }), second);
  assert.equal((await getCourseTemplate("Aula: 1"))?.palette, "a");
  await assert.rejects(saveCourseTemplate("Outro", one), /outro curso/);
});

test("a template of the first version becomes version 2 the first time its course is read", async () => {
  const old = join(userData, "course-templates", "cadê todo mundo.json");
  await mkdir(join(userData, "course-templates"), { recursive: true });
  await writeFile(
    old,
    JSON.stringify({
      version: 1,
      course: "Cadê Todo Mundo",
      savedAt: 7,
      settings: { width: 1920, height: 1080, fps: 30 },
      palette: "farol",
      captions: { look: "box", position: "bottom", size: 120, burn: false },
      tracks: [
        { kind: "video", name: "Tela", muted: true },
        { kind: "audio", name: "Música", music: true, duck: true },
      ],
      cards: { opening: true },
      audio: {
        ducking: { depth: 0.2 },
        music: { path: "C:/m/trilha.mp3", name: "trilha", volume: 0.4, track: 1 },
      },
    }),
  );
  const t = await getCourseTemplate("Cadê Todo Mundo");
  assert.ok(t);
  assert.equal(t.version, 2);
  assert.equal(t.captions?.size, 120);
  assert.deepEqual(t.tracks?.[0], { kind: "video", name: "Tela" });
  assert.deepEqual(t.music, {
    volume: 0.4,
    ducking: true,
    file: { path: "C:/m/trilha.mp3", name: "trilha" },
    track: 1,
    duck: { depth: 0.2 },
  });
  assert.deepEqual(t.cards, { opening: true, closing: false });
  assert.ok(!existsSync(old), "the old file is set aside");
  assert.ok(existsSync(`${old}.migrated`));
  const kept = JSON.parse(
    await readFile(join(userData, "cursos", "Cadê Todo Mundo", "modelo.json"), "utf8"),
  );
  assert.deepEqual(readCourseTemplate(kept), t);
  // What is not a template of the first version is not one of the second either.
  assert.equal(migrateCourseSetup({ version: 1, course: "x" }), null);
  assert.equal(await getCourseTemplate("Curso sem modelo"), null);
});
