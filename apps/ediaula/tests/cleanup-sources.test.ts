import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import {
  activityRanges,
  normalizeGuidedRun,
  type ScreenMotion,
  sourceActivity,
} from "../src/shared/activity.ts";
import { DEFAULT_KEY } from "../src/shared/chroma.ts";
import {
  analyze,
  applyCuts,
  audibleSilences,
  avatarMedia,
  cutTargets,
  type Issue,
  keptMatcher,
  speechIntervals,
  THINK_PAUSE,
  type TimelineWord,
  timelineSilences,
  timelineWords,
} from "../src/shared/cleanup.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import type { Asset, Clip, Project, Transcript } from "../src/shared/types.ts";

// The cleanup plan of the renderer resolves the app's aliases; here they point at the sources.
const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { cleanupItems, cleanupPlan, keepRejected } = await import(
  "../src/renderer/src/lib/cleanupPlan.ts"
);
hooks.deregister();

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `${id}.${kind === "audio" ? "wav" : "mp4"}`,
  kind,
  duration: 120,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "audio" ? 0 : 30,
  hasVideo: kind !== "audio",
  hasAudio: kind === "audio",
  size: 1,
  proxyStatus: "none",
  ...extra,
});

/** A transcript from [text, start, end] words; the silences are what falls between them. */
function said(words: [string, number, number][], duration = 120): Transcript {
  const silences: [number, number][] = [];
  let at = 0;
  for (const [, s, e] of words) {
    if (s - at >= 0.3) silences.push([at, s]);
    at = Math.max(at, e);
  }
  if (duration - at >= 0.3) silences.push([at, duration]);
  return {
    version: 1,
    model: "m",
    language: "pt",
    duration,
    silences,
    words: words.map(([text, start, end]) => ({ text, start, end, p: 0.9 })),
  };
}

/** Words evenly spread over [from, to). */
function phrase(text: string, from: number, to: number): [string, number, number][] {
  const list = text.split(/\s+/);
  const step = (to - from) / list.length;
  return list.map((t, i) => [t, from + i * step, from + (i + 1) * step - 0.05]);
}

const clip = (
  id: string,
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({
  id,
  assetId,
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
  ...extra,
});

/** A screen recording with its narration, and the Debinha render placed in a pause. */
function lesson(): Project {
  return {
    version: 1,
    id: "p",
    name: "aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("tela", "video", { cursor: "cursor.json", recording: { id: "r", role: "screen" } }),
      asset("voz", "audio", { transcript: "voz.json", transcriptStatus: "ready" }),
      asset("deb", "video", {
        hasAudio: true,
        transcript: "deb.json",
        transcriptStatus: "ready",
        screen: "#0047bb",
        key: { color: "#0047bb", ...DEFAULT_KEY },
      }),
    ],
    tracks: [
      { id: "v2", kind: "video", name: "Avatar", muted: false, hidden: false, locked: false },
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    ],
    clips: [
      clip("cv", "tela", "v1", 0, 40),
      clip("ca", "voz", "a1", 0, 40),
      // Encaixar put the avatar line in the 4 s pause of the narration (10 to 14 s).
      clip("cd", "deb", "v2", 10.2, 3.6, { in: 2, insertId: "F1P1-D01" }),
    ],
  };
}

const narration = said([
  ...phrase("Para acender o farol, o personagem precisa pegar a chave.", 0, 10),
  ...phrase("Olha aqui: eu seguro a seta e ele anda.", 14, 20),
  ...phrase("Agora é a sua vez.", 30, 33),
]);
const debinha = said(phrase("E como eu levo o personagem até a chave?", 2.25, 5.55), 8);
const transcripts = new Map([
  ["voz", narration],
  ["deb", debinha],
]);

/** Cursor data with only what a test gives (version 2). */
const cursorWith = (fields: Record<string, unknown>) => ({
  version: 2,
  width: 1920,
  height: 1080,
  shapes: [],
  moves: [],
  clicks: [],
  wheel: [],
  markers: [],
  keys: [],
  typing: [],
  pauses: [],
  hidden: [],
  gaps: [],
  ...fields,
});

/** The screen stands still everywhere but `moving` (seconds of the video). */
const stillBut = (...moving: [number, number][]): ScreenMotion => {
  const frozen: [number, number][] = [];
  let at = 0;
  for (const [a, b] of moving) {
    if (a > at) frozen.push([at, a]);
    at = b;
  }
  frozen.push([at, 120]);
  return { frozen };
};
const still = stillBut();

const overlaps = (i: { start: number; end: number }, a: number, b: number): boolean =>
  Math.min(i.end, b) - Math.max(i.start, a) > 0.01;
const silencesOf = (issues: Issue[]): Issue[] => issues.filter((i) => i.kind === "silence");

/** The pauses the cleanup would cut in [a, b], with the screen and cursor given. */
function cutsIn(
  p: Project,
  trs: Map<string, Transcript>,
  a: number,
  b: number,
  cursor: Record<string, unknown> = cursorWith({}),
  motion: ScreenMotion | null = still,
): Issue[] {
  const activity = activityRanges(
    p,
    new Map([["tela", cursor]]),
    new Map(),
    new Map([["tela", motion]]),
  );
  return silencesOf(
    analyze(timelineWords(p, trs), audibleSilences(p, { transcripts: trs }), {
      minSilence: 1,
      keepPause: 0.4,
      activity,
    }),
  ).filter((i) => overlaps(i, a, b));
}

test("the avatar placed in a pause of the narration is speech, not a silence to cut", () => {
  const p = lesson();
  const words = timelineWords(p, transcripts);
  const avatar = words.filter((w) => w.role === "avatar");
  assert.equal(avatar.length, 9, "the Debinha words are on the timeline, as the avatar");
  const [from, to] = [avatar[0].start, avatar[avatar.length - 1].end];
  // Before: every source's silences were cut on every track, the avatar line with them.
  const old = silencesOf(analyze(words, timelineSilences(p, transcripts)));
  assert.ok(
    old.some((i) => overlaps(i, from, to)),
    "the old analysis cut the avatar",
  );
  const heard = speechIntervals(p, { transcripts });
  assert.ok(
    heard.some(([a, b]) => a <= from + 1e-6 && b >= to - 1e-6),
    "the avatar is heard",
  );
  assert.deepEqual(cutsIn(p, transcripts, from - 0.2, to + 0.2), [], "nothing cut under it");
  assert.deepEqual(cutsIn(p, transcripts, 10, 14), [], "what is left of the pause is too short");
  // Muting the avatar track makes the pause a pause again.
  const muted = { ...p, tracks: p.tracks.map((t) => (t.id === "v2" ? { ...t, muted: true } : t)) };
  assert.ok(cutsIn(muted, transcripts, 11, 13).length);
});

test("a soft answer inside a silence of the detector is speech", () => {
  // FFmpeg heard nothing from 1.5 to 7 s, but whisper heard the child say "Quatro!" at 4 s.
  const tr: Transcript = {
    version: 1,
    model: "m",
    language: "pt",
    duration: 30,
    silences: [
      [1.5, 7],
      [7.9, 30],
    ],
    words: [
      ...phrase("Quanto é dois mais dois?", 0, 1.5).map(([text, start, end]) => ({
        text,
        start,
        end,
        p: 1,
      })),
      { text: "Quatro!", start: 4, end: 4.5, p: 0.6 },
      { text: "Isso", start: 7, end: 7.4, p: 1 },
      { text: "mesmo.", start: 7.45, end: 7.9, p: 1 },
    ],
  };
  const p = lesson();
  p.clips = p.clips.filter((c) => c.id !== "cd");
  const trs = new Map([["voz", tr]]);
  const cuts = cutsIn(p, trs, 0, 7.5);
  assert.ok(!cuts.some((i) => overlaps(i, 3.9, 4.6)), "Quatro! is never cut");
  // The pause after the question keeps thinking time; after the answer it may be shortened.
  for (const i of cuts) assert.ok(i.start >= 4.5, `only after the answer (${i.start})`);
  // The VAD's stretches count the same way.
  const vad = {
    ...tr,
    words: tr.words.filter((w) => w.text !== "Quatro!"),
    speech: [[3.9, 4.6]] as [number, number][],
  };
  assert.ok(!cutsIn(p, new Map([["voz", vad]]), 0, 7.5).some((i) => overlaps(i, 3.9, 4.6)));
});

test("media heard without a transcript is listened to by its envelope, or counts as speech", () => {
  const p = lesson();
  p.assets.push(asset("cam", "video", { hasAudio: true, waveform: "cam.json" }));
  p.clips.push(clip("cc", "cam", "v1", 40, 10));
  const quiet = Array.from({ length: 1000 }, (_, i) => (i >= 300 && i < 700 ? 0.005 : 0.4));
  const withEnvelope = audibleSilences(p, {
    transcripts,
    envelopes: new Map([["cam", { peaksPerSecond: 100, peaks: quiet }]]),
  });
  assert.ok(withEnvelope.some((s) => Math.abs(s.start - 43) < 0.02 && Math.abs(s.end - 47) < 0.02));
  // Without a transcript or an envelope the whole clip is speech: nothing of it is a pause.
  assert.ok(!audibleSilences(p, { transcripts }).some((s) => overlaps(s, 40, 50)));
});

test("a still screen is the only place a pause is cut: an animation after one click stays", () => {
  const p = lesson();
  // One click at 21 s, then the game animates for 4 s with nobody touching anything.
  const oneClick = cursorWith({ clicks: [[21, 900, 340, 0, 0.1]] });
  // Seeing only the cursor, the end of the animation looked like a pause.
  const cursorOnly = silencesOf(
    analyze(timelineWords(p, transcripts), audibleSilences(p, { transcripts }), {
      minSilence: 1,
      keepPause: 0.4,
      activity: activityRanges(p, new Map([["tela", oneClick]])),
    }),
  ).filter((i) => overlaps(i, 22, 25));
  assert.ok(cursorOnly.length, "the old activity cut the animation");
  const animated = stillBut([21, 25]);
  const cuts = cutsIn(p, transcripts, 20, 30, oneClick, animated);
  assert.ok(!cuts.some((i) => overlaps(i, 20, 25.3)), "the click and the animation stay whole");
  assert.equal(cuts.length, 1, "what is still after it is shortened");
  // Until the screen is analyzed nothing of that recording is cut.
  assert.deepEqual(cutsIn(p, transcripts, 0, 40, oneClick, null), []);
});

test("pointing slowly, typing, scrolling and shortcuts hold a pause", () => {
  const p = lesson();
  // 600 px in 6 s: slow, but the teacher is showing something.
  const slow = cursorWith({
    moves: Array.from({ length: 61 }, (_, i) => [21 + i * 0.1, 300 + i * 10, 400, 0]),
  });
  assert.ok(!cutsIn(p, transcripts, 20, 30, slow).some((i) => overlaps(i, 21, 27)));
  const typing = cursorWith({ typing: [22, 22.5, 23, 23.5, 24, 24.5, 25, 25.5, 26, 26.5, 27] });
  assert.ok(!cutsIn(p, transcripts, 20, 30, typing).some((i) => overlaps(i, 22, 27)));
  const data = normalizeCursorData(
    cursorWith({
      wheel: [
        [10, 0, 0, -120],
        [10.3, 0, 0, -120],
      ],
      keys: [[12, "Ctrl+C"]],
      typing: [14, 14.5],
      moves: [
        [5, 100, 100, 0],
        [5.5, 101, 100, 0],
        [30, 500, 500, 0],
      ],
    }),
  );
  const kinds = sourceActivity(data).map((a) => a.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ["keys", "typing", "wheel"]);
  // A one-pixel bump of the mouse is not a gesture; older files without typing still read.
  assert.deepEqual(normalizeCursorData({ ...data, version: 1, typing: undefined }).typing, []);
  const run = normalizeGuidedRun({
    steps: [
      { moveAt: 1, endAt: 3 },
      { start: 4, end: 6 },
    ],
    holds: [[7, 9]],
    extra: 1,
  });
  assert.deepEqual(run, {
    steps: [
      { start: 1, end: 3 },
      { start: 4, end: 6 },
    ],
    holds: [[7, 9]],
  });
  assert.ok(
    activityRanges(p, new Map(), new Map([["tela", run]])).every((a) => a.kind === "guided"),
  );
});

test("only what is left of a pause around the activity, and long enough, is cut", () => {
  const p = lesson();
  // One click in the middle of the 10 s pause: two still parts long enough to shorten.
  const cut = cutsIn(p, transcripts, 20, 30, cursorWith({ clicks: [[25, 900, 340, 0, 0.1]] }));
  assert.equal(cut.length, 2);
  for (const i of cut) assert.ok(!overlaps(i, 24.4, 25.9), "the click stays");
  // Each part has its own id, from its own seconds in the media.
  assert.notEqual(cut[0].id, cut[1].id);
  for (const i of cut) assert.match(i.id, /^s:voz:\d+\.\d{3}-\d+\.\d{3}$/);
});

/** Timeline words of one speaker (source). */
function words(
  source: string,
  list: [string, number, number][],
  role: TimelineWord["role"] = "teacher",
): TimelineWord[] {
  return list.map(([text, start, end], i) => ({
    key: `${source}:${i}`,
    clipId: source,
    text,
    start,
    end,
    p: 0.9,
    source,
    role,
  }));
}

const repeats = (issues: Issue[]): Issue[] => issues.filter((i) => i.kind === "repeat");
const opts = { minSilence: 1, keepPause: 0.4 };

test('"Clique aqui. [5 s] Clique aqui." is a demonstration, not a repeat', () => {
  const apart = words("voz", [
    ["Clique", 0, 0.4],
    ["aqui,", 0.45, 0.8],
    ["Clique", 5.8, 6.2],
    ["aqui.", 6.25, 6.6],
  ]);
  assert.deepEqual(repeats(analyze(apart, [], opts)), []);
  // Close together it is a restart...
  const close = words("voz", [
    ["Clique", 0, 0.4],
    ["aqui,", 0.45, 0.8],
    ["Clique", 1.6, 2],
    ["aqui", 2.05, 2.4],
    ["no", 2.45, 2.6],
    ["verde.", 2.65, 3],
  ]);
  assert.equal(repeats(analyze(close, [], opts)).length, 1);
  // ...unless something happened on screen between the takes.
  assert.deepEqual(
    repeats(analyze(close, [], { ...opts, activity: [{ start: 0.9, end: 1.5 }] })),
    [],
  );
});

test("short repeats across a full stop, counting and phrases said twice on purpose stay", () => {
  const sentence = words("voz", [
    ["Clique", 0, 0.3],
    ["no", 0.35, 0.45],
    ["verde.", 0.5, 0.9],
    ["Verde", 1.2, 1.5],
    ["é", 1.55, 1.6],
    ["a", 1.65, 1.7],
    ["cor.", 1.75, 2],
  ]);
  assert.deepEqual(repeats(analyze(sentence, [], opts)), []);
  const counting = words("voz", [
    ["um,", 0, 0.3],
    ["dois,", 0.4, 0.7],
    ["três,", 0.8, 1.1],
    ["um,", 1.3, 1.6],
    ["dois,", 1.7, 2],
    ["três!", 2.1, 2.4],
  ]);
  assert.deepEqual(repeats(analyze(counting, [], opts)), []);
  const vamos = words("voz", [
    ["Vamos", 0, 0.3],
    ["lá,", 0.35, 0.6],
    ["vamos", 0.8, 1.1],
    ["lá!", 1.15, 1.4],
  ]);
  assert.deepEqual(repeats(analyze(vamos, [], opts)), []);
  const emphasis = words("voz", [
    ["muito,", 0, 0.3],
    ["muito", 0.35, 0.6],
    ["bom!", 0.65, 0.9],
  ]);
  assert.deepEqual(repeats(analyze(emphasis, [], opts)), []);
  // A false start before a question mark is still a restart.
  const restart = words("voz", [
    ["quem", 0, 0.3],
    ["está?", 0.35, 0.6],
    ["Quem", 0.9, 1.2],
    ["está", 1.25, 1.5],
    ["aqui?", 1.55, 1.9],
  ]);
  assert.equal(repeats(analyze(restart, [], opts)).length, 1);
});

test("the teacher saying the avatar's line again is not a repeat, and the avatar is never cleaned", () => {
  const deb = words(
    "deb",
    [
      ["Ah,", 0, 0.3],
      ["E", 0.5, 0.6],
      ["se", 0.65, 0.8],
      ["eu", 0.85, 1],
      ["clicar", 1.05, 1.4],
      ["em", 1.45, 1.55],
      ["Rodar?", 1.6, 2],
      ["Rodar?", 2.1, 2.5],
    ],
    "avatar",
  );
  const voz = words("voz", [
    ["E", 3, 3.1],
    ["se", 3.15, 3.3],
    ["eu", 3.35, 3.5],
    ["clicar", 3.55, 3.9],
    ["em", 3.95, 4.05],
    ["Rodar?", 4.1, 4.5],
    ["Vamos", 4.6, 4.9],
    ["ver.", 4.95, 5.2],
  ]);
  const all = [...deb, ...voz].sort((a, b) => a.start - b.start);
  assert.deepEqual(analyze(all, [], opts), [], "no repeat across speakers, nothing in the avatar");
});

test("the computer's sound, a muted copy and a presenter are not cleaned as the teacher", () => {
  const sys = words(
    "sys",
    [
      ["Ah,", 2, 2.3],
      ["olá", 2.4, 2.7],
      ["crianças,", 2.8, 3.2],
      ["crianças,", 3.3, 3.7],
    ],
    "other",
  );
  assert.deepEqual(analyze(sys, [], opts), []);
  const voz = words("voz", [
    ["Então,", 0, 0.4],
    ["né,", 0.5, 0.8],
    ["vamos", 1.2, 1.5],
  ]);
  const copy = words("cam", [
    ["Então,", 0.01, 0.41],
    ["né,", 0.51, 0.81],
    ["vamos", 1.21, 1.51],
  ]).map((w) => ({ ...w, silent: true }));
  const issues = analyze(
    [...voz, ...copy].sort((a, b) => a.start - b.start),
    [],
    opts,
  );
  assert.deepEqual(
    issues.map((i) => i.id),
    ["f:voz:1"],
    "the muted copy neither adds a hesitation nor protects one",
  );
  // A voice clip silenced under the presenter's own sound is not heard (the value of today and
  // whatever it is renamed to).
  const under = lesson();
  under.clips = under.clips.map((c) => (c.id === "ca" ? { ...c, mutedFor: "heygen" as const } : c));
  assert.ok(
    timelineWords(under, transcripts)
      .filter((w) => w.source === "voz")
      .every((w) => w.silent),
  );
  // A presenter's media and anything on a solid screen are not the teacher.
  const p = lesson();
  p.assets.push(
    asset("hey", "video", { hasAudio: true, origin: "presenter" }),
    asset("verde", "video", { hasAudio: true, screen: "#00ff00" }),
    asset("narr", "audio", { origin: "presenter", recording: { id: "r", role: "narration" } }),
  );
  assert.deepEqual([...avatarMedia(p)].sort(), ["deb", "hey", "narr", "verde"]);
});

test("a hesitation over another voice or over a drag is not cut", () => {
  const voz = words("voz", [
    ["então,", 0, 0.4],
    ["ahn,", 0.5, 0.9],
    ["vamos", 1.2, 1.5],
  ]);
  const deb = words("deb", [["Oi!", 0.6, 0.9]], "avatar");
  const all = [...voz, ...deb].sort((a, b) => a.start - b.start);
  assert.deepEqual(
    analyze(all, [], opts).filter((i) => i.kind === "filler"),
    [],
  );
  assert.equal(analyze(voz, [], opts).length, 1);
  // "Arraste o bloco, né, até aqui": the "né" falls in the middle of the drag.
  assert.deepEqual(analyze(voz, [], { ...opts, activity: [{ start: 0, end: 3 }] }), []);
});

test("a pause after a question, or where the script asks to wait, keeps thinking time", () => {
  const voz = words("voz", [
    ["Quanto", 0, 0.3],
    ["dá?", 0.35, 0.7],
    ["Oito.", 5.7, 6],
    ["E", 10, 10.1],
    ["agora", 10.15, 10.5],
  ]);
  const pauses: [number, number][] = [
    [0.7, 5.7],
    [6, 10],
  ];
  const issues = analyze(voz, pauses, opts);
  const afterQuestion = issues.find((i) => overlaps(i, 0.7, 5.7));
  assert.ok(afterQuestion);
  assert.ok(Math.abs(afterQuestion.start - 0.7 - THINK_PAUSE / 2) < 1e-6, "2.5 s are left");
  const plain = issues.find((i) => overlaps(i, 6, 10));
  assert.ok(plain && Math.abs(plain.start - 6.2) < 1e-6, "elsewhere a short pause is left");
  const scripted = analyze(voz, pauses, { ...opts, thinking: [[6, 10]] });
  const kept = scripted.find((i) => overlaps(i, 6, 10));
  assert.ok(kept && Math.abs(kept.start - 6 - THINK_PAUSE / 2) < 1e-6);
});

/** A narration with a "né" and two long pauses (the screen analyzed and still). */
function plain(): {
  project: Project;
  transcripts: Map<string, Transcript>;
  screens: Map<string, ScreenMotion>;
} {
  const p = lesson();
  p.clips = p.clips.filter((c) => c.id !== "cd");
  const voz = said([
    ...phrase("Bom dia, pessoal. Né, hoje vamos jogar.", 0, 6),
    ...phrase("Primeiro o farol.", 9, 12),
    ...phrase("Depois a chave.", 16, 19),
  ]);
  return { project: p, transcripts: new Map([["voz", voz]]), screens: new Map([["tela", still]]) };
}

test("what the person kept, in the panel or by leaving it out of a proposal, the AI keeps too", () => {
  const { project, transcripts: trs, screens } = plain();
  const inputs = { transcripts: trs, screens };
  const first = cleanupPlan(project, inputs);
  const filler = first.active.find((i) => i.kind === "filler");
  const pause = first.active.find((i) => i.kind === "silence");
  assert.ok(filler && pause);
  const kept: Project = { ...project, cleanup: { kept: [filler.id] } };
  // The panel, find_cleanup and apply_cleanup all read the plan with the AI's options on top.
  for (const overrides of [{}, { kinds: { filler: true, silence: true } }, { minSilence: 0.5 }]) {
    const plan = cleanupPlan(kept, inputs, overrides);
    assert.ok(plan.keptIds.has(filler.id), "still found, shown as kept");
    assert.ok(!plan.active.some((i) => i.id === filler.id), "never cut");
  }
  // "Limpar a aula" proposes the rest item by item; the person leaves the pause out in the bar.
  let n = 0;
  const items = cleanupItems(kept, cleanupPlan(kept, inputs), () => `pi${n++}`);
  assert.ok(items.every((i) => i.issueId && i.status === "pending" && i.anchors.length > 0));
  const reviewed = items.map((i) =>
    i.issueId === pause.id ? { ...i, status: "rejected" as const } : i,
  );
  const applied = keepRejected(kept, reviewed);
  assert.deepEqual(applied.cleanup?.kept, [filler.id, pause.id]);
  assert.ok(!cleanupPlan(applied, inputs).active.some((i) => i.id === pause.id));
  // Kinds the person turned off stay off; the AI never asks for shorter pauses than the panel.
  const off: Project = { ...project, cleanup: { kept: [], kinds: { silence: false } } };
  assert.ok(!cleanupPlan(off, inputs).active.some((i) => i.kind === "silence"));
  const choosy: Project = { ...project, cleanup: { kept: [], minSilence: 3.5 } };
  assert.equal(cleanupPlan(choosy, inputs, { minSilence: 0.5 }).choices.minSilence, 3.5);
});

test("a kept pause stays kept: after a cut that touches it, a gesture that splits it, a new transcript", () => {
  const { project, transcripts: trs, screens } = plain();
  const inputs = { transcripts: trs, screens };
  const pause = cleanupPlan(project, inputs).issues.find(
    (i) => i.kind === "silence" && overlaps(i, 12, 16),
  );
  assert.ok(pause?.span);
  const kept: Project = { ...project, cleanup: { kept: [pause.id] } };
  const isKept = (p: Project, extra: Partial<typeof inputs> = {}) =>
    cleanupPlan(p, { ...inputs, ...extra }).issues.filter(
      (i) => i.kind === "silence" && overlaps(i, pause.span?.[0] ?? 0, pause.span?.[1] ?? 0),
    );
  // 1. A cut right up to the start of the pause trims it: still the same pause.
  const [a] = pause.span;
  const trimmed = { ...kept, clips: applyCuts(kept.clips, [[a - 0.5, a + 0.5]], cutTargets(kept)) };
  const afterCut = cleanupPlan(trimmed, inputs).issues.filter(
    (i) => i.kind === "silence" && overlaps(i, a - 0.5, a + 3),
  );
  assert.ok(afterCut.length && afterCut.every((i) => keptMatcher(trimmed, [pause.id])(i)));
  // 2. A click in the middle splits it in two: both halves stay kept.
  const split = isKept(kept, {
    cursors: new Map([["tela", cursorWith({ clicks: [[14, 10, 10, 0, 0.1]] })]]),
  });
  assert.equal(split.length, 2);
  assert.ok(split.every(keptMatcher(kept, [pause.id])));
  // 3. The computer's sound transcribed later (silent there): the pause is still the kept one.
  const more: Project = {
    ...kept,
    assets: [...kept.assets, asset("sys", "audio", { recording: { id: "r", role: "system" } })],
    tracks: [
      ...kept.tracks,
      { id: "a2", kind: "audio", name: "PC", muted: false, hidden: false, locked: false },
    ],
    clips: [...kept.clips, clip("cs", "sys", "a2", 0, 40)],
  };
  const sys = said([...phrase("tchau pessoal", 2, 3), ...phrase("até logo", 20, 21)], 40);
  const transcribed = new Map([...trs, ["sys", sys]]);
  const later = cleanupPlan(more, { transcripts: transcribed, screens }).issues.filter(
    (i) => i.kind === "silence" && overlaps(i, 12, 16),
  );
  assert.ok(later.length);
  assert.ok(
    later.every((i) => cleanupPlan(more, { transcripts: transcribed, screens }).keptIds.has(i.id)),
  );
});

test("what the cleanup cannot see is listed, and the voice cleanup's items are not proposed twice", () => {
  const { project, transcripts: trs } = plain();
  project.assets.push(
    asset("cam", "video", { hasAudio: true }),
    asset("mudo", "audio", { transcript: "m.json" }),
  );
  project.tracks.push({
    id: "a3",
    kind: "audio",
    name: "Mudo",
    muted: true,
    hidden: false,
    locked: false,
  });
  project.clips.push(clip("cc", "cam", "v1", 40, 5), clip("cm", "mudo", "a3", 0, 10));
  const inputs = {
    transcripts: new Map([...trs, ["mudo", said([["oi", 1, 1.3]], 10)]]),
    unseen: ["tela"],
  };
  const { blind } = cleanupPlan(project, inputs);
  assert.deepEqual(blind.noCursor, ["cam"]);
  assert.deepEqual(blind.unreadable, ["tela"]);
  assert.deepEqual(blind.noEnvelope, ["cam"]);
  assert.deepEqual(blind.inaudible, ["mudo"]);
  assert.deepEqual(blind.screenPending, ["tela"], "not analyzed: none of its pauses are cut");
  // A pending voice cleanup with the same hesitation: the general one leaves it out.
  const { project: p2, transcripts: t2, screens } = plain();
  const filler = cleanupPlan(p2, { transcripts: t2, screens }).active.find(
    (i) => i.kind === "filler",
  );
  assert.ok(filler);
  const withVoice: Project = {
    ...p2,
    proposals: [
      {
        id: "v",
        projectId: p2.id,
        title: "Limpeza da voz",
        revision: 0,
        createdAt: 0,
        by: "voz",
        items: [
          {
            id: "i",
            start: filler.start,
            end: filler.end,
            reason: "vício",
            anchors: [{ clipId: "ca", assetId: "voz", start: filler.start, end: filler.end }],
            issueId: filler.id,
            status: "pending",
          },
        ],
      },
    ],
  };
  const plan = cleanupPlan(withVoice, { transcripts: t2, screens });
  assert.ok(!plan.active.some((i) => i.id === filler.id));
  assert.equal(plan.elsewhere, 1);
});
