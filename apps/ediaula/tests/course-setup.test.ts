import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySetup,
  courseSetupSchema,
  sameCourse,
  setupFileName,
  setupFromProject,
} from "../src/shared/courseSetup.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { redrawPlan } from "../src/shared/relink.ts";
import type { Asset, Project } from "../src/shared/types.ts";

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

const lesson = (): Project => ({
  version: 1,
  id: "p1",
  name: "Aula 3",
  course: "Sistema Zero",
  createdAt: 0,
  updatedAt: 0,
  palette: "sistema-zero",
  paletteFonts: true,
  captions: { look: "karaoke", position: "bottom", size: 1, burn: true },
  audio: { ducking: { depth: 0.3 } },
  settings: { width: 1080, height: 1920, fps: 30 },
  assets: [
    media("tela"),
    media("trilha", { kind: "audio", hasVideo: false, width: 0, height: 0, name: "Trilha leve" }),
    media("titulo", {
      kind: "image",
      duration: 0,
      generated: "annotation",
      name: "Abertura animada · Título",
    }),
  ],
  tracks: [
    { id: "a", kind: "video", name: "Anotações", muted: false, hidden: false, locked: true },
    {
      id: "v",
      kind: "video",
      name: "Tela",
      muted: false,
      hidden: false,
      locked: false,
      height: 90,
    },
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
    { id: "c3", assetId: "titulo", trackId: "a", start: 0, in: 0, duration: 5, volume: 1 },
  ],
});

test("a lesson becomes its course's template: format, palette, captions, tracks, music and cards", () => {
  const setup = setupFromProject(lesson(), 42);
  assert.ok(courseSetupSchema.safeParse(setup).success);
  assert.equal(setup.course, "Sistema Zero");
  assert.deepEqual(setup.settings, { width: 1080, height: 1920, fps: 30 });
  assert.equal(setup.palette, "sistema-zero");
  assert.equal(setup.captions?.look, "karaoke");
  assert.deepEqual(
    setup.tracks.map((t) => t.name),
    ["Anotações", "Tela", "Música"],
  );
  assert.equal(setup.tracks[2].music, true);
  assert.equal(setup.tracks[1].height, 90);
  assert.deepEqual(setup.audio?.music, {
    path: "C:/aulas/trilha",
    name: "Trilha leve",
    volume: 0.3,
    track: 2,
  });
  assert.deepEqual(setup.cards, { opening: true, closing: false });
  assert.throws(() => setupFromProject({ ...lesson(), course: undefined }), /curso/);
});

test("a new lesson starts set up like the template, with new tracks and the cards still to come", () => {
  const setup = setupFromProject(lesson());
  const empty: Project = {
    version: 1,
    id: "p2",
    name: "Aula 4",
    course: "sistema zero",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [],
    tracks: [],
    clips: [],
  };
  const { project, musicTrack } = applySetup(empty, setup);
  assert.ok(projectSchema.safeParse(project).success);
  assert.deepEqual(project.settings, setup.settings);
  assert.equal(project.paletteFonts, true);
  assert.equal(project.tracks.length, 3);
  assert.ok(
    project.tracks.every((t) => !t.locked),
    "tracks start unlocked",
  );
  assert.ok(!project.tracks.some((t) => lesson().tracks.some((old) => old.id === t.id)));
  assert.equal(musicTrack, project.tracks[2].id);
  assert.deepEqual(project.pendingStart, { opening: true, closing: false });
  assert.equal(project.clips.length, 0);
});

test("templates are found by course however it was typed", () => {
  assert.equal(setupFileName(" Sistema  Zero "), "sistema zero.json");
  assert.equal(setupFileName('A/B: "C"?'), "ab c.json");
  assert.equal(setupFileName("..."), "sem curso.json");
  assert.ok(sameCourse("Sistema Zero", "  sistema zero"));
  assert.ok(!sameCourse("Sistema Zero", undefined));
});

test("the editor's own pictures are drawn again from what made them", () => {
  const project: Project = {
    ...lesson(),
    assets: [
      media("tela", { cursor: "C:/aulas/cursor.json" }),
      media("nota", { kind: "image", duration: 0, generated: "annotation" }),
      media("vazio", { kind: "image", duration: 0, generated: "effect" }),
      media("quadro", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "tela", t: 12.5 },
      }),
      media("perdido", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "sumiu", t: 1 },
      }),
      media("avatar", {
        key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
      }),
      media("quadro-avatar", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "avatar", t: 3 },
      }),
    ],
    clips: [
      {
        id: "n",
        assetId: "nota",
        trackId: "a",
        start: 0,
        in: 0,
        duration: 3,
        volume: 1,
        annotation: { kind: "balloon", text: "Oi", color: "#3D6BFF" },
      },
    ],
  };
  const asset = (id: string): Asset => {
    const a = project.assets.find((x) => x.id === id);
    assert.ok(a, id);
    return a;
  };
  assert.equal(redrawPlan(project, asset("nota"))?.how, "annotation");
  assert.deepEqual(redrawPlan(project, asset("vazio")), { how: "effect" });
  const still = redrawPlan(project, asset("quadro"));
  assert.ok(still?.how === "still" && still.source.id === "tela" && still.t === 12.5);
  assert.equal(redrawPlan(project, asset("perdido")), null, "the source is gone");
  assert.equal(
    redrawPlan(project, asset("quadro-avatar")),
    null,
    "a cut-out avatar waits for its transparent copy",
  );
  assert.equal(redrawPlan(project, media("solta", { generated: "annotation" })), null);
  assert.equal(
    redrawPlan(project, asset("tela")),
    null,
    "media of the lesson is reconnected, not drawn",
  );
});
