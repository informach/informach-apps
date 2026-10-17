import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts, rippleDeleteRange } from "../src/shared/cleanup.ts";
import { transformAt } from "../src/shared/keyframes.ts";
import { piece } from "../src/shared/pieces.ts";
import {
  adjacency,
  clipEnd,
  overwriteRange,
  sourceAt,
  sourceEnd,
  splitAt,
  trimClip,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";
import { editZoomsIn, type Zoom, zoomAt, zoomsIn } from "../src/shared/zoom.ts";
import { editLayer, zoomsOver } from "../src/shared/zoomLayer.ts";

const zoom = (id: string, start: number, end: number): Zoom => ({
  id,
  start,
  end,
  scale: 1.8,
  focus: [
    { t: start + 0.2, x: 0.3, y: 0.4 },
    { t: end - 0.2, x: 0.7, y: 0.6 },
  ],
});

const screen: Asset = {
  id: "screen",
  name: "Tela",
  path: "C:/aulas/tela.mp4",
  kind: "video",
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 10,
  proxyStatus: "none",
  zooms: [
    zoom("z1", 11, 14),
    zoom("z2", 15, 17.5),
    zoom("z3", 19, 23),
    zoom("z4", 26, 28),
    zoom("z5", 31, 35),
    zoom("z6", 37, 39.5),
  ],
};

/** A recording played at 1.5×, moving, fading in and out, after a dissolve. */
const recording: Clip = {
  id: "rec",
  assetId: "screen",
  trackId: "v",
  start: 5,
  in: 10,
  duration: 20,
  speed: 1.5,
  volume: 1,
  fadeIn: 0.5,
  enter: "pop",
  fadeOut: 0.4,
  exit: "fade",
  transition: { kind: "dissolve", duration: 0.6 },
  keyframes: [
    { t: 0, x: 0.2, y: 0.5, scale: 1 },
    { t: 4, x: 0.6, y: 0.4, scale: 1.2 },
    { t: 9, x: 0.4, y: 0.6, scale: 0.8 },
    { t: 15, x: 0.5, y: 0.5, scale: 1 },
    { t: 20, x: 0.8, y: 0.3, scale: 1.4 },
  ],
};

const near = (a: number, b: number, what: string): void => {
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} ≈ ${b}`);
};

const sorted = (clips: Clip[]): Clip[] => [...clips].sort((a, b) => a.start - b.start);

/** What a clip shows at timeline time t: its movement and the media's zoom there. */
function sameMoment(a: Clip, ta: number, b: Clip, tb: number, what: string): void {
  const ma = transformAt(a, ta);
  const mb = transformAt(b, tb);
  near(ma.x, mb.x, `${what} x`);
  near(ma.y, mb.y, `${what} y`);
  near(ma.scale, mb.scale, `${what} scale`);
  const za = zoomAt(zoomsIn(screen.zooms, a.in, sourceEnd(a)), sourceAt(a, ta));
  const zb = zoomAt(screen.zooms, sourceAt(b, tb));
  near(za.scale, zb.scale, `${what} zoom`);
  near(za.cx, zb.cx, `${what} zoom x`);
  near(za.cy, zb.cy, `${what} zoom y`);
}

test("pieces keep the movement and show the media's zooms of the original at every moment", () => {
  const all = sorted(
    [9, 14.5, 20.25].reduce<Clip[]>((clips, t) => splitAt(clips, t, new Set()), [recording]),
  );
  assert.equal(all.length, 4);
  for (const p of all) {
    for (let t = p.start; t < clipEnd(p); t += 0.125) sameMoment(p, t, recording, t, `at ${t}`);
    assert.equal(p.keyframes?.length, 5, "every piece keeps the whole movement");
    assert.ok(!("zooms" in p), "zooms stay on the media");
  }
});

test("a cut through the middle leaves the entrance on the first piece and the exit on the last", () => {
  const all = sorted(
    [9, 14.5, 20.25].reduce<Clip[]>((clips, t) => splitAt(clips, t, new Set()), [recording]),
  );
  const [first, ...rest] = all;
  const last = all[all.length - 1];
  assert.equal(first.id, "rec");
  assert.deepEqual(first.transition, recording.transition);
  assert.deepEqual([first.fadeIn, first.enter], [0.5, "pop"]);
  assert.deepEqual([last.fadeOut, last.exit], [0.4, "fade"]);
  for (const p of rest)
    assert.ok(!("transition" in p) && !("fadeIn" in p) && !("enter" in p), "no inner entrance");
  for (const p of all.slice(0, -1)) assert.ok(!("fadeOut" in p) && !("exit" in p), "no inner exit");
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
});

test("text cuts in the middle of an avatar with dissolves leave one fade in and one fade out", () => {
  const avatar: Clip = {
    id: "avatar",
    assetId: "heygen",
    trackId: "a",
    start: 0,
    in: 0,
    duration: 60,
    volume: 1,
    fadeIn: 0.3,
    fadeOut: 0.3,
  };
  const out = sorted(
    applyCuts(
      [avatar],
      [
        [10, 12],
        [20, 21.5],
        [40, 44],
      ],
      new Set(["a"]),
    ),
  );
  assert.deepEqual(
    out.map((c) => [c.fadeIn ?? 0, c.fadeOut ?? 0]),
    [
      [0.3, 0],
      [0, 0],
      [0, 0],
      [0, 0.3],
    ],
  );
});

test("cutting a head or a tail keeps the transition, fades and motion of that edge", () => {
  // A|B with a dissolve into B; the cleanup removes the silence around the cut, 9.4 to 10.6 s.
  const a: Clip = { id: "A", assetId: "x", trackId: "v", start: 0, in: 0, duration: 10, volume: 1 };
  const b: Clip = {
    id: "B",
    assetId: "y",
    trackId: "v",
    start: 10,
    in: 0,
    duration: 10,
    volume: 1,
    transition: { kind: "dissolve", duration: 0.6 },
  };
  const out = rippleDeleteRange([a, b], 9.4, 10.6, new Set(["v"]));
  const kept = out.find((c) => c.assetId === "y");
  assert.equal(kept?.id, "B");
  assert.deepEqual(kept?.transition, b.transition, "the dissolve stays on the cut");
  assert.equal(adjacency(out).get("B")?.id, "A", "and the two clips still touch");
  // An avatar whose head and tail are cut keeps coming in and going out the same way.
  const avatar: Clip = {
    id: "avatar",
    assetId: "heygen",
    trackId: "a",
    start: 0,
    in: 0,
    duration: 30,
    volume: 1,
    fadeIn: 0.3,
    enter: "slide-up",
    fadeOut: 0.3,
    exit: "fade",
  };
  const trimmed = applyCuts(
    [avatar],
    [
      [0, 2],
      [27, 30],
    ],
    new Set(["a"]),
  );
  assert.equal(trimmed.length, 1);
  assert.deepEqual(
    [trimmed[0].fadeIn, trimmed[0].enter, trimmed[0].fadeOut, trimmed[0].exit],
    [0.3, "slide-up", 0.3, "fade"],
  );
  // Placing a clip over the head keeps the clip, its id and its entrance.
  const covered = overwriteRange([recording], "v", 0, 7);
  assert.equal(covered.length, 1);
  assert.deepEqual(
    [covered[0].id, covered[0].start, covered[0].transition?.kind, covered[0].fadeIn],
    ["rec", 7, "dissolve", 0.5],
  );
});

test("trimming a clip short and back out brings its movement and zooms back", () => {
  const clip: Clip = {
    id: "c",
    assetId: "screen",
    trackId: "v",
    start: 0,
    in: 0,
    duration: 20,
    volume: 1,
    keyframes: [
      { t: 0, x: 0.2, y: 0.5, scale: 1 },
      { t: 10, x: 0.6, y: 0.5, scale: 1 },
      { t: 20, x: 0.9, y: 0.5, scale: 1 },
    ],
  };
  const media = { ...screen, zooms: [zoom("cut", 8, 10), zoom("late", 15, 18)] };
  const short = trimClip(clip, "end", 8, media);
  assert.equal(zoomsIn(media.zooms, short.in, sourceEnd(short)).length, 0);
  const back = trimClip(short, "end", 20, media);
  assert.deepEqual(back, clip);
  assert.deepEqual(
    zoomsIn(media.zooms, back.in, sourceEnd(back)).map((z) => z.id),
    ["cut", "late"],
  );
  // The same through a cleanup cut of the tail, and through a cut in the middle undone by
  // dragging the start of what is left back over the removed stretch.
  const cut = applyCuts([clip], [[8, 20]], new Set(["v"]));
  assert.deepEqual(trimClip(cut[0], "end", 20, media), clip);
  const [, right] = sorted(applyCuts([clip], [[5, 12]], new Set(["v"])));
  assert.equal(zoomsIn(media.zooms, right.in, sourceEnd(right)).length, 1, "only the late one");
  const restored = trimClip(right, "start", 0, media);
  assert.equal(restored.in, 7, "back over the removed stretch, as far as the timeline allows");
  for (let t = 0; t < clipEnd(restored); t += 0.25)
    near(transformAt(restored, t).x, transformAt(clip, t + 7).x, `x at ${t}`);
  assert.deepEqual(
    zoomsIn(media.zooms, restored.in, sourceEnd(restored)).map((z) => z.id),
    ["cut", "late"],
  );
});

test("a zoom taken out of a clip does not come back when the clip is made longer", () => {
  const clip: Clip = {
    id: "c",
    assetId: "screen",
    trackId: "v",
    start: 0,
    in: 0,
    duration: 10,
    volume: 1,
  };
  const before = [zoom("early", 2, 4), zoom("late", 15, 18)];
  const after = editZoomsIn(before, clip.in, sourceEnd(clip), (inside) =>
    inside.filter((z) => z.id !== "early"),
  );
  assert.deepEqual(
    after?.map((z) => z.id),
    ["late"],
    "only the clip's zooms are edited",
  );
  const longer = trimClip(clip, "end", 20, { ...screen, zooms: after });
  assert.deepEqual(
    zoomsIn(after, longer.in, sourceEnd(longer)).map((z) => z.id),
    ["late"],
  );
});

const tracks = [
  { id: "z", kind: "video" as const, name: "Zoom", muted: false, hidden: false, locked: false },
  { id: "v", kind: "video" as const, name: "Aula", muted: false, hidden: false, locked: false },
];
const layer: Clip = {
  id: "layer",
  assetId: "fx",
  trackId: "z",
  start: 2,
  in: 0,
  duration: 6,
  volume: 0,
  zoomLayer: { scale: 2, x: 0.3, y: 0.4, zoomIn: true, zoomOut: true, easeIn: 0.6, easeOut: 0.6 },
};

function sameViews(cut: Clip[], what: string): void {
  const whole: Pick<Project, "clips" | "tracks"> = { tracks, clips: [layer] };
  for (let t = 1.5; t < 8.5; t += 0.02) {
    const a = zoomsOver({ tracks, clips: cut }, 1, t);
    const b = zoomsOver(whole, 1, t);
    assert.equal(a.length, b.length, `${what}: views at ${t}`);
    a.forEach((v, i) => {
      near(v.scale, b[i].scale, `${what}: scale at ${t}`);
      near(v.cx, b[i].cx, `${what}: x at ${t}`);
      near(v.cy, b[i].cy, `${what}: y at ${t}`);
    });
  }
}

test("a zoom layer cut anywhere keeps the same view and the same pace", () => {
  sameViews(splitAt([layer], 5, new Set()), "cut in the middle");
  // Pieces shorter than twice the ease, cut inside the way in and inside the way out.
  const short = [2.3, 2.8, 7.3, 7.6].reduce<Clip[]>(
    (clips, t) => splitAt(clips, t, new Set()),
    [layer],
  );
  assert.equal(short.length, 5);
  sameViews(short, "short pieces");
});

test("a zoom layer whose head is cut away still zooms in from its new start", () => {
  const [cut] = overwriteRange([layer], "z", 0, 4);
  assert.equal(cut.start, 4);
  const view = (t: number) => zoomsOver({ tracks, clips: [cut] }, 1, t)[0];
  assert.ok(view(4.1).scale < 1.5, "starts out near normal");
  near(view(4.7).scale, 2, "reaches the zoom after the ease");
  // A piece starting already zoomed (a cut in the middle) stays so when its start is trimmed.
  const [, right] = sorted(splitAt([layer], 5, new Set()));
  const trimmed = piece(right, 4, clipEnd(right), { head: true });
  near(zoomsOver({ tracks, clips: [trimmed] }, 1, 4.01)[0].scale, 2, "no new way in");
});

test("a way in or out set by hand on a piece happens at the piece's own edge", () => {
  const [left, right] = sorted(splitAt([layer], 5, new Set()));
  assert.ok(right.zoomLayer?.origin, "the right piece starts inside the curve");
  const edited = { ...right, zoomLayer: editLayer(right, { zoomIn: true, easeIn: 0.5 }) };
  const view = (t: number) => zoomsOver({ tracks, clips: [left, edited] }, 1, t)[0];
  assert.ok(view(5.05).scale < 2, "zooms in again from its start");
  near(view(5.6).scale, 2, "and is there after its ease");
  near(view(7.7).scale, zoomsOver({ tracks, clips: [layer] }, 1, 7.7)[0].scale, "same way out");
  const plain = editLayer(layer, { zoomOut: false });
  assert.ok(!("origin" in plain) && !("length" in plain), "a whole layer stays plain");
});
