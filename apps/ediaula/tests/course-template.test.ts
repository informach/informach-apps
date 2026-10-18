import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type CourseTemplate,
  courseFolderName,
  courseTemplateFrom,
  courseTemplateMarkdown,
  directionRules,
  parseCourseTemplate,
  presenterLayout,
  readCourseTemplate,
  templateLook,
} from "../src/shared/courseTemplate.ts";
import { buildEditingTemplate } from "../src/shared/editingTemplate.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const media = (id: string, extra: Partial<Asset>): Asset => ({
  id,
  name: id,
  path: `C:/privado/${id}`,
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

/** A finished lesson: screen with cursor and automatic zooms, avatar, music, balloon, cards. */
const lesson: Project = {
  version: 1,
  id: "p",
  name: "A1-S1",
  course: "A Chave do Farol",
  createdAt: 0,
  updatedAt: 0,
  palette: "sistema-zero",
  paletteFonts: true,
  captions: { look: "karaoke", position: "bottom", size: 5.2, burn: true, font: "Nunito" },
  cleanup: { kept: ["f:x:1"], minSilence: 1.2, keepPause: 0.5, kinds: { repeat: false } },
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    media("tela", {
      name: "Tela",
      cursor: "C:/privado/cursor.json",
      cursorFx: { size: 3.85, smooth: 0.45, clicks: true, halo: false, hideIdle: false },
      zooms: [{ id: "z", start: 5, end: 8, scale: 1.8, focus: [], auto: true }],
    }),
    media("avatar", {
      name: "Debinha",
      width: 2160,
      height: 3840,
      screen: "#0970F6",
      key: { color: "#0970F6", threshold: 0.3, softness: 0.6, despill: 1, choke: 0 },
    }),
    media("musica", { name: "Lighthouse", kind: "audio", hasVideo: false, width: 0, height: 0 }),
    media("zoom", { name: "Zoom", kind: "image", generated: "effect", width: 1, height: 1 }),
    media("quadro", { name: "Quadro estendido · Tela", kind: "image", hasAudio: false }),
    media("balao", {
      name: "Balão",
      kind: "image",
      generated: "annotation",
      width: 400,
      height: 200,
    }),
    media("capa", { name: "Abertura", kind: "image", generated: "annotation" }),
  ],
  tracks: [
    { id: "t1", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    { id: "t2", kind: "video", name: "Avatar", muted: false, hidden: false, locked: false },
    { id: "t3", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "t4", kind: "audio", name: "Música", muted: false, hidden: false, locked: false },
  ],
  clips: [
    {
      id: "card",
      assetId: "capa",
      trackId: "t1",
      start: 0,
      in: 0,
      duration: 4,
      volume: 1,
      annotation: { kind: "card", text: "A Chave do Farol", color: "#121A30" },
    },
    { id: "s1", assetId: "tela", trackId: "t3", start: 4, in: 0, duration: 50, volume: 1 },
    { id: "q", assetId: "quadro", trackId: "t3", start: 54, in: 0, duration: 2, volume: 0 },
    {
      id: "av",
      assetId: "avatar",
      trackId: "t2",
      start: 10,
      in: 0,
      duration: 6,
      volume: 1,
      insertId: "F1P1-D01",
      transform: { x: 0.84, y: 0.545, scale: 0.92, opacity: 1 },
      fadeIn: 0.3,
      fadeOut: 0.3,
    },
    {
      id: "zl",
      assetId: "zoom",
      trackId: "t1",
      start: 20,
      in: 0,
      duration: 4,
      volume: 1,
      zoomLayer: { scale: 1.6, x: 0.5, y: 0.5 },
    },
    {
      id: "b",
      assetId: "balao",
      trackId: "t1",
      start: 30,
      in: 0,
      duration: 3,
      volume: 1,
      annotation: { kind: "balloon", text: "Olha aqui!", color: "#12140A", fontSize: 44 },
      transform: { x: 0.3, y: 0.4, scale: 0.25, opacity: 1 },
      enter: "pop",
    },
    { id: "m", assetId: "musica", trackId: "t4", start: 0, in: 0, duration: 56, volume: 0.35 },
  ],
};

test("a finished lesson becomes a course template of rules, not of clips", () => {
  const t = courseTemplateFrom(lesson, {
    directions: [
      {
        item: 0,
        direction: 'botão "Play" em destaque',
        at: 30.4,
        duration: 3,
        kind: "label",
        x: 0.5,
        y: 0.12,
        style: {},
        from: "safe",
      },
    ],
  });
  assert.equal(t.version, 2);
  assert.equal(t.palette, "sistema-zero");
  assert.equal(t.fonts, true);
  assert.deepEqual(t.cards, { opening: true, closing: false });
  assert.deepEqual(t.avatar?.transform, { x: 0.84, y: 0.545, scale: 0.92 });
  assert.equal(t.avatar?.key?.color, "#0970F6");
  assert.equal(t.cursor?.size, 3.85);
  assert.deepEqual(t.zoom, { auto: true, scale: 1.8 });
  // The track called "Música" is music, lowered while anyone speaks.
  assert.deepEqual(t.music, { volume: 0.35, ducking: true });
  assert.deepEqual(t.cleanup, { minSilence: 1.2, keepPause: 0.5, kinds: { repeat: false } });
  assert.equal(t.annotations?.presets[0].kind, "balloon");
  assert.equal(t.annotations?.presets[0].fontSize, 44);
  assert.ok((t.annotations?.maxPerMinute ?? 0) >= 1);
  assert.deepEqual(t.rules?.find((r) => r.when.event === "click")?.do.zoom, { scale: 1.8 });
  // The lesson has only the inserts: their place is the inserts' own, not the presenter's.
  assert.equal(presenterLayout(t), null);
  assert.deepEqual(presenterLayout(t, "insert"), {
    x: 0.84,
    y: 0.545,
    scale: 0.92,
    fadeIn: 0.3,
    fadeOut: 0.3,
  });
  const rule = directionRules(t)[0];
  assert.equal(rule.when.screenText, "Play");
  assert.equal(rule.do.annotation?.kind, "balloon");
  assert.equal(rule.do.annotation?.x, 0.3);
  // Nothing local goes into it.
  assert.ok(!JSON.stringify(t).includes("C:/privado"));
});

test("the template goes into the editing model's Markdown and comes back out of it", () => {
  const t = courseTemplateFrom(lesson);
  const md = buildEditingTemplate(lesson, [], "Evitar cobrir o personagem.");
  assert.ok(md.includes("modelo de referência v2"));
  assert.ok(md.includes("## Modelo do curso (v2)"));
  assert.deepEqual(parseCourseTemplate(md), t);
  assert.deepEqual(parseCourseTemplate(courseTemplateMarkdown(t)), t);
  assert.deepEqual(parseCourseTemplate(md.replace(/\n/g, "\r\n")), t);
  // Roles a new lesson can recognize; no dash in the copy.
  assert.ok(md.includes('"role": "Camada de zoom, recriável"'));
  assert.ok(md.includes('"role": "Quadro parado da tela, recriável"'));
  assert.ok(md.includes('"role": "Música de fundo, abaixa quando alguém fala"'));
  assert.ok(md.includes('"role": "Apresentador com fundo removido"'));
  assert.ok(!md.includes("Mídia — identificar"));
  assert.match(md, /\| F4 \| Música \| audio \| false \| false \| false \| true \|/);
  assert.ok(!md.includes("C:/privado"));
});

test("a version 1 model is still read as text and has no template to apply", () => {
  const v1 = readFileSync(new URL("../T-ACF.md", import.meta.url), "utf8");
  assert.ok(v1.includes("modelo de referência v1"));
  assert.equal(parseCourseTemplate(v1), null);
  assert.equal(parseCourseTemplate("```json\n{ quebrado\n```"), null);
  assert.equal(
    parseCourseTemplate('```json\n{"ediaula": "ediaula-modelo-do-curso", "version": 3}\n```'),
    null,
  );
  assert.equal(readCourseTemplate({ version: 2 }), null);
});

test("the template's look on a new lesson: presenter, cursor, music and cleanup choices", () => {
  const t: CourseTemplate = courseTemplateFrom(lesson);
  const fresh: Project = {
    ...lesson,
    id: "q",
    palette: undefined,
    cleanup: { kept: ["s:tela:1.000-3.000"] },
    assets: lesson.assets.map((a) => (a.id === "tela" ? { ...a, cursorFx: undefined } : a)),
    tracks: lesson.tracks.map((tr) => ({ ...tr, music: false })),
    clips: lesson.clips.map((c) =>
      c.id === "av"
        ? { ...c, transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1 }, fadeIn: undefined }
        : c.id === "m"
          ? { ...c, volume: 1 }
          : c,
    ),
  };
  const looked = templateLook(fresh, t);
  const avatar = looked.clips.find((c) => c.id === "av");
  assert.deepEqual(avatar?.transform, { x: 0.84, y: 0.545, scale: 0.92, opacity: 1 });
  assert.equal(avatar?.fadeIn, 0.3);
  assert.equal(looked.clips.find((c) => c.id === "m")?.volume, 0.35);
  assert.equal(looked.tracks.find((tr) => tr.id === "t4")?.music, true);
  assert.equal(looked.assets.find((a) => a.id === "tela")?.cursorFx?.size, 3.85);
  // What the person kept in this lesson stays kept.
  assert.deepEqual(looked.cleanup?.kept, ["s:tela:1.000-3.000"]);
  assert.equal(looked.cleanup?.minSilence, 1.2);
  // The palette is drawn apart (it redraws annotations).
  assert.equal(looked.palette, undefined);
});

test("each course keeps its template in a folder named after it, safe on Windows", () => {
  assert.equal(courseFolderName("A Chave do Farol"), "A Chave do Farol");
  assert.equal(courseFolderName('Curso: "1/2" <beta>?'), "Curso 12 beta");
  assert.equal(courseFolderName("  ..  "), "sem curso");
  assert.equal(courseFolderName("CON"), "_CON");
  assert.equal(courseFolderName("Farol. "), "Farol");
  assert.ok(courseFolderName("x".repeat(400)).length <= 120);
});

test("the lesson's presenter and the inserts keep their own places, never on top of each other", () => {
  const presenter = media("apresentador", { name: "Apresentador", origin: "presenter" });
  const both: Project = {
    ...lesson,
    assets: [...lesson.assets, presenter],
    tracks: [
      { id: "t0", kind: "video", name: "Apresentador", muted: false, hidden: false, locked: false },
      ...lesson.tracks,
    ],
    clips: [
      ...lesson.clips,
      {
        id: "pv",
        assetId: "apresentador",
        trackId: "t0",
        start: 4,
        in: 0,
        duration: 50,
        volume: 0,
        transform: { x: 0.2, y: 0.75, scale: 0.4, opacity: 1 },
      },
    ],
  };
  const t = courseTemplateFrom(both);
  assert.deepEqual(presenterLayout(t, "main"), {
    x: 0.2,
    y: 0.75,
    scale: 0.4,
    fadeIn: 0,
    fadeOut: 0,
  });
  assert.equal(presenterLayout(t, "insert")?.x, 0.84);
  const centered = { x: 0.5, y: 0.5, scale: 1, opacity: 1 };
  const fresh: Project = {
    ...both,
    clips: both.clips.map((c) =>
      c.id === "pv" || c.id === "av" ? { ...c, transform: centered } : c,
    ),
  };
  const looked = templateLook(fresh, t);
  assert.equal(looked.clips.find((c) => c.id === "pv")?.transform?.x, 0.2);
  assert.equal(looked.clips.find((c) => c.id === "av")?.transform?.x, 0.84);
  // A template saved before the roles has one place: it goes on the lesson's presenter, and on
  // the inserts only in a lesson without one.
  const old: CourseTemplate = {
    version: 2,
    format: lesson.settings,
    rules: [{ when: { speaker: "avatar" }, do: { layout: { x: 0.8, y: 0.7, scale: 0.5 } } }],
  };
  const oldLook = templateLook(fresh, old);
  assert.equal(oldLook.clips.find((c) => c.id === "pv")?.transform?.x, 0.8);
  assert.deepEqual(oldLook.clips.find((c) => c.id === "av")?.transform, centered);
  const onlyInserts = templateLook(
    { ...fresh, clips: fresh.clips.filter((c) => c.id !== "pv") },
    old,
  );
  assert.equal(onlyInserts.clips.find((c) => c.id === "av")?.transform?.x, 0.8);
  // An insert's place that would cover the presenter on screen keeps the insert where it was.
  const same: CourseTemplate = {
    ...old,
    rules: [
      { when: { speaker: "avatar", role: "main" }, do: { layout: { x: 0.8, y: 0.7, scale: 0.5 } } },
      {
        when: { speaker: "avatar", role: "insert" },
        do: { layout: { x: 0.8, y: 0.7, scale: 0.5 } },
      },
    ],
  };
  const kept = templateLook(fresh, same);
  assert.equal(kept.clips.find((c) => c.id === "pv")?.transform?.x, 0.8);
  assert.deepEqual(kept.clips.find((c) => c.id === "av")?.transform, centered);
  assert.ok(readCourseTemplate(same));
});
