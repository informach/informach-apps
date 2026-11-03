import assert from "node:assert/strict";
import { test } from "node:test";
import { clickEvents, clickMoments, FAST_GAP } from "../src/shared/clickEvents.ts";
import { CURSOR_EFFECT_DEFAULTS, DEFAULT_CURSOR_FX } from "../src/shared/cursor.ts";
import { preflight } from "../src/shared/preflight.ts";
import { findSoundEffect, SOUND_EFFECTS } from "../src/shared/soundEffects.ts";
import {
  CROWD_COUNT,
  crowdedEffects,
  placeOverSpeech,
  placeWithoutRipple,
  safeOverSpeech,
  withClicksTrack,
} from "../src/shared/soundPlacement.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aula/${id}`,
  kind,
  duration: kind === "image" ? 0 : 100,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (
  id: string,
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({ id, assetId, trackId, start, in: 0, duration, volume: 1, ...extra });
const lesson = (assets: Asset[], tracks: Track[], clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks,
  clips,
});

type Press = [number, number, number, number, number];
const press = (t: number, x = 100, y = 100, held = 0.05): Press => [t, x, y, 0, held];
const screen = asset("tela", "video", {
  cursor: "C:/aula/tela-cursor.json",
  cursorFx: { ...DEFAULT_CURSOR_FX, clickSound: true },
});

// ---- Clicks ----

test("clicks: double click, drag and typing are told apart; the kinds asked are the ones heard", () => {
  const data = {
    clicks: [press(1), press(1.3), press(4, 500, 500, 0.8), press(9, 10, 10)],
    typing: [6, 6.5],
  };
  const fx = { ...DEFAULT_CURSOR_FX, clickSound: true };
  assert.deepEqual(
    clickMoments(data, fx).map((m) => [m.t, m.kind]),
    [
      [1, "click"],
      [1.3, "double_click"],
      [4, "drag_start"],
      [9, "click"],
    ],
    "by default: click, double click and the start of a drag",
  );
  assert.deepEqual(
    clickMoments(data, { ...fx, clickInclude: ["drag_end", "typing"] }).map((m) => [m.t, m.kind]),
    [
      [4.8, "drag_end"],
      [6, "typing"],
      [6.5, "typing"],
    ],
  );
  // Off, or with the pointer hidden in a stretch: no sound there.
  assert.deepEqual(clickMoments(data, { ...fx, clickSound: false }), []);
  const hidden = { ...fx, ranges: [{ id: "r", start: 0, end: 2, fx: { hidden: true } }] };
  assert.deepEqual(
    clickMoments(data, hidden).map((m) => m.t),
    [4, 9],
  );
});

test("clicks: they follow cuts and speed; above 2x at most one every 0.15 s", () => {
  // Source 0–10 at 1x from 0; source 20–34 at 7x from 10 (2 s on the timeline).
  const p = lesson(
    [screen],
    [track("v", "video")],
    [clip("a", "tela", "v", 0, 10), clip("b", "tela", "v", 10, 2, { in: 20, speed: 7 })],
  );
  const burst = Array.from({ length: 40 }, (_, i) => press(20 + i * 0.2, i * 50, 0));
  const data = new Map([["tela", { clicks: [press(2), press(15), ...burst], typing: [] }]]);
  const events = clickEvents(p, data);
  // The click of the cut part (source 15) is not heard; source 2 is at 2.
  assert.equal(events[0].at, 2);
  assert.ok(!events.some((e) => e.at > 2 && e.at < 10));
  const fast = events.filter((e) => e.at >= 10);
  // 40 presses in 8 s of source are 40 in 1.14 s at 7x: thinned to one every 0.15 s.
  assert.ok(fast.length < 40 && fast.length >= 7, `${fast.length} clicks at 7x`);
  for (let i = 1; i < fast.length; i++)
    assert.ok(fast[i].at - fast[i - 1].at >= FAST_GAP - 1e-9, "no burst");
  // The first click at 7x lands where the timeline shows it: (20 - 20) / 7 after 10.
  assert.ok(Math.abs(fast[0].at - 10) < 1e-9);
  // Volume and sound come from the recording's settings.
  assert.equal(events[0].sound, "clique");
  assert.equal(events[0].volume, CURSOR_EFFECT_DEFAULTS.clickVolume);
});

test("clicks: set_click_sound's track is added once, at the bottom", () => {
  const p = lesson([screen], [track("v", "video"), track("a", "audio")], []);
  const once = withClicksTrack(p);
  assert.deepEqual(
    once.tracks.map((t) => [t.name, !!t.clicks]),
    [
      ["v", false],
      ["a", false],
      ["Cliques", true],
    ],
  );
  assert.equal(withClicksTrack(once), once);
});

// ---- Library ----

test("library: 15 to 25 sound effects, Portuguese tags, found by id, name or tag", () => {
  assert.ok(SOUND_EFFECTS.length >= 15 && SOUND_EFFECTS.length <= 25, `${SOUND_EFFECTS.length}`);
  for (const s of SOUND_EFFECTS) {
    assert.ok(s.tags.length > 0, `${s.id} has tags`);
    for (const tag of s.tags) assert.equal(tag, tag.toLowerCase(), `${s.id}: ${tag}`);
  }
  assert.equal(new Set(SOUND_EFFECTS.map((s) => s.id)).size, SOUND_EFFECTS.length);
  assert.equal(findSoundEffect("sucesso")?.id, "sucesso");
  assert.equal(findSoundEffect("Comemoração")?.id, "comemoracao");
  assert.equal(findSoundEffect("pop")?.id, "pop");
  assert.equal(findSoundEffect("whoosh")?.group, "woosh");
  assert.equal(findSoundEffect("nada-disso"), undefined);
});

// ---- Placing without ripple ----

const base = (): Project =>
  lesson(
    [asset("tela", "video"), asset("voz", "audio"), asset("ding", "audio", { duration: 1 })],
    [track("v", "video"), track("v2", "video"), track("n", "audio")],
    [
      clip("s", "tela", "v", 0, 100),
      clip("cam", "tela", "v2", 230, 20),
      clip("narr", "voz", "n", 0, 100),
    ],
  );

test("placing: a free place is used; a taken one goes to a free track of the same kind or a new one", () => {
  const p = base();
  const free = placeWithoutRipple(p, p.assets[0], 260, { trackId: "v2", in: 10, out: 15 });
  assert.ok(free.ok);
  assert.equal(free.trackId, "v2");
  assert.equal(free.note, "");
  const placed = free.project.clips.find((c) => c.id === free.clipId);
  assert.deepEqual([placed?.start, placed?.in, placed?.duration], [260, 10, 5]);

  // At 4:00, v2 holds the camera (230–250) and v is free (it ends at 100): it goes to v.
  const taken = placeWithoutRipple(p, p.assets[0], 240, { trackId: "v2", in: 0, out: 5 });
  assert.ok(taken.ok);
  assert.equal(taken.trackId, "v");
  assert.match(taken.note, /estava ocupada/);
  // Every clip that was there is untouched.
  assert.deepEqual(taken.project.clips.slice(0, 3), p.clips);

  // At 0:50 with v2 taken too, both video tracks are: a new one right after the one asked.
  const none = placeWithoutRipple(
    { ...p, clips: [...p.clips, clip("x", "tela", "v2", 40, 20)] },
    p.assets[0],
    50,
    { trackId: "v", in: 0, out: 5 },
  );
  assert.ok(none.ok);
  assert.deepEqual(
    none.project.tracks.map((t) => t.name),
    ["v", "v 2", "v2", "n"],
  );

  // A locked track is never written; a missing id is an error.
  const locked = {
    ...p,
    tracks: p.tracks.map((t) => (t.id === "v2" ? { ...t, locked: true } : t)),
  };
  const refused = placeWithoutRipple(locked, p.assets[0], 260, { trackId: "v2" });
  assert.equal(refused.ok, false);
  assert.equal(placeWithoutRipple(p, p.assets[0], 0, { trackId: "x" }).ok, false);
  assert.equal(placeWithoutRipple(p, p.assets[0], 0, { in: 5, out: 5 }).ok, false);
});

test("placing: without a track, a sound goes to the sound effects track and a picture on top", () => {
  const p = base();
  const sound = placeWithoutRipple(p, p.assets[2], 10);
  assert.ok(sound.ok);
  const fx = sound.project.tracks.find((t) => t.id === sound.trackId);
  assert.equal(fx?.name, "Efeitos sonoros");
  assert.equal(fx?.sfx, true);
  // The next one at the same time takes another effects track; elsewhere, the same one.
  const again = placeWithoutRipple(sound.project, p.assets[2], 10.5);
  assert.ok(again.ok);
  assert.notEqual(again.trackId, sound.trackId);
  const later = placeWithoutRipple(sound.project, p.assets[2], 20);
  assert.ok(later.ok);
  assert.equal(later.trackId, sound.trackId);
  const picture = placeWithoutRipple(p, p.assets[0], 10, { in: 0, out: 3 });
  assert.ok(picture.ok);
  assert.equal(picture.project.tracks[0].id, picture.trackId);
});

test("placing: a sound effect over speech for more than 0.3 s is lowered to 30%", () => {
  const speech: [number, number][] = [
    [0, 10],
    [12, 20],
  ];
  assert.deepEqual(safeOverSpeech(speech, 10.2, 11.5, 0.8), { volume: 0.8, lowered: false });
  assert.deepEqual(safeOverSpeech(speech, 9.8, 11, 0.8), { volume: 0.8, lowered: false });
  assert.deepEqual(safeOverSpeech(speech, 5, 6, 0.8), { volume: 0.3, lowered: true });
  assert.deepEqual(safeOverSpeech(speech, 5, 6, 0.25), { volume: 0.25, lowered: false });
  const p = base();
  const over = placeOverSpeech(p, p.assets[2], 5, { volume: 0.8 }, speech, true);
  assert.ok(over.ok && over.lowered);
  assert.equal(over.project.clips.find((c) => c.id === over.clipId)?.volume, 0.3);
  // Music or a voice placed by hand on a track of its own is not an effect: left as asked.
  const voice = placeOverSpeech(p, p.assets[1], 120, { volume: 0.8, trackId: "n" }, speech);
  assert.ok(voice.ok && !voice.lowered);
});

test("check_before_export: more than 3 effects in 2 s are flagged; the clicks are not counted", () => {
  const sfx = track("fx", "audio", { name: "Efeitos sonoros", sfx: true });
  const effects = [10, 10.5, 11, 11.8].map((at, i) => clip(`e${i}`, "ding", "fx", at, 0.5));
  const p = lesson(
    [asset("ding", "audio", { duration: 1 }), asset("voz", "audio")],
    [track("n", "audio"), sfx, track("k", "audio", { clicks: true })],
    [clip("narr", "voz", "n", 0, 60), ...effects],
  );
  assert.deepEqual(crowdedEffects(p), [{ start: 10, count: CROWD_COUNT + 1 }]);
  assert.ok(preflight(p).some((f) => f.kind === "sfx-crowded" && f.at === 10));
  const spread = { ...p, clips: p.clips.filter((c) => c.id !== "e3") };
  assert.deepEqual(crowdedEffects(spread), []);
  assert.ok(!preflight(spread).some((f) => f.kind === "sfx-crowded"));
});

// ---- get_frame and the crop ----

test("get_frame: the boxes are the part left after the crop, around the same center", async () => {
  const { frameFacts } = await import("../src/shared/frameGrab.ts");
  const avatar = asset("avatar", "video", { key: { color: "#00FF00" } as Asset["key"] });
  const at = { x: 0.8, y: 0.6, scale: 0.5, opacity: 1 };
  const p = (crop?: { left: number; top: number; right: number; bottom: number }) =>
    lesson(
      [avatar],
      [track("f4", "video")],
      [clip("av", "avatar", "f4", 0, 10, { transform: { ...at, ...(crop ? { crop } : {}) } })],
    );
  const whole = frameFacts(p(), 1).overlays[0];
  const cut = frameFacts(p({ left: 0.02, top: 0, right: 0.02, bottom: 0 }), 1).overlays[0];
  assert.equal(whole.crop, undefined);
  assert.deepEqual(cut.crop, { left: 0.02, top: 0, right: 0.02, bottom: 0 });
  // 2% of the picture off each side: the box is 96% as wide, as high as before.
  assert.ok(Math.abs(cut.box.width - whole.box.width * 0.96) < 0.002);
  assert.equal(cut.box.height, whole.box.height);
  const center = (b: { x: number; width: number }) => b.x + b.width / 2;
  assert.ok(Math.abs(center(cut.box) - center(whole.box)) < 0.002, "same center");
});
