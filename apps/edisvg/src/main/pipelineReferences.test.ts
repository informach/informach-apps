import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { loadReferences, saveReference } from "./pipelineReferences.ts";

let root = "";
before(async () => {
  root = await mkdtemp(join(tmpdir(), "edisvg-references-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

const project = "project-aula-3";
const narration = (clipId: string, lessonStart = 135.5) => ({
  clipId,
  name: "Narração · Demonstração",
  duration: 9,
  lessonStart,
  lines: [{ text: "Abra a aba de programação.", start: 0.8, end: 3.2 }],
});
const video = (artboardId: string, offset = 0.8) => ({ artboardId, offset, duration: 25 });
const plain = <T extends { bytes: Uint8Array }>(value: T) => ({
  ...value,
  bytes: [...value.bytes],
});

test("each run of a project keeps its own narration and video; a run again replaces only its own", async () => {
  assert.deepEqual(await loadReferences(root, project), { narrations: [], videos: [] });
  // A full-screen scene (narration only) and a demonstration over the screen (narration and video).
  await saveReference(
    root,
    project,
    "narration",
    new Uint8Array([1]),
    narration("animation-cena", 10),
  );
  await saveReference(
    root,
    project,
    "narration",
    new Uint8Array([2]),
    narration("animation-demo", 40),
  );
  await saveReference(root, project, "video", new Uint8Array([9, 9]), video("artboard-camada"));
  const back = await loadReferences(root, project);
  assert.deepEqual(back.narrations.map(plain), [
    { ...narration("animation-cena", 10), bytes: [1] },
    { ...narration("animation-demo", 40), bytes: [2] },
  ]);
  assert.deepEqual(back.videos.map(plain), [{ ...video("artboard-camada"), bytes: [9, 9] }]);
  // The demonstration ran again: its narration is replaced, the scene's stays.
  await saveReference(
    root,
    project,
    "narration",
    new Uint8Array([3]),
    narration("animation-demo", 41),
  );
  const again = await loadReferences(root, project);
  assert.deepEqual(
    again.narrations.map((n) => [n.clipId, n.lessonStart, [...n.bytes]]),
    [
      ["animation-cena", 10, [1]],
      ["animation-demo", 41, [3]],
    ],
  );
  // Another project has its own.
  assert.deepEqual(await loadReferences(root, "project-outra"), { narrations: [], videos: [] });
});

test("the single narration and video an earlier EdiSVG kept are read, and a newer one wins", async () => {
  const folder = join(root, "project-antigo");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "video.bin"), new Uint8Array([5, 5]));
  await writeFile(
    join(folder, "video.json"),
    JSON.stringify({ ...video("artboard-camada"), byteLength: 2 }),
  );
  await writeFile(join(folder, "narration.bin"), new Uint8Array([6]));
  await writeFile(
    join(folder, "narration.json"),
    JSON.stringify({ ...narration("animation-demo"), byteLength: 1 }),
  );
  const old = await loadReferences(root, "project-antigo");
  assert.deepEqual(old.videos.map(plain), [{ ...video("artboard-camada"), bytes: [5, 5] }]);
  assert.deepEqual(old.narrations.map(plain), [{ ...narration("animation-demo"), bytes: [6] }]);
  await saveReference(
    root,
    "project-antigo",
    "video",
    new Uint8Array([7]),
    video("artboard-camada", 2),
  );
  assert.deepEqual(
    (await loadReferences(root, "project-antigo")).videos.map((v) => [v.offset, [...v.bytes]]),
    [[2, [7]]],
  );
});

test("a reference left half written is not brought back", async () => {
  await saveReference(
    root,
    "project-meio",
    "video",
    new Uint8Array([1, 2, 3, 4]),
    video("artboard-a"),
  );
  // The bytes changed after the description: the size no longer matches.
  await writeFile(join(root, "project-meio", "video-artboard-a.bin"), new Uint8Array([1]));
  assert.deepEqual((await loadReferences(root, "project-meio")).videos, []);
});

test("ids, kinds and descriptions from the window are checked", async () => {
  const bytes = new Uint8Array([1]);
  const v = video("artboard-a");
  await assert.rejects(saveReference(root, "../fora", "video", bytes, v), /Projeto inválido/);
  await assert.rejects(saveReference(root, project, "imagem", bytes, v), /Referência inválida/);
  await assert.rejects(saveReference(root, project, "video", "texto", v), /vazia ou grande/);
  await assert.rejects(
    saveReference(root, project, "video", new Uint8Array(), v),
    /vazia ou grande/,
  );
  await assert.rejects(saveReference(root, project, "video", bytes, { ...v, extra: 1 }));
  // An id that would leave the folder never becomes a file name.
  await assert.rejects(saveReference(root, project, "video", bytes, video("artboard-../../x")));
  await assert.rejects(loadReferences(root, "C:\\outro"), /Projeto inválido/);
});

test("only the projects used most recently, and each one's newest runs, keep their references", async () => {
  const store = await mkdtemp(join(tmpdir(), "edisvg-references-prune-"));
  try {
    for (let i = 0; i < 12; i++) {
      const id = `project-p${String(i).padStart(2, "0")}`;
      await saveReference(store, id, "video", new Uint8Array([i + 1]), video("artboard-a"));
      const when = new Date(Date.UTC(2026, 10, 1, 0, i));
      await utimes(join(store, id), when, when);
    }
    // Opening an old one makes it recent; the next save prunes the least recent.
    assert.equal((await loadReferences(store, "project-p00")).videos.length, 1);
    await saveReference(store, "project-p12", "video", new Uint8Array([1]), video("artboard-a"));
    const left = (await readdir(store)).sort();
    assert.equal(left.length, 12);
    assert.ok(left.includes("project-p00"));
    assert.ok(left.includes("project-p12"));
    assert.ok(!left.includes("project-p01"));

    // A project keeps its 24 newest videos.
    for (let i = 0; i < 26; i++) {
      await saveReference(
        store,
        "project-muitos",
        "video",
        new Uint8Array([1]),
        video(`artboard-v${i}`),
      );
      const when = new Date(Date.UTC(2026, 10, 2, 0, i));
      await utimes(join(store, "project-muitos", `video-artboard-v${i}.json`), when, when);
    }
    const videos = (await loadReferences(store, "project-muitos")).videos.map((v) => v.artboardId);
    assert.equal(videos.length, 24);
    assert.ok(videos.includes("artboard-v25"));
    assert.ok(!videos.includes("artboard-v0"));
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});
