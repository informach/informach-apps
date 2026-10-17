import assert from "node:assert/strict";
import { test } from "node:test";
import { ExportQueue } from "../src/shared/exportQueue.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";

const project: Project = {
  id: "project",
  version: 1,
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 640, height: 360, fps: 30 },
  tracks: [],
  assets: [],
  clips: [],
};
const spec: ExportSpec = {
  outPath: "C:/exports/a.mp4",
  width: 640,
  height: 360,
  fps: 30,
  videoBitrate: 3500,
  normalizeLoudness: false,
  encoder: "x264",
};
const item = (id: string) => ({
  id,
  project: structuredClone(project),
  spec: { ...spec, outPath: `C:/exports/${id}.mp4` },
  captions: true,
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("exports run serially and retain their project and settings snapshots", async () => {
  const seen: string[] = [];
  const release: (() => void)[] = [];
  const q = new ExportQueue(
    async (i, _signal, status) => {
      seen.push(i.id);
      status("exporting", "Exportando");
      await new Promise<void>((resolve) => release.push(resolve));
      assert.equal(i.project.name, "Aula");
      assert.equal(i.spec.videoBitrate, 3500);
    },
    () => {},
  );
  const first = item("one");
  q.add(first);
  first.project.name = "Outro projeto";
  first.spec.videoBitrate = 20000;
  const second = item("two");
  q.add(second);
  second.project.name = "Editado depois do envio";
  assert.deepEqual(seen, ["one"]);
  assert.equal(q.items[1].state, "waiting");
  release.shift()!();
  await tick();
  assert.deepEqual(seen, ["one", "two"]);
  assert.equal(q.items[0].state, "done");
  release.shift()!();
  await tick();
  assert.equal(q.items[1].state, "done");
});

test("cancelling queued and active exports does not block the next item", async () => {
  const seen: string[] = [];
  const q = new ExportQueue(
    async (i, signal) => {
      seen.push(i.id);
      if (i.id === "one")
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
    },
    () => {},
  );
  q.add(item("one"));
  q.add(item("two"));
  q.add(item("three"));
  q.cancel("two");
  q.cancel("one");
  await tick();
  assert.deepEqual(seen, ["one", "three"]);
  assert.deepEqual(
    q.items.map((i) => i.state),
    ["cancelled", "cancelled", "done"],
  );
});

test("a failed export does not block subsequent jobs and runner mutations stay isolated", async () => {
  const q = new ExportQueue(
    async (i) => {
      i.project.name = "mutated preparation";
      if (i.id === "one") throw new Error("Mídia ausente");
    },
    () => {},
  );
  q.add(item("one"));
  q.add(item("two"));
  await tick();
  assert.equal(q.items[0].state, "error");
  assert.equal(q.items[0].message, "Mídia ausente");
  assert.equal(q.items[0].project.name, "Aula");
  assert.equal(q.items[1].state, "done");
});

test("duplicate output paths are rejected while the destination is reserved", async () => {
  let release!: () => void;
  const q = new ExportQueue(
    async () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    () => {},
  );
  q.add(item("one"));
  const same = item("two");
  same.spec.outPath = "c:\\EXPORTS\\ONE.mp4";
  assert.throws(() => q.add(same), /Já existe/);
  q.remove("one");
  assert.equal(q.items.length, 1);
  release();
  await tick();
  q.remove("one");
  assert.equal(q.items.length, 0);
});

test("a queued export keeps the cursor positions as a typed array", () => {
  const q = new ExportQueue(
    () => new Promise<void>(() => {}),
    () => {},
  );
  const positions = Int32Array.of(1, 2, 3, 4);
  q.add({
    ...item("cursor"),
    spec: { ...spec, cursors: { a: { sprite: "C:/cache/a.webm", size: 32, fps: 30, positions } } },
  });
  const kept = q.items[0].spec.cursors?.a.positions;
  assert.ok(kept instanceof Int32Array);
  assert.notEqual(kept, positions, "the queue owns its copy");
  assert.deepEqual(Array.from(kept), [1, 2, 3, 4]);
});
