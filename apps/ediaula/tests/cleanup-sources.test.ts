import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { activityRanges, normalizeGuidedRun, sourceActivity } from "../src/shared/activity.ts";
import { DEFAULT_KEY } from "../src/shared/chroma.ts";
import {
  analyze,
  applyCuts,
  audibleSilences,
  cutTargets,
  type Issue,
  speechIntervals,
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
const { cleanupItems, cleanupPlan } = await import("../src/renderer/src/lib/cleanupPlan.ts");
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

/** Clicks every 1.5 s of the silent demonstration (20 to 30 s), one of them a drag. */
const cursor = {
  version: 2,
  width: 1920,
  height: 1080,
  shapes: [],
  moves: [
    [21.5, 400, 300, 0],
    [22, 405, 300, 0],
    [22.6, 700, 320, 0],
    [23, 900, 340, 0],
  ],
  clicks: [
    [20.5, 400, 300, 0, 0.1],
    [22, 405, 300, 0, 1.2],
    [23.9, 900, 340, 0, 0.1],
    [25.4, 950, 340, 0, 0.1],
    [26.9, 950, 360, 0, 0.1],
    [28.4, 960, 360, 0, 0.1],
    [29.9, 960, 360, 0, 0.1],
  ],
  wheel: [],
  markers: [],
  keys: [],
  pauses: [],
  hidden: [],
  gaps: [],
};

const overlaps = (i: { start: number; end: number }, a: number, b: number): boolean =>
  Math.min(i.end, b) - Math.max(i.start, a) > 0.01;
const silencesOf = (issues: Issue[]): Issue[] => issues.filter((i) => i.kind === "silence");

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
  const sources = { transcripts };
  const heard = speechIntervals(p, sources);
  assert.ok(
    heard.some(([a, b]) => a <= from + 1e-6 && b >= to - 1e-6),
    "the avatar is heard",
  );
  const now = silencesOf(analyze(words, audibleSilences(p, sources)));
  assert.ok(!now.some((i) => overlaps(i, from - 0.2, to + 0.2)), "nothing cut under the avatar");
  // What is left of the narration's pause around the avatar is too short to cut.
  assert.ok(!now.some((i) => overlaps(i, 10, 14)));
  // Muting the avatar track makes the pause a pause again.
  const muted = { ...p, tracks: p.tracks.map((t) => (t.id === "v2" ? { ...t, muted: true } : t)) };
  assert.ok(
    silencesOf(analyze(words, audibleSilences(muted, sources))).some((i) => overlaps(i, 11, 13)),
  );
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

test("a silent demonstration with clicks stays whole", () => {
  const p = lesson();
  const words = timelineWords(p, transcripts);
  const silences = audibleSilences(p, { transcripts });
  const demo = silences.find((s) => s.start >= 19.9 && s.end <= 30.1);
  assert.ok(demo, "the 10 s without speech is a pause");
  const blind = silencesOf(analyze(words, silences));
  assert.ok(
    blind.some((i) => overlaps(i, 20, 30)),
    "without the cursor it would be cut",
  );
  const activity = activityRanges(p, new Map([["tela", cursor]]));
  assert.ok(
    activity.some((a) => a.kind === "drag"),
    "the press that moves is a drag",
  );
  const issues = analyze(words, silences, { minSilence: 1, keepPause: 0.4, activity });
  assert.deepEqual(
    silencesOf(issues).filter((i) => overlaps(i, 20, 30)),
    [],
    "the demonstration is not cut",
  );
  // A version 1 cursor file is read the same way.
  const v1 = { version: 1, width: 1920, height: 1080, moves: cursor.moves, clicks: cursor.clicks };
  assert.deepEqual(activityRanges(p, new Map([["tela", v1]])), activity);
});

test("only what is left of a pause around the activity, and long enough, is cut", () => {
  const p = lesson();
  const words = timelineWords(p, transcripts);
  // One click in the middle of the 10 s pause: two still parts long enough to shorten.
  const one = { ...cursor, clicks: [[25, 900, 340, 0, 0.1]], moves: [] };
  const activity = activityRanges(p, new Map([["tela", one]]));
  const cut = silencesOf(
    analyze(words, audibleSilences(p, { transcripts }), {
      minSilence: 1,
      keepPause: 0.4,
      activity,
    }),
  ).filter((i) => overlaps(i, 20, 30));
  assert.equal(cut.length, 2);
  for (const i of cut) assert.ok(!overlaps(i, 24.4, 25.9), "the click stays");
  assert.notEqual(cut[0].id, cut[1].id);
});

test("wheel, keys, wide moves and guided steps are activity too", () => {
  const data = normalizeCursorData({
    ...cursor,
    clicks: [],
    moves: [
      [5, 100, 100, 0],
      [5.5, 200, 100, 0],
      [6, 500, 100, 0],
      [50, 500, 100, 0],
      [55, 520, 100, 0],
    ],
    wheel: [
      [10, 0, 0, -120],
      [10.3, 0, 0, -120],
    ],
    keys: [[12, "Ctrl+C"]],
  });
  const kinds = sourceActivity(data).map((a) => a.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ["keys", "move", "wheel"]);
  // A slow drift across the screen is not a gesture.
  assert.ok(!sourceActivity(data).some((a) => a.kind === "move" && a.start > 40));
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
  const p = lesson();
  assert.ok(
    activityRanges(p, new Map(), new Map([["tela", run]])).every((a) => a.kind === "guided"),
  );
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

test('"Clique aqui. [5 s] Clique aqui." is a demonstration, not a repeat', () => {
  const opts = { minSilence: 1, keepPause: 0.4 };
  const apart = words("voz", [
    ["Clique", 0, 0.4],
    ["aqui.", 0.45, 0.8],
    ["Clique", 5.8, 6.2],
    ["aqui.", 6.25, 6.6],
  ]);
  assert.deepEqual(repeats(analyze(apart, [], opts)), []);
  // Close together it is a restart...
  const close = words("voz", [
    ["Clique", 0, 0.4],
    ["aqui.", 0.45, 0.8],
    ["Clique", 1.6, 2],
    ["aqui.", 2.05, 2.4],
  ]);
  assert.equal(repeats(analyze(close, [], opts)).length, 1);
  // ...unless something happened on screen between the takes.
  const activity = [{ start: 0.9, end: 1.5 }];
  assert.deepEqual(repeats(analyze(close, [], { ...opts, activity })), []);
  // Emphasis said on purpose stays.
  const emphasis = words("voz", [
    ["muito,", 0, 0.3],
    ["muito", 0.35, 0.6],
    ["bom!", 0.65, 0.9],
  ]);
  assert.deepEqual(repeats(analyze(emphasis, [], opts)), []);
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
  const issues = analyze(all, [], { minSilence: 1, keepPause: 0.4 });
  assert.deepEqual(issues, [], "no repeat across speakers, no filler or repeat in the avatar");
});

test("a hesitation over another voice is not cut", () => {
  const voz = words("voz", [
    ["então,", 0, 0.4],
    ["ahn,", 0.5, 0.9],
    ["vamos", 1.2, 1.5],
  ]);
  const deb = words("deb", [["Oi!", 0.6, 0.9]], "avatar");
  const all = [...voz, ...deb].sort((a, b) => a.start - b.start);
  assert.deepEqual(
    analyze(all, [], { minSilence: 1, keepPause: 0.4 }).filter((i) => i.kind === "filler"),
    [],
  );
  assert.equal(analyze(voz, [], { minSilence: 1, keepPause: 0.4 }).length, 1);
});

/** A narration with a "né" and two long pauses (no avatar, no cursor). */
function plain(): { project: Project; transcripts: Map<string, Transcript> } {
  const p = lesson();
  p.clips = p.clips.filter((c) => c.id !== "cd");
  const voz = said([
    ...phrase("Bom dia, pessoal. Né, hoje vamos jogar.", 0, 6),
    ...phrase("Primeiro o farol.", 9, 12),
    ...phrase("Depois a chave.", 16, 19),
  ]);
  return { project: p, transcripts: new Map([["voz", voz]]) };
}

test("what the person kept in the panel is kept by the AI too", () => {
  const { project, transcripts: trs } = plain();
  const first = cleanupPlan(project, { transcripts: trs });
  const filler = first.active.find((i) => i.kind === "filler");
  const pause = first.active.find((i) => i.kind === "silence");
  assert.ok(filler && pause);
  const kept: Project = { ...project, cleanup: { kept: [filler.id, pause.id] } };
  // The panel, find_cleanup and apply_cleanup all read the plan with the AI's options on top.
  for (const overrides of [{}, { kinds: { filler: true, silence: true } }, { minSilence: 0.5 }]) {
    const plan = cleanupPlan(kept, { transcripts: trs }, overrides);
    assert.ok(
      plan.issues.some((i) => i.id === filler.id),
      "still found",
    );
    assert.ok(!plan.active.some((i) => i.id === filler.id || i.id === pause.id), "never cut");
  }
  // "Limpar a aula" proposes the rest, item by item, anchored in the media.
  let n = 0;
  const items = cleanupItems(kept, cleanupPlan(kept, { transcripts: trs }), () => `pi${n++}`);
  assert.ok(items.length > 0);
  assert.ok(!items.some((i) => i.wordKeys?.includes(filler.words[0])));
  assert.ok(items.every((i) => i.status === "pending" && i.anchors.length > 0));
  // Kinds the person turned off stay off for the AI unless it asks for them in that call.
  const off: Project = { ...project, cleanup: { kept: [], kinds: { silence: false } } };
  assert.ok(!cleanupPlan(off, { transcripts: trs }).active.some((i) => i.kind === "silence"));
});

test("a pause keeps its id after another cut", () => {
  const { project, transcripts: trs } = plain();
  const before = cleanupPlan(project, { transcripts: trs });
  const pauses = before.issues.filter((i) => i.kind === "silence");
  assert.ok(pauses.length >= 2);
  assert.ok(
    pauses.every((i) => /^s:voz:\d+\.\d{3}$/.test(i.id)),
    "anchored in the media",
  );
  const filler = before.issues.find((i) => i.kind === "filler");
  assert.ok(filler);
  // Cut the hesitation (before both pauses): everything after it moves left.
  const cut = {
    ...project,
    clips: applyCuts(project.clips, [[filler.start, filler.end]], cutTargets(project)),
  };
  const after = cleanupPlan(cut, { transcripts: trs }).issues.filter((i) => i.kind === "silence");
  assert.deepEqual(
    after.map((i) => i.id),
    pauses.map((i) => i.id),
  );
  const shift = filler.end - filler.start;
  after.forEach((i, k) => {
    assert.ok(Math.abs(pauses[k].start - shift - i.start) < 1e-6, "same pause, moved left");
  });
});
