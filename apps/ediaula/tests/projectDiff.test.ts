import assert from "node:assert/strict";
import { test } from "node:test";
import { openGap } from "../src/shared/inserts.ts";
import {
  applyItems,
  type DiffItem,
  type DraftState,
  dependents,
  diffProjects,
  draftClips,
  draftWrite,
  includeItem,
  revertItem,
  STRUCTURE_KEY,
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

test("the readable changes of an edit: palette, track, balloon, structure, transition and zoom", () => {
  const items = diffProjects(base, edited());
  const kinds = items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, [
    "annotation-created",
    "palette",
    "structure",
    "track",
    "transition",
    "zoom",
  ]);
  // The trim and the clips pushed 2 s are one change of structure: half of it would leave the
  // track with a hole or two clips on top of each other.
  const structure = items.find((i) => i.kind === "structure");
  assert.deepEqual(structure?.clips.sort(), ["c1", "c2", "c3", "c4"]);
  assert.match(structure?.label ?? "", /Mudança de estrutura a partir de 0:00/);
  assert.ok(structure?.keys.includes(STRUCTURE_KEY));
  const created = items.find((i) => i.kind === "annotation-created");
  assert.match(created?.label ?? "", /Balão "Olha aqui!" em 0:04/);
  // The balloon brings its picture, stands on the new track and was timed on the new structure.
  assert.ok(created?.patches.some((p) => p.entity === "asset" && p.id === "pic"));
  assert.deepEqual(created?.needs.sort(), [STRUCTURE_KEY, "track:t9"]);
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
  assert.equal(r.conflicts[0].kind, "structure");
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
  // The change of structure trims c1: it does not fit any more, and the balloon timed on it goes.
  const structure = items.find((i) => i.kind === "structure") as DiffItem;
  const balloonItem = items.find((i) => i.kind === "annotation-created") as DiffItem;
  assert.deepEqual(r.conflicts.sort(), [structure.id, balloonItem.id].sort());
  assert.equal(r.project.clips.find((c) => c.id === "c1")?.duration, 5);
  assert.equal(r.project.clips.find((c) => c.id === "c2")?.start, 10);
  assert.ok(!r.project.clips.some((c) => c.id === "b1"));
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
    [
      "Mudança de estrutura a partir de 0:30: 1 clipe novo ou removido",
      "Faixa a1: marcada como música",
    ],
  );
  const r = applyItems(after, items);
  assert.deepEqual(r.conflicts, []);
  sameProject(r.project, after);
});

const still: Asset = asset("still", {
  name: "Quadro parado",
  kind: "image",
  duration: 0,
  hasAudio: false,
});

test("an insert is one change of structure: the split, the held frame and what moved", () => {
  const lesson: Project = {
    ...base,
    assets: [asset("rec", { duration: 600 }), still, balloon],
    tracks: [track("o1"), track("v1")],
    clips: [
      clip("s", 0, { duration: 600 }),
      {
        id: "n",
        assetId: "pic",
        trackId: "o1",
        start: 300,
        in: 0,
        duration: 3,
        volume: 1,
        annotation: { kind: "note", text: "Depois", color: "#12140A" },
      },
    ],
  };
  // What placeInserts does: 4 s opened at 2:00 on the screen track, the screen held meanwhile.
  const opened = openGap(lesson.clips, 120, 4, new Set(["v1"]));
  const after: Project = {
    ...lesson,
    clips: [
      ...opened.clips,
      { id: "hold", assetId: "still", trackId: "v1", start: 120, in: 0, duration: 4, volume: 1 },
    ],
  };
  const right = after.clips.find((c) => c.assetId === "rec" && c.start > 100);
  assert.ok(right);
  const op = { label: "Inserção F1P1-D01 em 2:00, abre 4,0 s", created: [right.id, "hold"] };
  const items = diffProjects(lesson, after, [op]);
  const structure = items.filter((i) => i.kind === "structure");
  assert.equal(structure.length, 1);
  assert.equal(structure[0].label, "Inserção F1P1-D01 em 2:00, abre 4,0 s");
  for (const id of ["s", right.id, "hold"]) assert.ok(structure[0].clips.includes(id), id);
  // No piece of it can be taken on its own.
  assert.ok(!items.some((i) => ["clip-created", "clip-trimmed", "clip-moved"].includes(i.kind)));
  sameProject(applyItems(lesson, items).project, after);
  // Left out, the lesson is as it was: no hole, no piece on top of another.
  const off = revertItem(lesson, items, structure[0].id);
  sameProject(off.project, lesson);
});

test("an item whose track was left out does not apply alone, and including it brings the track", () => {
  const items = diffProjects(base, edited());
  const trackItem = items.find((i) => i.kind === "track") as DiffItem;
  const balloonItem = items.find((i) => i.kind === "annotation-created") as DiffItem;
  // Only the track rejected (as an older draft could have it): the balloon is refused, not
  // dropped on a track that is not there.
  const orphan = items.map((i) =>
    i.id === trackItem.id ? { ...i, status: "rejected" as const } : i,
  );
  const r = applyItems(base, orphan);
  assert.ok(r.conflicts.includes(balloonItem.id));
  assert.ok(!r.project.clips.some((c) => c.id === "b1"));
  // "Incluir" on the balloon brings back what it stands on.
  const back = includeItem(revertItem(base, items, trackItem.id).items, balloonItem.id);
  assert.equal(back.find((i) => i.id === trackItem.id)?.status, "pending");
  const out = applyItems(base, back);
  assert.deepEqual(out.conflicts, []);
  assert.ok(out.project.tracks.some((t) => t.id === "t9"));
  assert.equal(out.project.clips.find((c) => c.id === "b1")?.trackId, "t9");
});

/** Two annotations written into a draft, then an opening card that moves the lesson 4 s. */
function cardAfterAnnotations(): { state: DraftState; lesson: Project } {
  const note = (id: string, start: number): Clip => ({
    id,
    assetId: `p${id}`,
    trackId: "o1",
    start,
    in: 0,
    duration: 3,
    volume: 1,
    annotation: { kind: "note", text: id, color: "#12140A" },
  });
  const pictures = ["pA", "pB", "pK"].map((id) =>
    asset(id, { kind: "image", generated: "annotation", duration: 0, hasAudio: false }),
  );
  const lesson: Project = {
    ...base,
    assets: [asset("rec"), ...pictures],
    tracks: [track("o1"), track("v1")],
    clips: [clip("s", 0, { duration: 60 })],
  };
  const first = draftWrite(null, lesson, (p) => ({
    ...p,
    clips: [...p.clips, note("A", 10), note("B", 20)],
  }));
  assert.ok(first);
  const second = draftWrite(first, lesson, (p) => ({
    ...p,
    clips: [
      ...p.clips.map((c) => ({ ...c, start: c.start + 4 })),
      {
        id: "K",
        assetId: "pK",
        trackId: "o1",
        start: 0,
        in: 0,
        duration: 4,
        volume: 1,
        annotation: { kind: "card", text: "Abertura", color: "#121A30" },
      },
    ],
  }));
  assert.ok(second);
  return { state: second, lesson };
}

test("each write reads as the final change: leaving out an annotation keeps the card's shift", () => {
  const { state, lesson } = cardAfterAnnotations();
  const structure = state.items.find((i) => i.kind === "structure");
  assert.equal(structure?.label, "Cartela de abertura em 0:00: a aula anda 4,0 s");
  assert.deepEqual(structure?.clips.sort(), ["K", "s"]);
  // The annotations are where the draft shows them, timed on the new structure.
  const a = state.items.find((i) => i.label.includes('"A"'));
  const b = state.items.find((i) => i.label.includes('"B"'));
  assert.equal(a?.at, 14);
  assert.equal(b?.at, 24);
  assert.ok(a?.needs.includes(STRUCTURE_KEY));
  assert.ok(a);
  const r = revertItem(lesson, state.items, a.id);
  assert.deepEqual(r.conflicts, []);
  const starts = Object.fromEntries(r.project.clips.map((c) => [c.id, c.start]));
  assert.deepEqual(starts, { s: 4, B: 24, K: 0 });
});

test("a clip made and then moved in the same draft is one creation where it ended", () => {
  const lesson: Project = {
    ...base,
    assets: [asset("rec"), balloon],
    tracks: [track("o1"), track("v1")],
  };
  const add = draftWrite(null, lesson, (p) => ({
    ...p,
    clips: [
      ...p.clips,
      {
        id: "b1",
        assetId: "pic",
        trackId: "o1",
        start: 10,
        in: 0,
        duration: 3,
        volume: 1,
        annotation: { kind: "balloon", text: "Oi", color: "#12140A" },
      },
    ],
  }));
  const moved = draftWrite(add, lesson, (p) => ({
    ...p,
    clips: p.clips.map((c) => (c.id === "b1" ? { ...c, start: 12 } : c)),
  }));
  assert.equal(moved?.items.length, 1);
  assert.equal(moved?.items[0].kind, "annotation-created");
  assert.equal(moved?.items[0].at, 12);
  // An edit that changes nothing writes nothing.
  assert.equal(
    draftWrite(moved, lesson, (p) => p),
    null,
  );
});
