import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import { transformAt } from "../src/shared/keyframes.ts";
import { bracketKeyframes, piece, zoomBankOf } from "../src/shared/pieces.ts";
import {
  clipEnd,
  overwriteRange,
  sourceAt,
  splitAt,
  splitClip,
  trimClip,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";
import { type Zoom, zoomAt } from "../src/shared/zoom.ts";
import { zoomsOver } from "../src/shared/zoomLayer.ts";

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

/** A recording played at 1.5×, moving, zoomed, fading in and out, after a dissolve. */
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
  zooms: [
    zoom("z1", 11, 14),
    zoom("z2", 15, 17.5),
    zoom("z3", 19, 23),
    zoom("z4", 26, 28),
    zoom("z5", 31, 35),
    zoom("z6", 37, 39.5),
  ],
};

const near = (a: number, b: number, what: string): void => {
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} ≈ ${b}`);
};

const sorted = (clips: Clip[]): Clip[] => [...clips].sort((a, b) => a.start - b.start);

test("pieces keep the movement and the zooms of the original at every moment", () => {
  const pieces = sorted(splitAt([recording], 9, new Set()));
  const more = sorted(pieces.flatMap((c) => splitAt([c], 14.5, new Set())));
  const all = sorted(more.flatMap((c) => splitAt([c], 20.25, new Set())));
  assert.equal(all.length, 4);
  for (const p of all) {
    for (let t = p.start; t < clipEnd(p); t += 0.125) {
      const a = transformAt(p, t);
      const b = transformAt(recording, t);
      near(a.x, b.x, `x at ${t}`);
      near(a.y, b.y, `y at ${t}`);
      near(a.scale, b.scale, `scale at ${t}`);
      const za = zoomAt(p.zooms, sourceAt(p, t));
      const zb = zoomAt(recording.zooms, sourceAt(recording, t));
      near(za.scale, zb.scale, `zoom at ${t}`);
      near(za.cx, zb.cx, `zoom x at ${t}`);
      near(za.cy, zb.cy, `zoom y at ${t}`);
    }
    // Only what the piece can show travels with it.
    const from = p.in;
    const to = p.in + p.duration * 1.5;
    assert.ok((p.zooms ?? []).every((z) => z.end > from && z.start < to));
    assert.ok((p.keyframes ?? []).length <= 4);
  }
});

test("entrance and transition on the first piece only, exit on the last, ids unique", () => {
  const all = sorted(
    [9, 14.5, 20.25].reduce<Clip[]>((clips, t) => splitAt(clips, t, new Set()), [recording]),
  );
  const [first, ...rest] = all;
  const last = all[all.length - 1];
  assert.equal(first.id, "rec");
  assert.deepEqual(first.transition, recording.transition);
  assert.equal(first.fadeIn, 0.5);
  assert.equal(first.enter, "pop");
  assert.equal(last.fadeOut, 0.4);
  assert.equal(last.exit, "fade");
  for (const p of rest) {
    assert.equal(p.transition, undefined);
    assert.equal(p.fadeIn, undefined);
    assert.equal(p.enter, undefined);
    assert.ok(!("transition" in p) && !("fadeIn" in p), "no keys left set to undefined");
  }
  for (const p of all.slice(0, -1)) {
    assert.equal(p.fadeOut, undefined);
    assert.equal(p.exit, undefined);
  }
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
});

test("text cuts in an avatar with dissolves leave one fade in and one fade out", () => {
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
  assert.equal(out.length, 4);
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

test("an overwritten head keeps the clip's id but not its entrance", () => {
  const out = overwriteRange([recording], "v", 0, 7);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "rec");
  assert.equal(out[0].start, 7);
  assert.equal(out[0].transition, undefined);
  assert.equal(out[0].fadeOut, 0.4);
});

test("trims keep the clip and move its edge effects along; a longer clip gets its zooms back", () => {
  const parts = splitClip(recording, 15);
  assert.ok(parts);
  const [left, right] = parts;
  assert.ok(!right.zooms?.some((z) => z.id === "z3"), "z3 ends before the right piece");
  const bank = zoomBankOf({ clips: [left, right] }, "screen");
  assert.equal(bank.length, recording.zooms?.length);
  const asset = { kind: "video", duration: 120 } as Asset;
  const longer = trimClip(right, "start", 12, asset, bank);
  assert.equal(longer.id, right.id);
  assert.equal(longer.start, 12);
  assert.ok(
    longer.zooms?.some((z) => z.id === "z3"),
    "z3 is back",
  );
  for (let t = 12; t < clipEnd(longer); t += 0.25) {
    near(
      zoomAt(longer.zooms, sourceAt(longer, t)).scale,
      zoomAt(recording.zooms, sourceAt(recording, t)).scale,
      `zoom at ${t}`,
    );
    // The movement is the original from the first keyframe the piece kept (t = 14) and holds
    // that position before it: keyframes have no bank, only the bracket of the piece.
    const expected = transformAt(recording, Math.max(t, 14));
    near(transformAt(longer, t).x, expected.x, `x at ${t}`);
  }
  const shorter = trimClip(left, "end", 10, asset);
  assert.equal(shorter.id, "rec");
  assert.equal(shorter.fadeOut, undefined, "a split-off exit does not come back with a trim");
  const trimmedEnd = trimClip(recording, "end", 20, asset);
  assert.equal(trimmedEnd.fadeOut, 0.4, "a trimmed end keeps the exit");
  assert.ok(!trimmedEnd.zooms?.some((z) => z.id === "z6"), "zooms past the new end are left out");
});

test("keyframes are cut to the bracket around the piece", () => {
  const kfs = recording.keyframes ?? [];
  assert.deepEqual(
    bracketKeyframes(kfs, 5, 6).map((k) => k.t),
    [-1, 4, 10],
  );
  assert.deepEqual(
    bracketKeyframes(kfs, 0, 20).map((k) => k.t),
    [0, 4, 9, 15, 20],
  );
  assert.deepEqual(
    bracketKeyframes([...kfs].reverse(), 16, 2).map((k) => k.t),
    [-1, 4],
  );
  assert.deepEqual(
    piece(recording, 10, 16).keyframes?.map((k) => k.t),
    [-1, 4, 10],
  );
});

test("a zoom layer cut in two keeps the same view across the cut", () => {
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
  const whole: Pick<Project, "clips" | "tracks"> = { tracks, clips: [layer] };
  const parts = splitClip(layer, 5);
  assert.ok(parts);
  const [left, right] = parts;
  assert.equal(left.zoomLayer?.zoomOut, false);
  assert.equal(right.zoomLayer?.zoomIn, false);
  assert.equal(right.zoomLayer?.zoomOut, true);
  const cut: Pick<Project, "clips" | "tracks"> = { tracks, clips: [left, right] };
  for (let t = 1.5; t < 8.5; t += 0.05) {
    const a = zoomsOver(cut, 1, t);
    const b = zoomsOver(whole, 1, t);
    assert.equal(a.length, b.length, `views at ${t}`);
    a.forEach((v, i) => {
      near(v.scale, b[i].scale, `scale at ${t}`);
      near(v.cx, b[i].cx, `x at ${t}`);
      near(v.cy, b[i].cy, `y at ${t}`);
    });
  }
});
