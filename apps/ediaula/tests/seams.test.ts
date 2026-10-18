import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import {
  approveSeam,
  deriveSeams,
  isReviewed,
  restoreSeam,
  SEAM_CONTEXT,
} from "../src/shared/seams.ts";
import { clipEnd, sourceEnd, splitAt } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const media = (id: string, kind: Asset["kind"]): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind,
  duration: 60,
  width: kind === "video" ? 1920 : 0,
  height: kind === "video" ? 1080 : 0,
  fps: 30,
  hasVideo: kind === "video",
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
});

const take = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [media("tela", "video"), media("voz", "audio"), media("musica", "audio")],
  tracks: [
    { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    {
      id: "m1",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
    },
  ],
  clips: [
    { id: "s", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 60, volume: 1 },
    { id: "v", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 60, volume: 1 },
    { id: "m", assetId: "musica", trackId: "m1", start: 0, in: 0, duration: 60, volume: 0.3 },
  ],
});

const targets = new Set(["v1", "a1"]);
const cut = (p: Project, ranges: [number, number][]): Project => ({
  ...p,
  clips: applyCuts(p.clips, ranges, targets),
});

test("a cut is one seam on every track it went through, with what it took out", () => {
  const p = cut(take(), [[10, 14]]);
  const seams = deriveSeams(p);
  assert.equal(seams.length, 1);
  assert.equal(seams[0].at, 10);
  assert.equal(seams[0].removed, 4);
  assert.deepEqual(seams[0].parts.map((x) => x.trackId).sort(), ["a1", "v1"]);
  assert.deepEqual(seams[0].ids.sort(), ["tela:10.000-14.000", "voz:10.000-14.000"]);
  assert.equal(SEAM_CONTEXT, 1.5);
});

test("pieces that still follow each other, or of different media, are not seams", () => {
  const p = take();
  const split = { ...p, clips: splitAt(p.clips, 20, new Set()) };
  assert.deepEqual(deriveSeams(split), []);
  const other: Project = {
    ...p,
    assets: [...p.assets, media("outra", "video")],
    clips: [
      { id: "a", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 5, volume: 1 },
      { id: "b", assetId: "outra", trackId: "v1", start: 5, in: 30, duration: 5, volume: 1 },
    ],
  };
  assert.deepEqual(deriveSeams(other), []);
});

test("seams are found again by their media seconds after other cuts, and approving keeps them", () => {
  let p = cut(take(), [[10, 14]]);
  const [seam] = deriveSeams(p);
  p = approveSeam(p, seam);
  assert.ok(isReviewed(p, seam));
  assert.ok(projectSchema.safeParse(p).success);
  // A later cut before it moves the seam on the timeline; it is still the same seam, approved.
  p = cut(p, [[2, 3]]);
  const again = deriveSeams(p);
  assert.equal(again.length, 2);
  const moved = again.find((s) => Math.abs(s.at - 9) < 1e-6);
  assert.ok(moved && isReviewed(p, moved));
  const other = again.find((s) => s !== moved);
  assert.ok(other && !isReviewed(p, other));
});

test("restoring opens the timeline on the cut tracks and the left pieces play on into the right", () => {
  const p = cut(take(), [[10, 14]]);
  const [seam] = deriveSeams(p);
  const r = restoreSeam(p, seam, targets);
  assert.ok("clips" in r);
  const restored = { ...p, clips: r.clips };
  for (const id of ["v1", "a1"]) {
    const on = restored.clips.filter((c) => c.trackId === id).sort((a, b) => a.start - b.start);
    assert.equal(on.length, 2);
    assert.equal(on[0].start, 0);
    assert.equal(clipEnd(on[0]), 14);
    assert.equal(sourceEnd(on[0]), 14);
    assert.equal(on[1].start, 14);
    assert.equal(on[1].in, 14);
  }
  assert.deepEqual(deriveSeams(restored), []);
  // The music bed under the cut keeps playing; the cut trimmed its end and it grows back.
  const music = restored.clips.find((c) => c.id === "m");
  assert.equal(music?.start, 0);
  assert.equal(music && clipEnd(music), 60);
});

test("a seam that took nothing out, or a locked track past it, cannot be restored", () => {
  const p = take();
  const swapped: Project = {
    ...p,
    clips: [
      { id: "a", assetId: "tela", trackId: "v1", start: 0, in: 20, duration: 5, volume: 1 },
      { id: "b", assetId: "tela", trackId: "v1", start: 5, in: 2, duration: 5, volume: 1 },
    ],
  };
  const [back] = deriveSeams(swapped);
  assert.equal(back.removed, 0);
  assert.ok("refused" in restoreSeam(swapped, back, targets));
  const cutOne = cut(p, [[10, 14]]);
  const locked: Project = {
    ...cutOne,
    tracks: cutOne.tracks.map((t) => (t.id === "m1" ? { ...t, locked: true } : t)),
  };
  const [seam] = deriveSeams(locked);
  const r = restoreSeam(locked, seam, targets, new Set(["m1"]));
  assert.ok("refused" in r && /travada/.test(r.refused));
});

test("the cut ripple keeps the other clips in step when a seam is restored", () => {
  const p = cut(take(), [[10, 14]]);
  const extra: Clip = {
    id: "x",
    assetId: "tela",
    trackId: "v1",
    start: 50,
    in: 0,
    duration: 1,
    volume: 1,
  };
  const withExtra = {
    ...p,
    clips: [...p.clips.filter((c) => c.trackId !== "v1" || c.start < 40), extra],
  };
  const [seam] = deriveSeams(withExtra);
  const r = restoreSeam(withExtra, seam, targets);
  assert.ok("clips" in r);
  assert.equal(r.clips.find((c) => c.id === "x")?.start, 54);
});
