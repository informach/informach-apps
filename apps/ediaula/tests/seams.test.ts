import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import {
  approveSeam,
  deriveSeams,
  findSeam,
  isReviewed,
  restoreSeam,
  reviewSeams,
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
  // The microphone of the take: a track the cuts apply to (cleanup.ts cutTargets).
  assets: [
    media("tela", "video"),
    { ...media("voz", "audio"), recording: { id: "take", role: "mic" } },
    media("musica", "audio"),
  ],
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

/** Each track's clips in order, as "start-end in" (to see gaps and overlaps). */
const lane = (p: Pick<Project, "clips">, trackId: string): string[] =>
  p.clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => `${c.start.toFixed(2)}-${clipEnd(c).toFixed(2)} in ${c.in.toFixed(2)}`);

test("after a restore and Ctrl+Z, the next seam is found again as it is in the lesson", () => {
  const p = cut(take(), [
    [10, 14],
    [30, 34],
  ]);
  const seams = deriveSeams(p);
  assert.deepEqual(
    seams.map((x) => x.at),
    [10, 26],
  );
  const r = restoreSeam(p, seams[0], targets);
  assert.ok("clips" in r);
  // The bar moves on to the next seam of the restored lesson (4 s later than before).
  const next = deriveSeams({ ...p, clips: r.clips }).find((x) => x.at > 14);
  assert.equal(next?.at, 30);
  // Ctrl+Z puts the lesson back: the seam the bar holds is looked up again by its media seconds.
  assert.ok(next);
  const now = findSeam(p, next.ids);
  assert.equal(now?.at, 26);
  assert.ok(now);
  const again = restoreSeam(p, now, targets);
  assert.ok("clips" in again);
  for (const t of ["v1", "a1"])
    assert.deepEqual(lane({ clips: again.clips }, t), [
      "0.00-10.00 in 0.00",
      "10.00-30.00 in 14.00",
      "30.00-56.00 in 34.00",
    ]);
  // A seam that is gone is not found.
  assert.equal(findSeam(take(), next.ids), null);
});

test("only the tracks the cuts apply to have seams; annotations and other sounds do not", () => {
  const p = cut(take(), [[10, 14]]);
  const withOthers: Project = {
    ...p,
    assets: [
      ...p.assets,
      media("efeito", "audio"),
      {
        ...media("nota", "image"),
        kind: "image",
        generated: "annotation",
        width: 400,
        height: 200,
      },
    ],
    tracks: [
      ...p.tracks,
      { id: "fx", kind: "audio", name: "Efeitos", muted: false, hidden: false, locked: false },
      { id: "o1", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    ],
    clips: [
      ...p.clips,
      // A sound effect cut by hand: not a track the cuts apply to.
      { id: "e1", assetId: "efeito", trackId: "fx", start: 0, in: 0, duration: 5, volume: 1 },
      { id: "e2", assetId: "efeito", trackId: "fx", start: 5, in: 20, duration: 5, volume: 1 },
      // An annotation split in two.
      {
        id: "n1",
        assetId: "nota",
        trackId: "o1",
        start: 2,
        in: 0,
        duration: 2,
        volume: 1,
        annotation: { kind: "note", text: "Oi", color: "#12140A" },
      },
      {
        id: "n2",
        assetId: "nota",
        trackId: "o1",
        start: 4,
        in: 3,
        duration: 2,
        volume: 1,
        annotation: { kind: "note", text: "Oi", color: "#12140A" },
      },
    ],
  };
  const seams = deriveSeams(withOthers);
  assert.equal(seams.length, 1);
  assert.deepEqual(seams[0].parts.map((x) => x.trackId).sort(), ["a1", "v1"]);
  // Restoring it opens the timeline on the cut tracks only: the effect stays where it was.
  const r = restoreSeam(withOthers, seams[0], targets);
  assert.ok("clips" in r);
  assert.deepEqual(lane({ clips: r.clips }, "fx"), ["0.00-5.00 in 0.00", "5.00-10.00 in 20.00"]);
});

test("a seam the presenter's video plays across is approved, not restored", () => {
  const p = cut(take(), [[10, 14]]);
  const withPresenter: Project = {
    ...p,
    assets: [...p.assets, { ...media("apresentador", "video"), origin: "presenter" }],
    tracks: [
      { id: "v2", kind: "video", name: "Apresentador", muted: false, hidden: false, locked: false },
      ...p.tracks,
    ],
    clips: [
      ...p.clips,
      {
        id: "pv",
        assetId: "apresentador",
        trackId: "v2",
        start: 5,
        in: 0,
        duration: 20,
        volume: 0,
      },
    ],
  };
  const [seam] = reviewSeams(withPresenter, targets);
  assert.equal(seam.presenter, true);
  const r = restoreSeam(withPresenter, seam, targets);
  assert.ok("refused" in r && /apresentador/.test(r.refused));
  assert.ok(!/—/.test("refused" in r ? r.refused : ""));
});
