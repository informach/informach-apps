import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { VideoOptionsStore } from "../main/video-options.ts";
import { defaultVideoOptions, videoOptionsSchema } from "./video-options.ts";

test("opções de vídeo começam sem áudio e com contagem de 3 s", () => {
  assert.deepEqual(defaultVideoOptions(), {
    version: 1,
    microphone: { enabled: false, volume: 100, muted: false, deviceId: "" },
    system: { enabled: false, volume: 100, muted: false },
    countdown: 3,
  });
});

test("opções de vídeo recusam volumes, contagens e campos fora do contrato", () => {
  for (const patch of [
    { countdown: 11 },
    { countdown: 1.5 },
    { microphone: { volume: 201 } },
    { system: { volume: -1 } },
    { system: { deviceId: "x" } },
    { extra: true },
  ])
    assert.throws(() => videoOptionsSchema.parse(patch));
});

test("o arquivo ilegível é preservado até a pessoa salvar", async () => {
  const root = await mkdtemp(join(tmpdir(), "edicaptura-video-options-"));
  try {
    const file = join(root, "video-options.json");
    await writeFile(file, "{quebrado");
    const store = new VideoOptionsStore(file);
    await store.load();
    assert.ok(store.error);
    assert.deepEqual(store.read(), defaultVideoOptions());
    assert.equal(await readFile(file, "utf8"), "{quebrado");
    const saved = await store.save({
      ...defaultVideoOptions(),
      microphone: { enabled: true, volume: 80, muted: false, deviceId: "mic-1" },
      countdown: 0,
    });
    assert.equal(saved.microphone.volume, 80);
    const again = new VideoOptionsStore(file);
    await again.load();
    assert.equal(again.error, null);
    assert.deepEqual(again.read(), saved);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
