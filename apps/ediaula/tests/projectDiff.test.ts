import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyItems,
  type DiffItem,
  dependents,
  diffProjects,
  draftClips,
  includeItem,
  revertItem,
  same,
} from "../src/shared/projectDiff.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id === "rec" ? "Tela" : id,
  path: `C:/aulas/${id}.mp4`,
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
const track = (id: string, kind: Track["kind"] = "video"): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
});
const clip = (id: string, start: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  assetId: "rec",
  trackId: "v1",
  start,
  in: start,
  duration: 10,
  volume: 1,
  ...extra,
});

const base: Project = {
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [asset("rec")],
  tracks: [track("v1"), track("a1", "audio")],
  clips: [clip("c1", 0), clip("c2", 10), clip("c3", 20), clip("c4", 30)],
};

/** Projects compared without the order of their lists. */
function sameProject(a: Project, b: Project): void {
  const byId = <T extends { id: string }>(list: T[]): T[] =>
    [...list].sort((x, y) => x.id.localeCompare(y.id));
  assert.ok(same(byId(a.clips), byId(b.clips)), "clips");
  assert.ok(same(byId(a.assets), byId(b.assets)), "assets");
  assert.ok(same(a.tracks, b.tracks), "tracks");
  assert.equal(a.palette, b.palette);
}

const balloon: Asset = asset("pic", {
  name: "Balão",
  kind: "image",
  generated: "annotation",
  duration: 0,
  hasAudio: false,
  width: 400,
  height: 200,
});

/** An AI edit: a balloon on a new track, the lesson pushed 2 s after 10 s, a trim, a palette. */
function edited(): Project {
  return {
    ...base,
    palette: "sistema-zero",
    paletteFonts: true,
    tracks: [track("t9"), ...base.tracks],
    assets: [
      {
        ...base.assets[0],
        zooms: [{ id: "z", start: 1, end: 3, scale: 1.8, focus: [], auto: true }],
      },
      balloon,
    ],
    clips: [
      { ...base.clips[0], duration: 8 },
      { ...base.clips[1], start: 12, transition: { kind: "dissolve", duration: 0.5 } },
      { ...base.clips[2], start: 22 },
      { ...base.clips[3], start: 32 },
      {
        id: "b1",
        assetId: "pic",
        trackId: "t9",
        start: 4,
        in: 0,
        duration: 3,
        volume: 1,
        annotation: { kind: "balloon", text: "Olha aqui!", color: "#12140A" },
      },
    ],
  };
}

test("the readable changes of an edit: palette, track, balloon, move, trim, transition and zoom", () => {
  const items = diffProjects(base, edited());
  const kinds = items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, [
    "annotation-created",
    "clip-moved",
    "clip-trimmed",
    "palette",
    "track",
    "transition",
    "zoom",
  ]);
  const move = items.find((i) => i.kind === "clip-moved");
  // The three clips pushed by the same 2 s are one item.
  assert.deepEqual(move?.clips.sort(), ["c2", "c3", "c4"]);
  assert.match(move?.label ?? "", /3 clipes a partir de 0:10 andaram 2,0 s para a direita/);
  const created = items.find((i) => i.kind === "annotation-created");
  assert.match(created?.label ?? "", /Balão "Olha aqui!" em 0:04/);
  // The balloon brings its picture and stands on the new track.
  assert.ok(created?.patches.some((p) => p.entity === "asset" && p.id === "pic"));
  assert.deepEqual(created?.needs, ["track:t9"]);
  assert.match(items.find((i) => i.kind === "palette")?.label ?? "", /sistema-zero, com as fontes/);
  const zoom = items.find((i) => i.kind === "zoom");
  assert.match(zoom?.label ?? "", /1 zoom, 1 automático/);
  // The zoom shows on every clip of the recording, first at 0:01.
  assert.equal(zoom?.at, 1);
  assert.deepEqual(zoom?.clips.sort(), ["c1", "c2", "c3", "c4"]);
  assert.ok(!items.some((i) => /—|\(s\)/.test(i.label)), "copy without dash or (s)");
  assert.deepEqual([...draftClips(items)].sort(), ["b1", "c1", "c2", "c3", "c4"]);
});

test("applying every item gives the edited project; nothing pending gives the same object", () => {
  const after = edited();
  const items = diffProjects(base, after);
  const { project, conflicts } = applyItems(base, items);
  assert.deepEqual(conflicts, []);
  sameProject(project, after);
  const none = items.map((i) => ({ ...i, status: "rejected" as const }));
  assert.equal(applyItems(base, none).project, base);
});

test("an item left out takes what depends on it along, and the rest still applies", () => {
  const after = edited();
  const items = diffProjects(base, after);
  const trackItem = items.find((i) => i.kind === "track") as DiffItem;
  const balloonItem = items.find((i) => i.kind === "annotation-created") as DiffItem;
  assert.deepEqual(
    dependents(items, trackItem.id).map((d) => d.id),
    [balloonItem.id],
  );
  const r = revertItem(base, items, trackItem.id);
  assert.deepEqual(
    r.conflicts.map((c) => c.id),
    [balloonItem.id],
  );
  assert.ok(!r.project.tracks.some((t) => t.id === "t9"));
  assert.ok(!r.project.clips.some((c) => c.id === "b1"));
  assert.equal(r.project.palette, "sistema-zero");
  assert.equal(r.project.clips.find((c) => c.id === "c2")?.start, 12);
  // Brought back, it applies again.
  const back = includeItem(includeItem(r.items, trackItem.id), balloonItem.id);
  sameProject(applyItems(base, back).project, after);
});

test("a later step on the same clip is a conflict of the earlier one", () => {
  const mid: Project = {
    ...base,
    clips: base.clips.map((c) => (c.id === "c2" ? { ...c, duration: 6 } : c)),
  };
  const after: Project = {
    ...mid,
    clips: mid.clips.map((c) => (c.id === "c2" ? { ...c, start: 11 } : c)),
  };
  const first = diffProjects(base, mid);
  const second = diffProjects(mid, after);
  const items = [...first, ...second];
  const r = revertItem(base, items, first[0].id);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].kind, "clip-moved");
  // Both went: c2 is as it was.
  assert.ok(
    same(
      r.project.clips.find((c) => c.id === "c2"),
      base.clips[1],
    ),
  );
});

test("an item the project changed under since the draft does not apply", () => {
  const items = diffProjects(base, edited());
  // The person trims c1 meanwhile: the draft's trim of c1 no longer fits.
  const now: Project = {
    ...base,
    clips: base.clips.map((c) => (c.id === "c1" ? { ...c, duration: 5 } : c)),
  };
  const r = applyItems(now, items);
  const trim = items.find((i) => i.kind === "clip-trimmed") as DiffItem;
  assert.deepEqual(r.conflicts, [trim.id]);
  assert.equal(r.project.clips.find((c) => c.id === "c1")?.duration, 5);
  // Media the app learned meanwhile (a thumbnail) is not a change of the draft.
  const thumb: Project = { ...base, assets: [{ ...base.assets[0], thumb: "C:/t.jpg" }] };
  assert.deepEqual(applyItems(thumb, items).conflicts, []);
  assert.deepEqual(diffProjects(base, thumb), []);
});

test("removed clips and changed tracks are listed; a clip removed again fits", () => {
  const after: Project = {
    ...base,
    tracks: base.tracks.map((t) => (t.id === "a1" ? { ...t, music: true } : t)),
    clips: base.clips.filter((c) => c.id !== "c4"),
  };
  const items = diffProjects(base, after);
  assert.deepEqual(
    items.map((i) => i.label),
    ["Faixa a1: marcada como música", "Clipe removido: Tela de 0:30"],
  );
  const r = applyItems(after, items);
  assert.deepEqual(r.conflicts, []);
  sameProject(r.project, after);
});
