import assert from "node:assert/strict";
import { test } from "node:test";
import { lapseChoice, maxSpace, setLapse } from "../src/shared/timelapse.ts";
import { clipEnd } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, kind: "video" | "audio", name = id): Track => ({
  id,
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});

const asset = (id: string, kind: "video" | "audio", extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/g/${id}`,
  kind,
  duration: 300,
  width: kind === "video" ? 1920 : 0,
  height: kind === "video" ? 1080 : 0,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind === "video",
  hasAudio: kind === "audio",
  size: 1,
  proxyStatus: "none",
  ...extra,
});

/**
 * The voice plays 0..40; the screen goes 0..15 at normal speed, then 185 s recorded with the voice
 * held go under the line from 15 to 20 (37×), then the screen follows the voice from 20.
 */
function lesson(): Project {
  const clips: Clip[] = [
    { id: "s1", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 15, volume: 1 },
    {
      id: "lapse",
      assetId: "tela",
      trackId: "v1",
      start: 15,
      in: 15,
      duration: 5,
      volume: 1,
      speed: 37,
      timelapse: { under: 5, source: 185 },
    },
    { id: "s2", assetId: "tela", trackId: "v1", start: 20, in: 200, duration: 20, volume: 1 },
    { id: "voz", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 40, volume: 1 },
  ];
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("tela", "video", { recording: { id: "take", role: "screen" } }),
      asset("voz", "audio", { recording: { id: "voz", role: "mic" } }),
    ],
    tracks: [track("v1", "video"), track("a1", "audio", "Voz")],
    clips,
  };
}

const at = (clips: Clip[], id: string): [number, number, number | undefined] => {
  const c = clips.find((x) => x.id === id);
  assert.ok(c);
  return [Math.round(c.start * 1000) / 1000, Math.round(clipEnd(c) * 1000) / 1000, c.speed];
};

test("abrir espaço na voz: a voz espera depois da fala e a tela passa mais devagar", () => {
  const p = lesson();
  const clips = setLapse(p, "lapse", { kind: "space", seconds: 8 });
  assert.ok(clips);
  // The stretch lasts the line plus the room, 185 s in 13 s.
  assert.deepEqual(at(clips, "lapse"), [15, 28, 14.2308]);
  assert.deepEqual(clips.find((c) => c.id === "lapse")?.timelapse, {
    under: 5,
    source: 185,
    space: 8,
  });
  // The rest of the screen and the voice after the line move 8 s on; the voice is split there.
  assert.deepEqual(at(clips, "s2"), [28, 48, undefined]);
  const voice = clips.filter((c) => c.trackId === "a1").map((c) => [c.start, clipEnd(c)]);
  assert.deepEqual(voice, [
    [0, 20],
    [28, 48],
  ]);
  // Back to under the line: the room closes and everything returns.
  const back = setLapse({ ...p, clips }, "lapse", { kind: "under" });
  assert.ok(back);
  assert.deepEqual(at(back, "lapse"), [15, 20, 37]);
  assert.deepEqual(at(back, "s2"), [20, 40, undefined]);
  assert.deepEqual(
    back.filter((c) => c.trackId === "a1").map((c) => [c.start, clipEnd(c)]),
    [
      [0, 20],
      [20, 40],
    ],
  );
});

test("cortar o tempo extra: fica o que foi gravado durante a fala, na velocidade normal", () => {
  const p = lesson();
  const cut = setLapse(p, "lapse", { kind: "cut" });
  assert.ok(cut);
  const c = cut.find((x) => x.id === "lapse");
  assert.deepEqual(at(cut, "lapse"), [15, 20, undefined]);
  assert.equal(c?.in, 15);
  assert.deepEqual(c?.timelapse && lapseChoice(c.timelapse), { kind: "cut" });
  assert.deepEqual(at(cut, "s2"), [20, 40, undefined]);
});

test("o espaço nunca deixa a tela mais lenta que a gravada, e faixa travada não muda", () => {
  const p = lesson();
  const most = setLapse(p, "lapse", { kind: "space", seconds: 999 });
  assert.ok(most);
  assert.deepEqual(at(most, "lapse"), [15, 200, undefined]);
  assert.equal(maxSpace({ under: 5, source: 185 }), 180);
  const locked = {
    ...p,
    tracks: p.tracks.map((t) => (t.id === "v1" ? { ...t, locked: true } : t)),
  };
  assert.equal(setLapse(locked, "lapse", { kind: "cut" }), null);
  assert.equal(setLapse(p, "s1", { kind: "cut" }), null);
});
