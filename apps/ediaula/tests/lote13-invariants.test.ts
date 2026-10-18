import assert from "node:assert/strict";
import { test } from "node:test";
// The desktop SDK's own IPC structure check, the one every editor call goes through.
import { validateIpcValues } from "../../../packages/edi-desktop/src/files.ts";
import { applyCuts } from "../src/shared/cleanup.ts";
import { exportProject, frameRate } from "../src/shared/export/frames.ts";
import { planSegments } from "../src/shared/export/segments.ts";
import { buildVideoWindowPlan } from "../src/shared/export/videoPlan.ts";
import { detachAudio, groupClips, ungroupClips } from "../src/shared/groups.ts";
import { addMarker } from "../src/shared/markers.ts";
import { exportSpecSchema, projectSchema } from "../src/shared/project-schema.ts";
import { replaceAsset } from "../src/shared/replaceAsset.ts";
import { extendFrameAll, insertClips, rippleTrim } from "../src/shared/ripple.ts";
import { settle } from "../src/shared/settle.ts";
import { pasteClips, splitAt, toFrame } from "../src/shared/timeline.ts";
import type { Asset, Clip, ExportSpec, Project, Track } from "../src/shared/types.ts";

const LESSON = 25 * 60;

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.${kind === "audio" ? "wav" : kind === "image" ? "png" : "mp4"}`,
  kind,
  duration: kind === "image" ? 0 : LESSON,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1000,
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

/** A long lesson with every new edit of this batch on it. */
function lesson(): Project {
  const regions: Clip[] = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i}`,
    assetId: "fx",
    trackId: "fxt",
    start: 40 + i * 150,
    in: 0,
    duration: 6,
    volume: 0,
    regionFx: {
      kind: i % 3 === 0 ? "spotlight" : i % 3 === 1 ? "blur" : "pixelate",
      rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
      feather: 8,
      strength: 0.6,
    },
  }));
  const cards: Clip[] = Array.from({ length: 20 }, (_, i) => ({
    id: `n${i}`,
    assetId: "note",
    trackId: "n",
    start: 15 + i * 60,
    in: 0,
    duration: 3,
    volume: 0,
    annotation: { kind: "balloon", text: `Fala ${i}`, color: "#3D6BFF", reveal: "words" },
  }));
  let markers = addMarker([], 0, "Abertura");
  for (let i = 1; i < 30; i++) markers = addMarker(markers, i * 47, `Parte ${i}`);
  markers = markers.map((m, i) => (i % 5 === 0 ? { ...m, chapter: true } : m));
  return {
    version: 1,
    id: "longa",
    name: "Aula longa",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    background: { kind: "gradient", from: "#1F3A8A", to: "#0D0E11", angle: 160 },
    markers,
    assets: [
      asset("screen", "video"),
      asset("avatar", "video"),
      asset("note", "image", { generated: "annotation" }),
      asset("fx", "image", { generated: "effect" }),
      asset("music", "audio"),
    ],
    tracks: [
      track("fxt", "video"),
      track("n", "video", { magnetic: false }),
      track("a", "video"),
      track("v", "video"),
      track("mic", "audio", { spotlight: true }),
      track("m", "audio", { music: true }),
    ],
    clips: [
      ...regions,
      ...cards,
      {
        id: "avatar-clip",
        assetId: "avatar",
        trackId: "a",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 1,
        color: { brightness: 0.05, contrast: 1.1, saturation: 1.2, temperature: 5600 },
        transform: { x: 0.82, y: 0.6, scale: 0.4, opacity: 1, device: "phone" },
        gain: [
          { t: 0, db: 0 },
          { t: 600, db: -6 },
        ],
      },
      {
        id: "screen-clip",
        assetId: "screen",
        trackId: "v",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 1,
      },
      {
        id: "music-clip",
        assetId: "music",
        trackId: "m",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 0.35,
      },
    ],
  };
}

/**
 * Groups whose members on every track start at the same moments (a video and the sound taken
 * out of it): they must keep doing so through every edit. Filled as the groups are made.
 */
const aligned = new Set<string>();

/** The starts of a group's members, per track, in order (frames, to compare them). */
function startsByTrack(project: Project, groupId: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const c of project.clips)
    if (c.groupId === groupId)
      out.set(c.trackId, [...(out.get(c.trackId) ?? []), Math.round(c.start * 30)]);
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

function valid(project: Project, step: string): void {
  // No two clips of a track cover the same moment.
  const byTrack = new Map<string, Clip[]>();
  for (const c of project.clips) byTrack.set(c.trackId, [...(byTrack.get(c.trackId) ?? []), c]);
  for (const [trackId, list] of byTrack) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++)
      assert.ok(
        sorted[i].start >= sorted[i - 1].start + sorted[i - 1].duration - 1e-6,
        `${step}: ${sorted[i - 1].id} and ${sorted[i].id} overlap on ${trackId}`,
      );
  }
  // Groups in sync: the members on each track start where the others do.
  for (const groupId of aligned) {
    const lists = [...startsByTrack(project, groupId).values()];
    for (const list of lists.slice(1))
      assert.deepEqual(list, lists[0], `${step}: group ${groupId} out of sync`);
  }
  const parsed = projectSchema.safeParse(project);
  assert.ok(parsed.success, `${step}: ${JSON.stringify(parsed.error?.issues.slice(0, 3))}`);
  validateIpcValues(["C:/aulas/longa.ediaula", JSON.stringify(project)]);
  assert.doesNotThrow(() => validateIpcValues(["job", project]), `${step}: IPC structure`);
  // Markers stay inside the lesson and in order.
  const ts = (project.markers ?? []).map((m) => m.t);
  assert.deepEqual(
    ts,
    [...ts].sort((a, b) => a - b),
    `${step}: markers in order`,
  );
  assert.ok(
    ts.every((t) => t >= 0),
    `${step}: markers after 0:00`,
  );
}

const targets = new Set(["n", "a", "v", "mic"]);

test("a 25-minute lesson with markers, groups, envelopes and effects stays valid through every new edit", () => {
  const rnd = random(13);
  let p = lesson();
  valid(p, "start");
  const commit = (next: Project, step: string): void => {
    p = settle(p, next);
    valid(p, step);
  };

  commit({ ...p, clips: splitAt(p.clips, 300, new Set()) }, "split");
  const cuts: [number, number][] = Array.from({ length: 150 }, (_, i) => {
    const start = 10 + i * 9.3 + rnd() * 3;
    return [start, start + 0.4 + rnd()];
  });
  commit({ ...p, clips: applyCuts(p.clips, cuts, targets) }, "text cuts");

  const pair = p.clips
    .filter((c) => c.trackId === "n")
    .slice(0, 2)
    .map((c) => c.id);
  commit({ ...p, clips: groupClips(p.clips, pair) }, "group");
  // A piece after the card inserted at 1:40, so the magnetic track moves it later.
  const avatar = p.clips.find((c) => c.trackId === "a" && c.start > 120 && c.duration > 5);
  assert.ok(avatar);
  const detached = detachAudio(p, avatar.id);
  assert.ok(detached);
  const pairId = detached.clips.find((c) => c.id === avatar.id)?.groupId;
  assert.ok(pairId);
  aligned.add(pairId);
  commit({ ...p, clips: detached.clips, tracks: detached.tracks }, "detach audio");
  const grouped = p.clips.filter((c) => c.groupId);
  const pasted = pasteClips(p.tracks, p.clips, grouped, 30);
  commit({ ...p, tracks: pasted.tracks, clips: pasted.clips }, "paste a group");
  commit({ ...p, clips: ungroupClips(p.clips, pasted.ids) }, "ungroup");

  for (let i = 0; i < 10; i++) {
    const pieces = p.clips.filter((c) => c.trackId === "v" && c.duration > 2);
    const c = pieces[Math.floor(rnd() * pieces.length)];
    const edge = rnd() < 0.5 ? "start" : "end";
    const time = toFrame(edge === "start" ? c.start + 0.5 : c.start + c.duration - 0.5, 30);
    commit({ ...p, clips: rippleTrim(p, targets, c.id, edge, time).clips }, "ripple trim");
  }
  const card: Clip = {
    id: "card",
    assetId: "note",
    trackId: "v",
    start: 100,
    in: 0,
    duration: 2,
    volume: 0,
  };
  commit({ ...p, clips: insertClips(p, targets, [card], 100) }, "insert");
  const piece = p.clips.find((c) => c.trackId === "v" && c.assetId === "screen" && c.duration > 4);
  assert.ok(piece);
  p = {
    ...p,
    assets: [
      ...p.assets,
      asset("held", "image", { generated: "still", still: { assetId: "screen", t: 1 } }),
    ],
  };
  commit(
    { ...p, clips: extendFrameAll(p, piece.id, piece.start + 1, 1.5, "held", targets).clips },
    "extend frame",
  );
  // The avatar's track has a hole (the card inserted on the targets) and its clips are grouped
  // with their sound on another track: packing it takes the sound along.
  const sound = p.clips.find((c) => c.groupId === pairId && c.trackId !== "a");
  assert.ok(sound);
  const before = p.clips.filter((c) => c.trackId === "a").map((c) => c.start);
  commit(
    {
      ...p,
      tracks: p.tracks.map((t) => (t.id === "n" || t.id === "a" ? { ...t, magnetic: true } : t)),
    },
    "magnetic track",
  );
  assert.notDeepEqual(
    p.clips.filter((c) => c.trackId === "a").map((c) => c.start),
    before,
    "the magnetic track closed its hole",
  );
  const moved = p.clips.find((c) => c.id === sound.id);
  assert.ok(moved && moved.start < sound.start - 1, "the separated sound moved with its video");
  const next = { ...asset("avatar2", "video"), duration: LESSON };
  commit(replaceAsset(p, "avatar", next, null).project, "replace media");
  assert.ok(p.clips.some((c) => c.assetId === "avatar2"));

  // The export plans every window of it, with the new effects, within the limits.
  const spec: ExportSpec = {
    outPath: "C:/aulas/longa.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8000,
    normalizeLoudness: true,
    encoder: "x264",
    range: { from: 60, to: 600 },
  };
  assert.ok(exportSpecSchema.safeParse(spec).success);
  const r = frameRate(30);
  const derived = exportProject(p, r);
  const windows = planSegments(derived, spec, spec.range);
  assert.equal(windows[0].from, 1800);
  const last = windows.at(-1);
  assert.ok(last && last.from + last.frames === 18000);
  let regions = 0;
  for (const win of windows) {
    const plan = buildVideoWindowPlan(derived, spec, r, win);
    if (/boxblur|flags=neighbor|fx[^ ]*_spotlight/.test(plan.filter)) regions++;
    assert.match(plan.filter, /lutyuv=y=/);
    assert.match(plan.filter, /colortemperature=temperature=5600/);
  }
  assert.ok(regions > 0, "region effects reach the export");
});
