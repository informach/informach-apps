import assert from "node:assert/strict";
import { test } from "node:test";
import { validateIpcValues } from "../../../packages/edi-desktop/src/files.ts";
import { ExportQueue } from "../src/shared/exportQueue.ts";
import { exportSpecSchema } from "../src/shared/project-schema.ts";
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

test("cursor positions stay a typed array from the queue to the main process", () => {
  let started: ExportSpec | undefined;
  const q = new ExportQueue(
    async (i) => {
      started = i.spec;
    },
    () => {},
  );
  const positions = Int32Array.of(1, 2, 3, 4);
  q.add({
    ...item("cursor"),
    spec: { ...spec, cursors: { a: { sprite: "C:/cache/a.webm", size: 32, fps: 30, positions } } },
  });
  const queued = q.items[0].spec;
  assert.ok(queued.cursors?.a.positions instanceof Int32Array, "the queue's copy");
  assert.notEqual(queued.cursors?.a.positions, positions, "the queue owns its copy");
  assert.ok(started?.cursors?.a.positions instanceof Int32Array, "the runner gets it typed");
  // export:start: Electron clones the arguments, the desktop SDK checks them, then the schema.
  const [, json, sent] = structuredClone(["job", JSON.stringify(project), queued] as const);
  validateIpcValues(["job", json, sent]);
  const parsed = exportSpecSchema.parse(sent);
  assert.ok(parsed.cursors?.a.positions instanceof Int32Array);
  assert.deepEqual(Array.from(parsed.cursors?.a.positions ?? []), [1, 2, 3, 4]);
  // As a plain list (what Array.from used to send) the main process refuses it.
  assert.equal(
    exportSpecSchema.safeParse({
      ...sent,
      cursors: { a: { ...sent.cursors?.a, positions: [1, 2, 3, 4] } },
    }).success,
    false,
  );
});

test("while a take records, the next export waits; the one running goes on", async () => {
  const seen: string[] = [];
  const release: (() => void)[] = [];
  const q = new ExportQueue(
    async (i) => {
      seen.push(i.id);
      await new Promise<void>((resolve) => release.push(resolve));
    },
    () => {},
  );
  q.add(item("running"));
  await tick();
  q.hold(true);
  q.add(item("next"));
  release.shift()?.();
  await tick();
  await tick();
  assert.deepEqual(seen, ["running"]);
  assert.equal(q.items.find((i) => i.id === "next")?.state, "waiting");
  assert.equal(q.holding, true);
  q.hold(false);
  await tick();
  assert.deepEqual(seen, ["running", "next"]);
  release.shift()?.();
  await tick();
  assert.equal(q.items.find((i) => i.id === "next")?.state, "done");
});
