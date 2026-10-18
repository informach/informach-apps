import assert from "node:assert/strict";
import { test } from "node:test";
import { duckGain, spotlightSpans } from "../src/shared/audio.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { gainAt, gainDbAt, gainExpr, upsertGain } from "../src/shared/gain.ts";
import { piece } from "../src/shared/pieces.ts";
import { setClipSpeed } from "../src/shared/timeline.ts";
import { exprFn } from "../src/shared/transitions.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const points = [
  { t: 1, db: 0 },
  { t: 2, db: -12 },
  { t: 4, db: -12 },
  { t: 5, db: 6 },
];

test("the export's expression gives the same volume as the preview's gainAt", () => {
  const f = exprFn(gainExpr(points, "T"));
  for (let t = -1; t <= 7; t += 0.05) {
    const want = gainAt(points, t);
    assert.ok(Math.abs(f(t) - want) < 1e-6, `at ${t.toFixed(2)} s: ${f(t)} and ${want}`);
  }
  assert.equal(gainDbAt(points, 3), -12);
  assert.equal(gainDbAt(points, 1.5), -6);
  // Silence at the bottom of the range, in both.
  const mute = [{ t: 0, db: -60 }];
  assert.equal(gainAt(mute, 1), 0);
  assert.equal(exprFn(gainExpr(mute, "T"))(1), 0);
  assert.equal(gainExpr(undefined, "T"), "1");
  // A point near another replaces it.
  assert.deepEqual(
    upsertGain(points, 2.02, -3).filter((p) => Math.abs(p.t - 2) < 0.1),
    [{ t: 2.02, db: -3 }],
  );
});

test("pieces and speed keep the envelope on the same moments of the clip", () => {
  const c: Clip = {
    id: "c",
    assetId: "a",
    trackId: "t",
    start: 10,
    in: 0,
    duration: 6,
    volume: 1,
    gain: points,
  };
  const second = piece(c, 13, 16);
  assert.equal(gainDbAt(second.gain, 1), gainDbAt(c.gain, 4));
  const slower = setClipSpeed([c], "c", 0.5, false)[0];
  assert.equal(gainDbAt(slower.gain, 6), gainDbAt(c.gain, 3));
});

test("the audio plan applies the envelope per piece and the highlighted track's ducking", () => {
  const asset = (id: string): Asset => ({
    id,
    name: id,
    path: `C:/${id}.wav`,
    kind: "audio",
    duration: 30,
    width: 0,
    height: 0,
    fps: 0,
    hasVideo: false,
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
  });
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset("voz"), asset("sfx")],
    tracks: [
      { id: "v", kind: "audio", name: "v", muted: false, hidden: false, locked: false },
      {
        id: "s",
        kind: "audio",
        name: "s",
        muted: false,
        hidden: false,
        locked: false,
        spotlight: true,
      },
    ],
    clips: [
      {
        id: "voz",
        assetId: "voz",
        trackId: "v",
        start: 0,
        in: 0,
        duration: 20,
        volume: 1,
        gain: points,
      },
      { id: "sfx", assetId: "sfx", trackId: "s", start: 8, in: 0, duration: 3, volume: 1 },
    ],
  };
  const plan = buildAudioPlan(p, {});
  assert.match(plan.filter, /volume='if\(lte\(if\(lte\(\(t\+0\),1\)/);
  // The voice lane steps aside while the highlighted one plays; the highlighted one does not.
  const spans = spotlightSpans(p, 0.35, 0.8);
  assert.deepEqual(spans, [[8, 11]]);
  assert.ok(duckGain(spans, 9.5, 0.25, 0.35) < 0.3);
  const lanes = plan.filter.split(";\n").filter((l) => /\[lane\d\]$/.test(l));
  assert.equal(lanes.length, 2);
  assert.equal(lanes.filter((l) => l.includes(":eval=frame[lane")).length, 1);
  const stems = buildAudioPlan(p, {}, { stems: true });
  assert.deepEqual(stems.stems, { voice: "svoice", music: "smusic" });
  assert.match(stems.filter, /\[svoice\]/);
});
