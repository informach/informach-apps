import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { findCompanions, findRelinked, relinkRequestSchema } from "../src/main/relink.ts";
import { fileName, redrawPlan, relinkMismatch } from "../src/shared/relink.ts";
import type { Asset, ProbeResult, Project } from "../src/shared/types.ts";

const root = await mkdtemp(join(tmpdir(), "ediaula-relink-"));
after(() => rm(root, { recursive: true }));

const screen: Asset = {
  id: "screen",
  name: "Tela 17-10",
  path: "C:\\Users\\prof\\Documents\\EdiAula\\Gravações\\2026-10-17\\tela.mp4",
  kind: "video",
  duration: 1620,
  width: 2560,
  height: 1440,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 9,
  proxyStatus: "ready",
};
const probe = (changes: Partial<ProbeResult> = {}): ProbeResult => ({
  kind: "video",
  duration: 1620.3,
  width: 2560,
  height: 1440,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 9,
  ...changes,
});

test("a found file stands in for a missing one only when it is the same media", () => {
  assert.equal(fileName(screen.path), "tela.mp4");
  assert.equal(fileName("/home/prof/aula/camera.mp4"), "camera.mp4");
  assert.equal(relinkMismatch(screen, probe()), null);
  assert.match(relinkMismatch(screen, probe({ kind: "audio" })) ?? "", /tipo/);
  assert.match(
    relinkMismatch(screen, probe({ duration: 1619.2 })) ?? "",
    /duração .*1619,2 s em vez de 1620,0 s/,
  );
  assert.match(
    relinkMismatch(screen, probe({ width: 1920, height: 1080 })) ?? "",
    /1920×1080 em vez de 2560×1440/,
  );
  const image = { ...screen, kind: "image" as const, duration: 0 };
  assert.equal(relinkMismatch(image, probe({ kind: "image", duration: 0.04 })), null);
});

test("a folder search finds recordings apart by size, opens only media and keeps only the same media", async () => {
  const at = (...parts: string[]): string => join(root, "Gravações", ...parts);
  for (const [dir, name, bytes] of [
    ["2026-10-16", "tela.mp4", 5],
    ["2026-10-16", "cursor.json", 2],
    ["2026-10-17", "tela.mp4", 9],
    ["2026-10-17", "cursor.json", 2],
    ["2026-10-17", "Camera.MP4", 4],
    ["2026-10-17", "notas.txt", 4],
    ["2026-10-18", "outra.mp4", 7],
    [".backups", "fala.wav", 3],
  ] as const) {
    await mkdir(at(dir), { recursive: true });
    await writeFile(at(dir, name), Buffer.alloc(bytes));
  }
  const media = { kind: "video" as const, duration: 1620, width: 2560, height: 1440 };
  const old = "C:/Gravações/2026-10-17";
  const wanted = relinkRequestSchema.parse([
    {
      key: "screen",
      name: "tela.mp4",
      size: 9,
      ...media,
      oldPath: `${old}/tela.mp4`,
      companions: [`${old}/cursor.json`],
    },
    { key: "old", name: "tela.mp4", size: 5, ...media, oldPath: "C:/x/tela.mp4", companions: [] },
    {
      key: "camera",
      name: "camera.mp4",
      size: 4,
      ...media,
      oldPath: "C:/x/camera.mp4",
      companions: [],
    },
    {
      key: "notes",
      name: "notas.txt",
      size: 4,
      ...media,
      oldPath: "C:/x/notas.txt",
      companions: [],
    },
    { key: "voice", name: "fala.wav", size: 3, ...media, oldPath: "C:/x/fala.wav", companions: [] },
    {
      key: "other",
      name: "outra.mp4",
      size: 7,
      ...media,
      oldPath: "C:/x/outra.mp4",
      companions: [],
    },
    { key: "nope", name: "tela.mp4", size: 1, ...media, oldPath: "C:/x/tela.mp4", companions: [] },
  ]);
  const probed: string[] = [];
  const result = await findRelinked(root, wanted, async (path) => {
    probed.push(path);
    // outra.mp4 has the right name and size but is a different video.
    return probe({ size: 0, ...(path.endsWith("outra.mp4") ? { duration: 30 } : {}) });
  });
  assert.deepEqual(result.found, {
    screen: {
      path: at("2026-10-17", "tela.mp4"),
      size: 9,
      companions: { [`${old}/cursor.json`]: at("2026-10-17", "cursor.json") },
    },
    old: { path: at("2026-10-16", "tela.mp4"), size: 5, companions: {} },
    camera: { path: at("2026-10-17", "Camera.MP4"), size: 4, companions: {} },
  });
  assert.equal(result.refused, 1);
  assert.equal(result.truncated, false);
  assert.ok(
    probed.every((p) => /[.](mp4|MP4)$/.test(p)),
    "only media files are opened",
  );
  for (const bad of [
    { size: 0 },
    { size: -1 },
    { companions: Array.from({ length: 9 }, () => "C:/x/c.json") },
  ])
    assert.throws(() => relinkRequestSchema.parse([{ ...wanted[1], ...bad }]));
});

test("the cursor data follows the recording only from its own folder and only as JSON", async () => {
  const dir = join(root, "nova");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "tela.mp4"), Buffer.alloc(3));
  await writeFile(join(dir, "cursor.json"), "{}");
  await writeFile(join(dir, "segredo.txt"), "x");
  const found = await findCompanions("C:/velha/tela.mp4", join(dir, "tela.mp4"), [
    "C:/velha/cursor.json",
    "C:/velha/segredo.txt",
    "C:/outra/cursor.json",
    "C:/velha/sumiu.json",
  ]);
  assert.deepEqual(found, { "C:/velha/cursor.json": join(dir, "cursor.json") });
});

const generatedLesson = (assets: Asset[]): Project => ({
  version: 1,
  id: "p1",
  name: "Aula 3",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1080, height: 1920, fps: 30 },
  assets,
  tracks: [
    { id: "a", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
  ],
  clips: [],
});
const generated = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
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

test("the editor's own pictures are drawn again from what made them", () => {
  const project: Project = {
    ...generatedLesson([]),
    assets: [
      generated("tela", { cursor: "C:/aulas/cursor.json" }),
      generated("nota", { kind: "image", duration: 0, generated: "annotation" }),
      generated("vazio", { kind: "image", duration: 0, generated: "effect" }),
      generated("quadro", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "tela", t: 12.5 },
      }),
      generated("perdido", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "sumiu", t: 1 },
      }),
      generated("avatar", {
        key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
      }),
      generated("quadro-avatar", {
        kind: "image",
        duration: 0,
        generated: "still",
        still: { assetId: "avatar", t: 3 },
      }),
    ],
    clips: [
      {
        id: "n",
        assetId: "nota",
        trackId: "a",
        start: 0,
        in: 0,
        duration: 3,
        volume: 1,
        annotation: { kind: "balloon", text: "Oi", color: "#3D6BFF" },
      },
    ],
  };
  const asset = (id: string): Asset => {
    const a = project.assets.find((x) => x.id === id);
    assert.ok(a, id);
    return a;
  };
  assert.equal(redrawPlan(project, asset("nota"))?.how, "annotation");
  assert.deepEqual(redrawPlan(project, asset("vazio")), { how: "effect" });
  const still = redrawPlan(project, asset("quadro"));
  assert.ok(still?.how === "still" && still.source.id === "tela" && still.t === 12.5);
  assert.equal(redrawPlan(project, asset("perdido")), null, "the source is gone");
  assert.equal(
    redrawPlan(project, asset("quadro-avatar")),
    null,
    "a cut-out avatar waits for its transparent copy",
  );
  assert.equal(redrawPlan(project, generated("solta", { generated: "annotation" })), null);
  assert.equal(
    redrawPlan(project, asset("tela")),
    null,
    "media of the lesson is reconnected, not drawn",
  );
});
