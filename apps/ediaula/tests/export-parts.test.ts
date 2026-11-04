import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Conflict,
  checkParts,
  clock,
  partFiles,
  placeParts,
  runExportParts,
  trackParts,
} from "../src/shared/exportParts.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:\\aulas\\${id}.mp4`,
  kind: "video",
  duration: 600,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const recording = (id: string): Asset =>
  asset(id, { recording: { id: `2026-11-02 ${id}`, role: "screen" } });
const track = (id: string): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
});
let n = 0;
const clip = (assetId: string, trackId: string, start: number, end: number): Clip => ({
  id: `c${++n}`,
  assetId,
  trackId,
  start,
  in: 0,
  duration: end - start,
  volume: 1,
});

/**
 * The screen track (Faixa 3) of "Aula02 gravação automática" as it is on 04/11/2026: a b-roll,
 * then five screen recordings, each cut in pieces by the cleanup, a held frame of the third one in
 * between, and a pause of 1.5 s before the fourth. Times from the lesson file.
 */
const AULA02: [string, number, number][] = [
  ["beroll", 2.5, 20.633],
  ["t0546", 20.633, 30.733],
  ["t0547", 30.733, 72.533],
  ["t0547", 72.533, 74.793],
  ["t0547", 74.793, 77.393],
  ["t0547", 77.393, 78.563],
  ["t0547", 78.563, 80.996],
  ["t0551", 80.996, 161.963],
  ["t0551", 161.963, 162.963],
  ["t0551", 162.963, 165.697],
  ["t0551", 165.697, 168.567],
  ["t0551", 168.567, 223.867],
  ["t0551", 223.867, 226.297],
  ["t0551", 226.297, 231],
  ["still", 231, 233.5],
  ["t0551", 233.5, 235.3],
  ["t0551", 235.3, 237.606],
  ["t0555", 239.13, 303.43],
  ["t0555", 303.43, 304.43],
  ["t0555", 304.43, 343.63],
  ["t0555", 343.63, 344.74],
  ["t0555", 344.74, 351.24],
  ["t0555", 351.24, 352.24],
  ["t0555", 352.24, 397.34],
  ["t0555", 397.34, 398.66],
  ["t0555", 398.66, 401.571],
  ["t0556", 401.571, 465.438],
  ["t0556", 465.438, 466.438],
  ["t0556", 466.438, 467.438],
  ["t0556", 467.438, 469.219],
];
function aula02(): Project {
  return {
    version: 1,
    id: "aula02",
    name: "Aula02 gravação automática",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("beroll"),
      ...["t0546", "t0547", "t0551", "t0555", "t0556"].map(recording),
      asset("still", { kind: "image", generated: "still", still: { assetId: "t0551", t: 150 } }),
      asset("narr", { kind: "audio", hasVideo: false }),
    ],
    tracks: [track("f3"), { ...track("narr"), kind: "audio" }],
    clips: [
      ...AULA02.map(([a, start, end]) => clip(a, "f3", start, end)),
      // The narration goes until 7:47.7 and the lesson until 7:52.6: not the track's.
      clip("narr", "narr", 2.5, 472.633),
    ],
  };
}

test('split "clips" on the screen track of Aula02: 5 parts, one per recording, 0:00 to 7:49.2', () => {
  const r = trackParts(aula02(), "f3");
  assert.ok(r.ok);
  assert.deepEqual(
    r.parts.map((p) => `${clock(p.from)}–${clock(p.to)}`),
    ["0:00.0–0:30.7", "0:30.7–1:21.0", "1:21.0–3:59.1", "3:59.1–6:41.6", "6:41.6–7:49.2"],
  );
  assert.deepEqual(partFiles(r.parts, aula02().name, "youtube", false), [
    "Aula02 gravação automática - Parte 1.mp4",
    "Aula02 gravação automática - Parte 2.mp4",
    "Aula02 gravação automática - Parte 3.mp4",
    "Aula02 gravação automática - Parte 4.mp4",
    "Aula02 gravação automática - Parte 5.mp4",
  ]);
});

test("split: a track of loose clips gives one part each; a group is one part", () => {
  const p: Project = {
    ...aula02(),
    clips: [
      clip("beroll", "f3", 0, 10),
      { ...clip("beroll", "f3", 10, 20), groupId: "g" },
      { ...clip("beroll", "f3", 20, 30), groupId: "g" },
      clip("beroll", "f3", 32, 40),
    ],
  };
  const r = trackParts(p, "f3");
  assert.ok(r.ok);
  assert.deepEqual(
    r.parts.map((x) => [x.from, x.to]),
    [
      [0, 10],
      [10, 32],
      [32, 40],
    ],
  );
  assert.equal(trackParts(p, "nada").ok, false);
  assert.equal(trackParts({ ...p, clips: [] }, "f3").ok, false);
});

test("names: a part's own name replaces the automatic one; two alike get (2); vertical and audio", () => {
  assert.deepEqual(
    partFiles(
      [
        { from: 0, to: 5, name: "Abertura" },
        { from: 5, to: 9 },
        { from: 9, to: 12, name: "abertura" },
      ],
      "Aula: 2",
      "youtube",
      false,
    ),
    ["Abertura.mp4", "Aula 2 - Parte 2.mp4", "abertura (2).mp4"],
  );
  assert.deepEqual(partFiles([{ from: 0, to: 5 }], "Aula", "reels", true), [
    "Aula - Parte 1 (vertical).mp4",
  ]);
  assert.deepEqual(partFiles([{ from: 0, to: 5 }], "Aula", "audio", false), ["Aula - Parte 1.mp3"]);
});

test("parts outside the lesson or shorter than half a second are refused as a whole", () => {
  assert.equal(checkParts([{ from: 0, to: 10 }], 60).ok, true);
  const r = checkParts(
    [
      { from: 0, to: 10 },
      { from: 61, to: 70 },
      { from: 5, to: 5.2 },
    ],
    60,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /2 \(1:01\.0–1:10\.0\), 3 \(0:05\.0–0:05\.2\)/);
  assert.equal(checkParts([], 60).ok, false);
});

/** A folder of the disk: the files in `there` exist. */
const disk = (there: string[]) => async (paths: string[]) =>
  paths.map((p) => there.some((t) => t.toLowerCase() === p.toLowerCase()));

test("files already in the folder: asked once; replace all, or the first free (n) for each", async () => {
  const files = ["Aula - Parte 1.mp4", "Aula - Parte 2.mp4", "Aula - Parte 3.mp4"];
  const there = [
    "D:\\Saída\\Aula - Parte 1.mp4",
    "D:\\Saída\\Aula - Parte 3.mp4",
    "D:\\Saída\\Aula - Parte 3 (2).mp4",
  ];
  const asked: string[][] = [];
  const ask = (answer: Conflict | null) => async (names: string[]) => {
    asked.push(names);
    return answer;
  };
  const suffix = await placeParts("D:\\Saída\\", files, {
    exists: disk(there),
    queued: new Set(),
    ask: ask("suffix"),
  });
  assert.deepEqual(asked, [["Aula - Parte 1.mp4", "Aula - Parte 3.mp4"]], "one question");
  assert.deepEqual(suffix?.paths, [
    "D:\\Saída\\Aula - Parte 1 (2).mp4",
    "D:\\Saída\\Aula - Parte 2.mp4",
    "D:\\Saída\\Aula - Parte 3 (3).mp4",
  ]);
  const replace = await placeParts("D:\\Saída", files, {
    exists: disk(there),
    queued: new Set(),
    ask: ask("replace"),
  });
  assert.deepEqual(
    replace?.paths,
    files.map((f) => `D:\\Saída\\${f}`),
  );
  assert.deepEqual(replace?.replaced, [there[0], there[1]]);
  assert.equal(
    await placeParts("D:\\Saída", files, {
      exists: disk(there),
      queued: new Set(),
      ask: ask(null),
    }),
    null,
  );
  // Nothing there: no question. A path the queue is writing always gets a suffix.
  asked.length = 0;
  const queued = await placeParts("D:\\Saída", files, {
    exists: disk([]),
    queued: new Set(["d:\\saída\\aula - parte 2.mp4"]),
    ask: ask("replace"),
  });
  assert.deepEqual(asked, []);
  assert.equal(queued?.paths[1], "D:\\Saída\\Aula - Parte 2 (2).mp4");
});

test("runExportParts: one check, one folder, one question, every part in the queue at once", async () => {
  const parts = [
    { from: 0, to: 30.7 },
    { from: 30.7, to: 81 },
  ];
  const files = partFiles(parts, "Aula", "youtube", false);
  const calls: string[] = [];
  const queue: { part: (typeof parts)[number]; outPath: string }[] = [];
  const steps = {
    check: async () => {
      calls.push("check");
      return [];
    },
    confirm: async () => true,
    pickFolder: async () => {
      calls.push("folder");
      return "D:\\Aulas";
    },
    exists: disk([]),
    queued: () => new Set<string>(),
    ask: async () => "suffix" as const,
    enqueue: (part: (typeof parts)[number], outPath: string) => {
      queue.push({ part, outPath });
      return `export-${queue.length}`;
    },
  };
  const r = await runExportParts(steps, parts, files);
  assert.ok(r.ok);
  assert.deepEqual(calls, ["check", "folder"]);
  assert.deepEqual(
    queue.map((q) => q.outPath),
    ["D:\\Aulas\\Aula - Parte 1.mp4", "D:\\Aulas\\Aula - Parte 2.mp4"],
  );
  assert.deepEqual(
    r.parts.map((p) => p.id),
    ["export-1", "export-2"],
  );
  // The folder dialog closed: nothing in the queue.
  queue.length = 0;
  const closed = await runExportParts({ ...steps, pickFolder: async () => null }, parts, files);
  assert.equal(closed.ok, false);
  assert.equal(queue.length, 0);
});
