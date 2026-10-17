import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { findRelinked, relinkRequestSchema } from "../src/main/relink.ts";
import { fileName, relinkMismatch } from "../src/shared/relink.ts";
import type { Asset, ProbeResult } from "../src/shared/types.ts";

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

test("a folder search finds recordings with the same name apart by their size", async () => {
  for (const [dir, name, bytes] of [
    ["2026-10-16", "tela.mp4", 5],
    ["2026-10-17", "tela.mp4", 9],
    ["2026-10-17", "Camera.MP4", 4],
    [".backups", "fala.wav", 3],
  ] as const) {
    await mkdir(join(root, "Gravações", dir), { recursive: true });
    await writeFile(join(root, "Gravações", dir, name), Buffer.alloc(bytes));
  }
  const wanted = relinkRequestSchema.parse([
    { key: "screen", name: "tela.mp4", size: 9 },
    { key: "old", name: "tela.mp4", size: 5 },
    { key: "camera", name: "camera.mp4", size: 4 },
    { key: "voice", name: "fala.wav", size: 3 },
    { key: "nope", name: "tela.mp4", size: 1 },
  ]);
  const found = await findRelinked(root, wanted);
  assert.deepEqual(found, {
    screen: join(root, "Gravações", "2026-10-17", "tela.mp4"),
    old: join(root, "Gravações", "2026-10-16", "tela.mp4"),
    camera: join(root, "Gravações", "2026-10-17", "Camera.MP4"),
  });
  assert.throws(() => relinkRequestSchema.parse([{ key: "x", name: "a.mp4", size: -1 }]));
});
