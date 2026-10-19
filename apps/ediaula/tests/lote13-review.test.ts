import assert from "node:assert/strict";
import { test } from "node:test";
import { clipEnd } from "../src/shared/clipTime.ts";
import { detachAudio, detachProblem, trimGroup } from "../src/shared/groups.ts";
import { colorSvg, LUMA } from "../src/shared/look.ts";
import { magneticBlockers } from "../src/shared/magnetic.ts";
import { regionRectAt, regionStrength, zoomUnder } from "../src/shared/regionFollow.ts";
import { replaceAsset } from "../src/shared/replaceAsset.ts";
import { settle } from "../src/shared/settle.ts";
import { trimClip } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

/** Probes of the Lote 13 review (scratchpad l13/model.mts), kept as tests. */

const asset = (id: string, kind: Asset["kind"], duration = 100): Asset => ({
  id,
  name: id,
  path: `C:/x/${id}.mp4`,
  kind,
  duration,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: kind !== "audio",
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
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
): Clip => ({
  id,
  assetId,
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
  ...extra,
});
const project = (assets: Asset[], tracks: Track[], clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "p",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks,
  clips,
});

/** No two clips of a track cover the same moment. */
function overlaps(p: Pick<Project, "clips">): string[] {
  const out: string[] = [];
  const byTrack = new Map<string, Clip[]>();
  for (const c of p.clips) byTrack.set(c.trackId, [...(byTrack.get(c.trackId) ?? []), c]);
  for (const list of byTrack.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].start < clipEnd(sorted[i - 1]) - 1e-6)
        out.push(`${sorted[i - 1].id}/${sorted[i].id}`);
  }
  return out;
}

test("a magnetic track takes the separated sound of a video along when it packs", () => {
  let p = project(
    [asset("v1", "video"), asset("v2", "video")],
    [track("V", "video"), track("A", "audio")],
    [clip("c1", "v1", "V", 0, 10), clip("c2", "v2", "V", 10, 10)],
  );
  const d = detachAudio(p, "c2");
  p = settle(p, { ...p, clips: d.clips, tracks: d.tracks });
  p = settle(p, {
    ...p,
    tracks: p.tracks.map((t) => (t.id === "V" ? { ...t, magnetic: true } : t)),
  });
  p = settle(p, { ...p, clips: p.clips.filter((c) => c.id !== "c1") });
  const video = p.clips.find((c) => c.id === "c2");
  const sound = p.clips.find((c) => c.groupId && c.id !== "c2");
  assert.equal(video?.start, 0);
  assert.equal(sound?.start, 0, "the sound moves with its video");
  assert.notEqual(sound?.trackId, "V");
  // A member on a locked track blocks making the track magnetic.
  const locked = {
    ...p,
    tracks: p.tracks.map((t) =>
      t.id === sound?.trackId ? { ...t, locked: true } : { ...t, magnetic: false },
    ),
  };
  assert.deepEqual(magneticBlockers(locked, "V"), [sound?.trackId]);
});

test("substituir mídia with the speech 30% longer pushes what comes after", () => {
  const p = project(
    [asset("v1", "video"), asset("m", "audio", 500)],
    [track("V", "video"), track("C", "video"), track("M", "audio", { music: true })],
    [
      clip("a", "v1", "V", 0, 10),
      clip("b", "v1", "V", 10, 10, { in: 20 }),
      clip("card", "v2", "C", 20, 5),
      clip("bed", "m", "M", 0, 25),
    ],
  );
  const r = replaceAsset(p, "v1", asset("n1", "video", 200), (s) => s * 1.3);
  assert.deepEqual(overlaps(r.project), []);
  const by = new Map(r.project.clips.map((c) => [c.id, c]));
  assert.ok(Math.abs((by.get("a")?.duration ?? 0) - 13) < 1e-6);
  assert.ok(Math.abs((by.get("b")?.start ?? 0) - 13) < 1e-6);
  assert.ok(Math.abs((by.get("b")?.duration ?? 0) - 13) < 1e-6);
  assert.ok(Math.abs((by.get("b")?.in ?? 0) - 26) < 1e-6);
  // The card after the speech, on another video track, keeps its place after it.
  assert.ok(Math.abs((by.get("card")?.start ?? 0) - 26) < 1e-6);
  // The music bed played to the end and follows the new end.
  assert.ok(Math.abs(clipEnd(by.get("bed") ?? clip("x", "m", "M", 0, 0)) - 31) < 1e-6);
  assert.deepEqual(r.warnings, []);
});

test("substituir mídia with the speech 20% shorter closes the holes", () => {
  const p = project(
    [asset("v1", "video")],
    [track("V", "video"), track("C", "video"), track("L", "video", { locked: true })],
    [
      clip("a", "v1", "V", 0, 10),
      clip("b", "v1", "V", 10, 10, { in: 20 }),
      clip("card", "v2", "C", 20, 5),
      clip("logo", "v2", "L", 20, 5),
    ],
  );
  const r = replaceAsset(p, "v1", asset("n1", "video", 200), (s) => s * 0.8);
  assert.deepEqual(overlaps(r.project), []);
  const by = new Map(r.project.clips.map((c) => [c.id, c]));
  assert.ok(Math.abs((by.get("a")?.duration ?? 0) - 8) < 1e-6);
  assert.ok(Math.abs((by.get("b")?.start ?? 0) - 8) < 1e-6);
  assert.ok(Math.abs((by.get("card")?.start ?? 0) - 16) < 1e-6);
  // The locked track stays, and the person is told.
  assert.equal(by.get("logo")?.start, 20);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /travada/);
});

test("substituir mídia moves a video and its separated sound once, together", () => {
  let p = project(
    [asset("v1", "video")],
    [track("V", "video"), track("C", "video")],
    [clip("a", "v1", "V", 0, 10), clip("card", "v2", "C", 10, 5)],
  );
  const d = detachAudio(p, "a");
  p = { ...p, clips: d.clips, tracks: d.tracks };
  const r = replaceAsset(p, "v1", asset("n1", "video", 200), (s) => s * 1.3);
  assert.deepEqual(overlaps(r.project), []);
  const replaced = r.project.clips.filter((c) => c.assetId === "n1");
  assert.equal(replaced.length, 2);
  for (const c of replaced) assert.ok(Math.abs(c.duration - 13) < 1e-6);
  const card = r.project.clips.find((c) => c.id === "card");
  assert.ok(Math.abs((card?.start ?? 0) - 13) < 1e-6, "pushed once, not twice");
});

test("substituir mídia carries the references to the media through the alignment", () => {
  const old: Asset = {
    ...asset("v1", "video"),
    cursorFx: {
      size: 1,
      smooth: 0.5,
      clicks: true,
      halo: false,
      hideIdle: false,
      pathEdits: [{ start: 10, end: 20, points: [{ t: 10, x: 1, y: 1 }] }],
    },
    cursor: "C:/x/v1.cursor.json",
    zooms: [{ id: "z", start: 10, end: 20, scale: 2, focus: [{ t: 10, x: 0.5, y: 0.5 }] }],
  } as Asset;
  const p: Project = {
    ...project([old, asset("img", "image")], [track("V", "video")], [clip("a", "v1", "V", 0, 30)]),
    background: { kind: "image", assetId: "v1" },
    voiceMasters: [
      {
        id: "vm",
        hash: "h",
        createdAt: 0,
        scope: "lesson",
        pieces: [
          {
            file: "C:/x/voz.wav",
            label: "Aula",
            start: 0,
            end: 30,
            sourceMap: [{ at: 0, duration: 30, start: 0, assetId: "v1", in: 10 }],
          },
        ],
      },
    ],
    proposals: [
      {
        id: "pr",
        projectId: "p",
        title: "t",
        revision: 0,
        createdAt: 0,
        author: "assistente",
        items: [
          {
            id: "i",
            start: 10,
            end: 12,
            reason: "r",
            status: "pending",
            anchors: [{ clipId: "a", assetId: "v1", start: 10, end: 12 }],
            wordKeys: ["v1:3"],
          },
        ],
      },
    ],
  } as Project;
  const next = { ...asset("n1", "video", 200), cursor: undefined };
  const r = replaceAsset(p, "v1", next, (s) => s * 2);
  const placed = r.project.assets.find((a) => a.id === "n1");
  assert.equal(r.project.background?.kind === "image" && r.project.background.assetId, "n1");
  const seg = r.project.voiceMasters?.[0].pieces[0].sourceMap[0];
  assert.equal(seg?.assetId, "n1");
  assert.equal(seg?.in, 20);
  const anchor = r.project.proposals?.[0].items[0].anchors[0];
  assert.deepEqual([anchor?.assetId, anchor?.start, anchor?.end], ["n1", 20, 24]);
  assert.deepEqual(r.project.proposals?.[0].items[0].wordKeys, []);
  assert.deepEqual([placed?.zooms?.[0].start, placed?.zooms?.[0].end], [20, 40]);
  // The recorded pointer cannot follow another timing: it is left out, with a warning.
  assert.equal(placed?.cursor, undefined);
  assert.ok(r.warnings.some((w) => /cursor/.test(w)));
  // A new recording with its own pointer keeps the drawing settings, paths on the new clock.
  const own = replaceAsset(p, "v1", { ...next, cursor: "C:/x/n1.cursor.json" }, (s) => s * 2);
  const edits = own.project.assets.find((a) => a.id === "n1")?.cursorFx?.pathEdits?.[0];
  assert.deepEqual([edits?.start, edits?.end, edits?.points[0].t], [20, 40, 20]);
  assert.deepEqual(own.warnings, []);
});

test("trimming a group skips locked members and stops where any member must", () => {
  const assets = new Map([
    ["v1", asset("v1", "video")],
    ["v2", asset("v2", "video")],
  ]);
  const g = [
    clip("x", "v1", "V", 0, 10, { groupId: "g" }),
    clip("y", "v1", "A", 0, 10, { groupId: "g" }),
    clip("z", "v2", "A", 12, 5),
    clip("w", "v1", "L", 0, 10, { groupId: "g" }),
  ];
  const after = trimClip(g[0], "end", 14, assets.get("v1"));
  const out = trimGroup(g, g[0], after, "end", trimClip, assets, 1 / 30, new Set(["L"]));
  const by = new Map(out.map((c) => [c.id, c]));
  // y runs into z at 12: the whole group stops there.
  assert.equal(clipEnd(by.get("x") ?? g[0]), 12);
  assert.equal(clipEnd(by.get("y") ?? g[1]), 12);
  assert.equal(clipEnd(by.get("w") ?? g[3]), 10, "the locked member stays");
  assert.deepEqual(overlaps({ clips: out }), []);
});

test("settle with 1,500 clips and 2,000 markers takes under 10 ms, a ripple too", (t) => {
  const tracks = [
    track("V", "video"),
    track("A", "audio"),
    track("M", "audio", { magnetic: true }),
  ];
  const clips: Clip[] = [];
  for (let i = 0; i < 1500; i++)
    clips.push(clip(`c${i}`, "s", ["V", "A", "M"][i % 3], Math.floor(i / 3) * 3, 2.5, { in: i }));
  const markers = Array.from({ length: 2000 }, (_, i) => ({ id: `m${i}`, t: i * 0.7, label: "x" }));
  let p: Project = { ...project([asset("s", "video", 5000)], tracks, clips), markers };
  p = settle(p, { ...p, clips: [...p.clips] });
  const median = (edit: (q: Project, k: number) => Project): number => {
    const times: number[] = [];
    for (let k = 0; k < 30; k++) {
      const changed = edit(p, k);
      const t0 = performance.now();
      p = settle(p, changed);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[15];
  };
  const volume = median((q, k) => ({
    ...q,
    clips: q.clips.map((c, i) => (i === 7 ? { ...c, volume: k % 2 ? 1 : 0.9 } : c)),
  }));
  t.diagnostic(`settle volume median: ${volume.toFixed(1)} ms`);
  assert.ok(volume < 10, `${volume.toFixed(1)} ms per commit`);
  const before = p.markers?.find((m) => m.id === "m100")?.t ?? 0;
  const ripple = median((q, k) => ({
    ...q,
    clips: q.clips.map((c) => (c.start > 4 ? { ...c, start: c.start + (k % 2 ? -0.5 : 0.5) } : c)),
  }));
  t.diagnostic(`settle ripple median: ${ripple.toFixed(1)} ms`);
  assert.ok(ripple < 10, `${ripple.toFixed(1)} ms per ripple`);
  // An even number of pushes and pulls: the marker on the video is back where it was.
  assert.ok(Math.abs((p.markers?.find((m) => m.id === "m100")?.t ?? 0) - before) < 1e-6);
});

test("a region that follows the recording goes with an automatic zoom passing over it", () => {
  const screen: Asset = {
    ...asset("tela", "video", 20),
    zooms: [
      {
        id: "z",
        start: 4,
        end: 10,
        scale: 2,
        auto: true,
        ease: 0.5,
        focus: [{ t: 4, x: 0.25, y: 0.25 }],
      },
    ],
  };
  const fx = {
    kind: "blur" as const,
    rect: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
    feather: 0,
    strength: 0.5,
  };
  const region = clip("r", "fx", "R", 0, 20, { regionFx: { ...fx, follow: true } });
  const p = project(
    [screen, asset("fx", "image", 0)],
    [track("R", "video"), track("V", "video")],
    [region, clip("s", "tela", "V", 0, 20)],
  );
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  // Before the zoom: where it was drawn.
  const rest = regionRectAt(p, region, 2);
  assert.ok(rest);
  assert.ok(near(rest.rect.x, 384) && near(rest.rect.w, 192), JSON.stringify(rest.rect));
  // In the zoom (200% on the top left quarter): twice the size, around the same content.
  const zoomed = regionRectAt(p, region, 7);
  assert.ok(zoomed);
  assert.ok(near(zoomed.rect.x, 768) && near(zoomed.rect.y, 432), JSON.stringify(zoomed.rect));
  assert.ok(near(zoomed.rect.w, 384) && near(zoomed.rect.h, 216));
  assert.ok(near(zoomed.scale, 2));
  // Halfway in, between the two.
  const going = regionRectAt(p, region, 4.25);
  assert.ok(going && going.rect.x > 384 && going.rect.x < 768);
  // A region that stays on the frame over that zoom is pointed out in the panel.
  const still = { ...region, regionFx: fx };
  assert.equal(zoomUnder({ ...p, clips: [still, p.clips[1]] }, still), true);
  assert.equal(zoomUnder(p, region), false);
  // A zoom layer between them magnifies it too.
  const layered = project(
    [screen, asset("fx", "image", 0)],
    [track("R", "video"), track("Z", "video"), track("V", "video")],
    [
      region,
      clip("zl", "fx", "Z", 0, 20, {
        zoomLayer: { scale: 2, x: 0.5, y: 0.5, zoomIn: false, zoomOut: false },
      }),
      clip("s", "tela", "V", 0, 20),
    ],
  );
  const both = regionRectAt(layered, region, 2);
  assert.ok(both);
  assert.ok(near(both.rect.w, 384), JSON.stringify(both.rect));
});

test("the preview's color matrix is eq's: contrast and brightness on the light only", () => {
  const color = { contrast: 1.4, brightness: 0.05, saturation: 0.7 };
  const { matrix } = colorSvg(color);
  const [wr, wg, wb] = LUMA;
  for (const rgb of [
    [0.9, 0.2, 0.1],
    [0.1, 0.6, 0.9],
    [0.5, 0.5, 0.5],
  ]) {
    // eq on YUV: Y' = c(Y − ½) + ½ + b, the color around it scaled by s.
    const y = wr * rgb[0] + wg * rgb[1] + wb * rgb[2];
    const y2 = color.contrast * (y - 0.5) + 0.5 + color.brightness;
    const want = rgb.map((v) => y2 + color.saturation * (v - y));
    const got = [0, 1, 2].map(
      (row) =>
        matrix[row * 5] * rgb[0] +
        matrix[row * 5 + 1] * rgb[1] +
        matrix[row * 5 + 2] * rgb[2] +
        matrix[row * 5 + 4],
    );
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i] - want[i]) < 1e-9, `${rgb}: ${got}`);
  }
  // A gray stays gray whatever the saturation: contrast does not tint it.
  const gray = colorSvg({ contrast: 2 }).matrix;
  assert.ok(Math.abs(gray[0] + gray[1] + gray[2] - 2) < 1e-9);
});

test("the preview's blur stops where the export's does, at half the region", () => {
  const fx = {
    kind: "blur" as const,
    rect: { x: 0, y: 0, w: 0.02, h: 0.02 },
    feather: 0,
    strength: 1,
  };
  // A small region on a 1080p frame: boxblur cannot go past half of it.
  const small = regionStrength(fx, 1080, { w: 20, h: 20 });
  assert.equal(small.radius, 9);
  // Bigger: the strength's radius, the same at any size of the frame.
  const big = regionStrength(fx, 1080, { w: 400, h: 400 });
  assert.equal(big.radius, 32);
  assert.equal(regionStrength(fx, 540, { w: 200, h: 200 }).radius, 16);
});

test("Separar o som says why it cannot, case by case", () => {
  const p = project(
    [asset("v", "video"), { ...asset("mudo", "video"), hasAudio: false }, asset("a", "audio")],
    [track("V", "video"), track("L", "video", { locked: true })],
    [
      clip("ok", "v", "V", 0, 5),
      clip("semSom", "mudo", "V", 5, 5),
      clip("zerado", "v", "V", 10, 5, { volume: 0 }),
      clip("som", "a", "V", 15, 5),
      clip("preso", "v", "L", 0, 5),
    ],
  );
  assert.equal(detachProblem(p, "ok"), null);
  assert.match(detachProblem(p, "semSom") ?? "", /não tem som/);
  assert.match(detachProblem(p, "zerado") ?? "", /mudo/);
  assert.match(detachProblem(p, "som") ?? "", /Só um clipe de vídeo/);
  assert.match(detachProblem(p, "preso") ?? "", /travada/);
});
