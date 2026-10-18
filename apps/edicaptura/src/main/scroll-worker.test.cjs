const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { ScrollSession } = require("./scroll-session.ts");
const { ScrollWorker } = require("./scroll-worker-client.ts");
const { NO_MARGINS } = require("../domain/scroll.ts");
const entry = path.join(__dirname, "scroll-worker.ts");
function fixture(axis = "vertical") {
  const width = axis === "vertical" ? 40 : 160,
    height = axis === "vertical" ? 160 : 40;
  const bytes = Buffer.alloc(width * height * 4);
  let seed = 29;
  for (let i = 0; i < bytes.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bytes[i] = seed >>> 24;
  }
  return {
    bytes,
    image(offset) {
      const w = axis === "vertical" ? width : 100,
        h = axis === "vertical" ? 100 : height;
      const bitmap = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) {
        const start =
          ((y + (axis === "vertical" ? offset : 0)) * width +
            (axis === "horizontal" ? offset : 0)) *
          4;
        bytes.copy(bitmap, y * w * 4, start, start + w * 4);
      }
      return { getSize: () => ({ width: w, height: h }), toBitmap: () => bitmap };
    },
  };
}
for (const axis of ["vertical", "horizontal"])
  test(`worker transfer, review/remove/undo and exact stitch ${axis}`, async () => {
    const f = fixture(axis),
      first = f.image(0),
      second = f.image(30),
      session = new ScrollSession(first, entry);
    try {
      await session.edit({ op: "configure", axis, margins: NO_MARGINS });
      assert.equal(await session.add(second, false, null), "added");
      assert.equal(await session.add(f.image(60), false, null), "added");
      assert.equal(first.toBitmap().byteLength, 16000);
      assert.equal(second.toBitmap().byteLength, 16000);
      const preview = await session.edit({ op: "preview" });
      assert.deepEqual(Buffer.from(preview.result.bitmap), f.bytes);
      await session.edit({ op: "remove", index: 1 });
      assert.equal(session.images.length, 2);
      assert.equal(session.cuts[1], 40);
      await session.edit({ op: "undo" });
      assert.equal(session.images.length, 3);
      await session.edit({ op: "cut", index: 1, overlap: 60 });
      assert.equal(session.cuts[1], 60);
      await session.edit({ op: "undo" });
      assert.equal(session.cuts[1], 70);
      const output = await session.stitch();
      assert.deepEqual(Buffer.from(output.result.bitmap), f.bytes);
    } finally {
      session.dispose();
    }
  });
test("real worker cancellation preserves sole originals and supports explicit recovery", async () => {
  const f = fixture(),
    first = f.image(0),
    session = new ScrollSession(first, entry);
  const pending = session.edit({ op: "preview" });
  session.stop();
  await assert.rejects(pending, /cancelado/);
  assert.equal(session.images.length, 1);
  assert.equal(first.toBitmap().byteLength, 16000);
  assert.equal(session.paused, true);
  const recovery = await session.stitch();
  assert.deepEqual(Buffer.from(recovery.result.bitmap), first.toBitmap());
  session.dispose();
});
test("worker launch failure rejects rather than publish", async () => {
  const f = fixture(),
    worker = new ScrollWorker(path.join(__dirname, "absent-scroll-worker.ts"));
  await assert.rejects(worker.run("preview", [f.image(0)], [0], "vertical", NO_MARGINS), /Worker/);
  worker.cancel();
});
test("late session/request and clean unexpected worker exit reject without detaching originals", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-scroll-worker-"));
  try {
    for (const kind of ["session", "request", "exit"]) {
      const file = path.join(root, `${kind}.cjs`);
      await fs.writeFile(
        file,
        `const {parentPort}=require('node:worker_threads');parentPort.on('message',m=>{${kind === "exit" ? "process.exit(0)" : `parentPort.postMessage({session:${kind === "session" ? "'11111111-1111-4111-8111-111111111111'" : "m.session"},request:${kind === "request" ? "m.request+1" : "m.request"}})`}});`,
      );
      const image = fixture().image(0),
        worker = new ScrollWorker(file);
      await assert.rejects(
        worker.run("preview", [image], [0], "vertical", NO_MARGINS),
        /obsoleta|encerrou/,
      );
      assert.equal(image.toBitmap().byteLength, 16000);
      worker.cancel();
    }
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith("edi-scroll-worker-"));
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("actual production worker receives detached transfer and returns an owned result buffer", async () => {
  const { Worker } = require("node:worker_threads"),
    { randomUUID } = require("node:crypto");
  const worker = new Worker(entry),
    image = fixture().image(0),
    bytes = Uint8Array.from(image.toBitmap()),
    token = randomUUID();
  try {
    const reply = new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    worker.postMessage(
      {
        session: token,
        request: 1,
        op: "preview",
        axis: "vertical",
        margins: NO_MARGINS,
        frames: [{ width: 40, height: 100, bitmap: bytes }],
        cuts: [0],
        retainedBytes: 80 * 1048576,
      },
      [bytes.buffer],
    );
    assert.equal(bytes.byteLength, 0);
    const result = await reply;
    assert.equal(result.session, token);
    assert.equal(result.request, 1);
    assert.deepEqual(Buffer.from(result.result.bitmap), image.toBitmap());
    assert.equal(image.toBitmap().byteLength, 16000);
  } finally {
    await worker.terminate();
  }
});
test("automatic stable start/end and ambiguous pause preserve collected segments", async () => {
  const f = fixture(),
    session = new ScrollSession(f.image(0), entry);
  try {
    assert.equal(await session.add(f.image(0), true, null), "waiting");
    assert.equal(await session.add(f.image(0), true, null), "stable");
    assert.equal(await session.add(f.image(30), true, null), "waiting");
    assert.equal(await session.add(f.image(30), true, null), "added");
    const blank = {
      getSize: () => ({ width: 40, height: 100 }),
      toBitmap: () => Buffer.alloc(16000, 5),
    };
    assert.equal(await session.add(blank, true, null), "waiting");
    assert.equal(await session.add(blank, true, null), "ambiguous");
    assert.equal(session.paused, true);
    assert.equal(session.images.length, 2);
    assert.equal(await session.add(blank, false, 10), "added");
    assert.equal(session.cuts[2], 10);
  } finally {
    session.dispose();
  }
});
