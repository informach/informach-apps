import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { createDesktopJobs } from "../../../packages/edi-desktop/src/jobs.ts";
import { createTaskBroker, type TaskPort } from "../src/main/task-broker.ts";
import { createTaskStore } from "../src/main/task-store.ts";
import { batchDigest, writeBatchArchive } from "../src/shared/batch-archive.ts";
import { batchDetailSchema } from "../src/shared/batch-format.ts";
import type { CompressionInput } from "../src/shared/compression-task-format.ts";
import { DEFAULT_PRINT_SETTINGS } from "../src/shared/print-format.ts";
import { appendScannedPage } from "../src/shared/scan-pdf.ts";
import {
  type LocalTaskReply,
  type LocalTaskRequest,
  localTaskRequestSchema,
  ocrTaskDetailSchema,
  type TaskResult,
} from "../src/shared/task-format.ts";

const request = (): LocalTaskRequest => ({
  id: randomUUID(),
  kind: "conversion",
  label: "Documento local",
  defaultName: "convertido.txt",
  extension: "txt",
  inputBytes: 1024,
  originPaths: [],
});

test("batch checkpoints retain their immutable source, survive disconnect as partial work and cannot be saved as a complete lot", async () => {
  const f = await fixture(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  let commits = 0;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    remove: f.store.remove,
    save: async () => {
      commits++;
      return "unexpected";
    },
  });
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const source = await pdf.save(),
      part = await PDFDocument.create();
    part.addPage();
    const first = await part.save(),
      initial = batchDetailSchema.parse({
        kind: "batch",
        version: 1,
        stage: "processing",
        settings: { operation: "split", pagesPerFile: 1 },
        sourceSha256: await batchDigest(source),
        sourcePages: 2,
        total: 2,
        files: [],
      }),
      checkpoint = batchDetailSchema.parse({
        ...initial,
        files: [
          {
            name: "parte-001.pdf",
            bytes: first.length,
            sha256: await batchDigest(first),
            pages: [1],
          },
        ],
      }),
      task: LocalTaskRequest = {
        ...request(),
        kind: "batch",
        extension: "zip",
        defaultName: "Divisão local.zip",
        inputBytes: source.length,
      },
      output: TaskResult = {
        pdf: source,
        bytes: await writeBatchArchive(initial, new Map()),
        extension: "zip",
        pages: 2,
        warnings: [],
        detail: initial,
      },
      wire = channel(),
      done = broker.run(task, wire.port);
    assert.throws(
      () => localTaskRequestSchema.parse({ ...task, defaultName: "Divisão local" }),
      /nome da tarefa/,
    );
    wire.send({ kind: "checkpointResult", seq: 1, result: output });
    await wire.wait("ack", 1);
    wire.send({
      kind: "checkpointBatch",
      seq: 2,
      bytes: await writeBatchArchive(checkpoint, new Map([["parte-001.pdf", first]])),
      detail: checkpoint,
    });
    await wire.wait("ack", 2);
    await assert.rejects(
      () => f.store.save({ request: task, result: output, createdAt: Date.now() }),
      /retroceder/,
    );
    wire.disconnect();
    assert.equal((await done).status, "preserved");
    const pending = await f.store.load(task.id);
    assert.deepEqual(pending.result.pdf, new Uint8Array(source));
    assert.equal((await f.store.list()).tasks[0]?.state, "processing");
    assert.equal((await f.store.list()).tasks[0]?.name, "Divisão local");
    assert.equal(pending.result.detail?.kind === "batch" && pending.result.detail.files.length, 1);
    const resumed = channel(),
      finished = broker.run(task, resumed.port);
    resumed.send({ kind: "ready", seq: 1, result: pending.result });
    await resumed.wait("ack", 1);
    resumed.send({ kind: "save", seq: 2 });
    await resumed.wait("error");
    assert.equal((await finished).status, "preserved");
    assert.equal(commits, 0);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});
const result = {
  bytes: new TextEncoder().encode("SEGREDO_LOCAL"),
  pdf: new TextEncoder().encode("%PDF-1.7\nfixture"),
  pages: 1,
  warnings: [],
  extension: "txt" as const,
};
function channel() {
  let message: (data: unknown) => void = () => {
      throw new Error("Listener not attached");
    },
    closed: () => void = () => {};
  const messages: LocalTaskReply[] = [],
    waiters: { matches(reply: LocalTaskReply): boolean; resolve: () => void }[] = [];
  const port: TaskPort = {
    send(reply) {
      messages.push(reply);
      for (const waiter of [...waiters])
        if (waiter.matches(reply)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
    },
    close() {
      closed();
    },
    onMessage(listener) {
      message = listener;
    },
    onClose(listener) {
      closed = listener;
    },
  };
  return {
    port,
    messages,
    send: (data: unknown) => message(data),
    disconnect: () => closed(),
    wait(kind: LocalTaskReply["kind"], sequence?: number) {
      const matches = (reply: LocalTaskReply) =>
        reply.kind === kind &&
        (sequence === undefined || ("seq" in reply && reply.seq === sequence));
      if (messages.some(matches)) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push({ matches, resolve }));
    },
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "edipdf-tasks-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(basename(root), /^edipdf-tasks-[a-zA-Z0-9]+$/);
  const key = randomBytes(32),
    codec = {
      encode(value: string) {
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", key, iv);
        return Buffer.concat([
          iv,
          cipher.update(value, "utf8"),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
      },
      decode(value: Uint8Array) {
        const bytes = Buffer.from(value),
          decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(-16));
        return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(
          "utf8",
        );
      },
    };
  return {
    root,
    codec,
    store: createTaskStore(root, codec),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function compressionFixture(snapshot = true) {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("ENTRADA_COMPACTACAO_PRIVADA");
  const bytes = new Uint8Array(await pdf.save());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const source: CompressionInput["source"] = snapshot
    ? { kind: "snapshot", sha256, length: bytes.length }
    : { kind: "file", path: "C:\\private\\source.pdf", sha256, length: bytes.length };
  const input: CompressionInput = {
    kind: "compression",
    source,
    ...(snapshot ? { bytes } : {}),
    settings: { level: "balanced", review: true, acceptLarger: false, previewPage: 0 },
  };
  const req: LocalTaskRequest = {
    ...request(),
    kind: "compression",
    defaultName: "copy.pdf",
    extension: "pdf",
    inputBytes: bytes.length,
    inputIdentity: source,
  };
  const output: TaskResult = {
    bytes,
    pdf: bytes,
    pages: 1,
    extension: "pdf",
    warnings: [],
    detail: { kind: "compression", before: bytes.length, targetMet: true, page: 0 },
  };
  return { bytes, input, request: req, output };
}

test("prepared table provenance survives protected persistence and a new store without plaintext leakage", async () => {
  const f = await fixture();
  try {
    const table = {
      version: 1 as const,
      source: {
        title: "SEGREDO_TABELA",
        sha256: "a".repeat(64),
        page: 2,
        width: 600,
        height: 800,
        area: { x: 40, y: 80, w: 500, h: 100 },
        separators: [250],
      },
      rows: [
        [
          {
            address: "R1C1",
            value: "SEGREDO_CELULA",
            box: { x: 50, y: 90, w: 60, h: 12 },
            ambiguous: false,
          },
          { address: "R1C2", value: "", box: null, ambiguous: false },
        ],
      ],
    };
    const req = { ...request(), extension: "csv" as const, defaultName: "tabela.csv" },
      output = { ...result, extension: "csv" as const, table };
    await f.store.save({ request: req, result: output, createdAt: Date.now() });
    const resumed = await createTaskStore(f.root, f.codec).load(req.id);
    assert.deepEqual(resumed.result.table, table);
    for (const name of await readdir(f.root)) {
      const bytes = await readFile(join(f.root, name));
      assert.equal(bytes.includes(Buffer.from("SEGREDO_TABELA")), false);
      assert.equal(bytes.includes(Buffer.from("SEGREDO_CELULA")), false);
    }
  } finally {
    await f.cleanup();
  }
});

const scanningRequest = (): LocalTaskRequest => ({
  ...request(),
  kind: "scanning",
  defaultName: "scan.pdf",
  extension: "pdf",
  inputBytes: 32 * 1024 * 1024,
  scanner: {
    deviceId: "isolated-adapter",
    sourceId: "1",
    dpi: 200,
    color: "color",
    paper: "a4",
    maximumPages: 100,
  },
});
async function scannedResult(previous?: TaskResult): Promise<TaskResult> {
  const page = await appendScannedPage({
    bytes: new Uint8Array(
      await readFile(new URL("./fixtures/tiff/rgb-raw-1.png", import.meta.url)),
    ),
    dpi: 200,
    ...(previous ? { previous: previous.pdf } : {}),
  });
  return {
    ...page,
    pdf: page.bytes,
    extension: "pdf",
    warnings: [],
    detail: { kind: "scanning", stage: "acquiring", pages: page.pages },
  };
}
test("scanner task commits each complete page before requesting another and resumes review without touching hardware", async () => {
  const f = await fixture(),
    req = scanningRequest(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  let acquisitions = 0,
    closed = 0;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (value, check) => f.store.save(value, check),
    remove: f.store.remove,
    createScanner: () => ({
      close() {
        closed++;
      },
      async next(previous) {
        if (previous) assert.equal((await f.store.load(req.id)).result.pages, previous.pages);
        acquisitions++;
        return scannedResult(previous);
      },
    }),
    async save(_request, result) {
      const path = join(f.root, "scanned.pdf");
      await writeFile(path, result.bytes);
      return path;
    },
  });
  try {
    const connection = channel(),
      done = broker.run(req, connection.port);
    connection.send({ kind: "scanPage", seq: 1 });
    await connection.wait("ack", 1);
    assert.equal((await f.store.load(req.id)).result.pages, 1);
    connection.send({ kind: "scanPage", seq: 2 });
    await connection.wait("ack", 2);
    const preserved = await f.store.load(req.id);
    assert.equal((await PDFDocument.load(preserved.result.pdf)).getPageCount(), 2);
    assert.equal((await f.store.list()).tasks[0]?.state, "processing");
    connection.disconnect();
    assert.equal((await done).status, "preserved");
    assert.ok(closed > 0);
    const resumed = channel(),
      resumedDone = broker.run(req, resumed.port);
    resumed.send({
      kind: "ready",
      seq: 1,
      result: { ...preserved.result, detail: { kind: "scanning", stage: "review", pages: 2 } },
    });
    await resumed.wait("ack", 1);
    assert.equal(acquisitions, 2); // Reviewing a restarted task must not advance the feeder.
    resumed.send({ kind: "save", seq: 2 });
    await resumed.wait("ack", 2);
    assert.equal((await resumedDone).status, "saved");
    assert.equal(
      (await PDFDocument.load(await readFile(join(f.root, "scanned.pdf")))).getPageCount(),
      2,
    );
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});
test("a scanner checkpoint failure preserves earlier pages and stops the acquisition session", async () => {
  const f = await fixture(),
    req = scanningRequest(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  let closed = false,
    commits = 0;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: async (value, check) => {
      if (++commits === 2) throw new Error("Protected disk full");
      await f.store.save(value, check);
    },
    remove: f.store.remove,
    createScanner: () => ({
      close() {
        closed = true;
      },
      next: scannedResult,
    }),
    async save() {
      throw new Error("Unreviewed output cannot be saved");
    },
  });
  try {
    const connection = channel(),
      done = broker.run(req, connection.port);
    connection.send({ kind: "scanPage", seq: 1 });
    await connection.wait("ack", 1);
    connection.send({ kind: "scanPage", seq: 2 });
    await connection.wait("error");
    assert.equal((await done).status, "preserved");
    assert.equal(closed, true);
    assert.equal((await f.store.load(req.id)).result.pages, 1);
    assert.ok(
      connection.messages.some(
        (reply) => reply.kind === "error" && reply.error.includes("disk full"),
      ),
    );
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});
test("non-scanner tasks cannot acquire paper through the task port", async () => {
  const f = await fixture(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  let acquired = false;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (value, check) => f.store.save(value, check),
    remove: f.store.remove,
    createScanner: () => {
      acquired = true;
      throw new Error("Must not start");
    },
    async save() {
      return null;
    },
  });
  try {
    const connection = channel(),
      done = broker.run(request(), connection.port);
    const failure = assert.rejects(done, /autorizada/);
    connection.send({ kind: "scanPage", seq: 1 });
    await failure;
    assert.equal(acquired, false);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("SDK print handoff distinguishes dialog cancellation from submission and retains prepared data until success", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  const req: LocalTaskRequest = {
    ...candidate.request,
    kind: "printing",
    inputIdentity: undefined,
    // The reservation includes source PDFs/fonts/model, while each protected PDF remains bounded.
    inputBytes: 80 * 1024 * 1024,
  };
  const output: TaskResult = {
    ...candidate.output,
    detail: { kind: "printing", stage: "output", settings: DEFAULT_PRINT_SETTINGS },
  };
  const jobs = createDesktopJobs({
    assertAccess() {},
    onStopError(failure) {
      throw failure;
    },
  });
  let submitted = false;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: f.store.save,
    remove: f.store.remove,
    async save() {
      throw new Error("Unexpected file save");
    },
    async print(_result, checkpoint) {
      await checkpoint();
      return { submitted };
    },
  });
  try {
    const wire = channel(),
      done = broker.run(req, wire.port);
    wire.send({ kind: "ready", seq: 1, result: output });
    await wire.wait("ack", 1);
    wire.send({ kind: "print", seq: 2 });
    await wire.wait("ack", 2);
    assert.ok(
      wire.messages.some(
        (message) => message.kind === "ack" && message.seq === 2 && message.printed === false,
      ),
    );
    assert.equal((await f.store.list()).tasks.length, 1);
    submitted = true;
    wire.send({ kind: "print", seq: 3 });
    assert.equal((await done).status, "printed");
    assert.deepEqual(await readdir(f.root), []);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("printing input and flattened checkpoints cannot be submitted as reviewed output", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  const jobs = createDesktopJobs({
    assertAccess() {},
    onStopError(failure) {
      throw failure;
    },
  });
  let calls = 0;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: f.store.save,
    remove: f.store.remove,
    async save() {
      throw new Error("Unexpected save");
    },
    async print() {
      calls++;
      return { submitted: true };
    },
  });
  try {
    for (const stage of ["input", "flattened"] as const) {
      const req: LocalTaskRequest = {
          ...candidate.request,
          id: randomUUID(),
          kind: "printing",
          inputIdentity: undefined,
        },
        wire = channel(),
        done = broker.run(req, wire.port);
      wire.send({
        kind: "ready",
        seq: 1,
        result: {
          ...candidate.output,
          detail: { kind: "printing", stage, settings: DEFAULT_PRINT_SETTINGS },
        },
      });
      await wire.wait("ack", 1);
      assert.equal(
        (await f.store.list()).tasks.find((task) => task.id === req.id)?.state,
        "processing",
      );
      wire.send({ kind: "print", seq: 2 });
      assert.equal((await done).status, "preserved");
    }
    assert.equal(calls, 0);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("restricted print preparation stays protected and cannot become an exportable task", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  const req: LocalTaskRequest = {
    ...candidate.request,
    kind: "printing",
    inputIdentity: undefined,
    printOnly: true,
  };
  const output: TaskResult = {
    ...candidate.output,
    detail: {
      kind: "printing",
      stage: "output",
      settings: DEFAULT_PRINT_SETTINGS,
      printOnly: true,
    },
  };
  const job = { request: req, createdAt: 1, result: output };
  const jobs = createDesktopJobs({
    assertAccess() {},
    onStopError(failure) {
      throw failure;
    },
  });
  let saved = false;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: f.store.save,
    remove: f.store.remove,
    async save() {
      saved = true;
      return "forbidden.pdf";
    },
  });
  try {
    await f.store.save(job);
    await assert.rejects(
      f.store.save({ ...job, request: { ...req, printOnly: false } }),
      /permissão/,
    );
    await assert.rejects(
      f.store.save({
        ...job,
        request: { ...req, printOnly: false },
        result: {
          ...output,
          detail: { kind: "printing", stage: "output", settings: DEFAULT_PRINT_SETTINGS },
        },
      }),
      /outra tarefa/,
    );
    assert.equal((await f.store.load(req.id)).request.printOnly, true);
    const wire = channel(),
      done = broker.run(req, wire.port);
    wire.send({ kind: "ready", seq: 1, result: output });
    await wire.wait("ack", 1);
    wire.send({ kind: "save", seq: 2 });
    await wire.wait("error");
    assert.equal((await done).status, "preserved");
    assert.equal(saved, false);
    assert.equal((await f.store.load(req.id)).result.detail?.kind, "printing");
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("compression snapshots survive restart before output and reuse their protected blob in the completed result", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  try {
    const entry = { request: candidate.request, input: candidate.input, createdAt: 10 };
    await f.store.saveInput(entry);
    const restarted = createTaskStore(f.root, f.codec);
    assert.deepEqual(await restarted.loadInput(entry.request.id), entry);
    assert.equal((await restarted.list()).tasks[0]?.state, "processing");
    const names = await readdir(f.root);
    for (const name of names)
      assert.equal(
        (await readFile(join(f.root, name))).includes(Buffer.from("ENTRADA_COMPACTACAO_PRIVADA")),
        false,
      );
    await restarted.save({ request: candidate.request, result: candidate.output, createdAt: 10 });
    assert.equal((await readdir(f.root)).filter((name) => name.endsWith(".blob")).length, 1);
    assert.equal((await restarted.list()).tasks[0]?.state, "review");
    assert.equal(
      (
        await PDFDocument.load((await restarted.load(candidate.request.id)).result.bytes)
      ).getPageCount(),
      1,
    );
    await restarted.remove(candidate.request.id);
    assert.deepEqual(await readdir(f.root), []);
  } finally {
    await f.cleanup();
  }
});

test("compression input validates hashes and origin binding; file inputs store only protected metadata", async () => {
  const f = await fixture(),
    candidate = await compressionFixture(false);
  try {
    await f.store.saveInput({ request: candidate.request, input: candidate.input, createdAt: 10 });
    assert.equal((await readdir(f.root)).length, 1);
    assert.deepEqual((await f.store.loadInput(candidate.request.id)).input, candidate.input);
    const altered = {
      ...candidate.input,
      source: { ...candidate.input.source, sha256: "0".repeat(64) },
    };
    await assert.rejects(
      f.store.saveInput({ request: candidate.request, input: altered, createdAt: 10 }),
      /origem/,
    );
    const snapshot = await compressionFixture();
    await assert.rejects(
      f.store.saveInput({
        request: snapshot.request,
        input: { ...snapshot.input, bytes: new Uint8Array(snapshot.bytes.length).fill(65) },
        createdAt: 10,
      }),
      /origem/,
    );
  } finally {
    await f.cleanup();
  }
});

test("a damaged compression input remains reported without hiding or deleting a valid reviewed output", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  try {
    await f.store.saveInput({ request: candidate.request, input: candidate.input, createdAt: 10 });
    await f.store.save({ request: candidate.request, result: candidate.output, createdAt: 10 });
    await writeFile(join(f.root, `${candidate.request.id}.input`), "damaged input");
    const listed = await createTaskStore(f.root, f.codec).list();
    assert.equal(listed.tasks.length, 1);
    assert.equal(listed.errors.length, 1);
    await f.store.save({ request: candidate.request, result: candidate.output, createdAt: 10 });
    assert.equal(
      (await readFile(join(f.root, `${candidate.request.id}.input`))).toString(),
      "damaged input",
    );
    assert.equal(
      (await f.store.load(candidate.request.id)).result.bytes.length,
      candidate.bytes.length,
    );
  } finally {
    await f.cleanup();
  }
});

test("SDK interruption before compression output preserves the protected input for a fresh authorized run", async () => {
  const f = await fixture(),
    candidate = await compressionFixture();
  const jobs = createDesktopJobs({
    assertAccess() {},
    onStopError(error) {
      throw error;
    },
  });
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: f.store.save,
    preserveInput: f.store.saveInput,
    remove: f.store.remove,
    async save() {
      throw new Error("No reviewed output exists");
    },
  });
  try {
    const wire = channel(),
      done = broker.run(candidate.request, wire.port);
    wire.send({ kind: "input", seq: 1, input: candidate.input });
    await wire.wait("ack", 1);
    wire.disconnect();
    assert.equal((await done).status, "preserved");
    const resumed = await createTaskStore(f.root, f.codec).loadInput(candidate.request.id);
    const next = channel(),
      completed = broker.run(resumed.request, next.port);
    next.send({ kind: "input", seq: 1, input: resumed.input });
    await next.wait("ack", 1);
    next.send({ kind: "ready", seq: 2, result: candidate.output });
    await next.wait("ack", 2);
    next.send({ kind: "cancel", seq: 3 });
    assert.equal((await completed).status, "cancelled");
    assert.deepEqual(await readdir(f.root), []);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("task storage reuses immutable PDF bytes across metadata checkpoints and detects altered blobs", async () => {
  const f = await fixture();
  try {
    const task = { request: request(), result, createdAt: 123 };
    await f.store.save(task);
    const files = (await readdir(f.root)).filter((name) => name.endsWith(".blob"));
    assert.equal(files.length, 2);
    const fingerprints = await Promise.all(
      files.map(async (name) => (await stat(join(f.root, name))).mtimeMs),
    );
    await f.store.save({ ...task, result: { ...result, warnings: ["Revisão atualizada"] } });
    assert.deepEqual(
      (await readdir(f.root)).filter((name) => name.endsWith(".blob")),
      files,
    );
    assert.deepEqual(
      await Promise.all(files.map(async (name) => (await stat(join(f.root, name))).mtimeMs)),
      fingerprints,
    );
    const restarted = createTaskStore(f.root, f.codec);
    assert.deepEqual((await restarted.load(task.request.id)).result.warnings, [
      "Revisão atualizada",
    ]);
    await writeFile(join(f.root, files[0]), "tampered protected bytes");
    assert.equal((await f.store.list()).errors.length, 1);
    await assert.rejects(f.store.load(task.request.id));
    await f.store.remove(task.request.id);
    assert.deepEqual(await readdir(f.root), []);
  } finally {
    await f.cleanup();
  }
});

test("a stopped metadata commit leaves the previous complete task and removes its new unreferenced blob", async () => {
  const f = await fixture();
  try {
    const task = { request: request(), result, createdAt: 123 };
    await f.store.save(task);
    const before = await readdir(f.root);
    let commits = 0;
    await assert.rejects(
      f.store.save(
        { ...task, result: { ...result, bytes: new Uint8Array([1, 2, 3]) } },
        async () => {
          if (++commits === 2) throw new Error("deadline");
        },
      ),
      /deadline/,
    );
    assert.deepEqual(await readdir(f.root), before);
    assert.deepEqual(await f.store.load(task.request.id), task);
  } finally {
    await f.cleanup();
  }
});

test("task storage reads the original protected envelope and upgrades it without losing result bytes", async () => {
  const f = await fixture();
  try {
    const task = { request: request(), result, createdAt: 123 };
    await writeFile(
      join(f.root, `${task.request.id}.bin`),
      f.codec.encode(
        JSON.stringify({
          version: 1,
          ...task,
          result: {
            ...result,
            bytes: Buffer.from(result.bytes).toString("base64"),
            pdf: Buffer.from(result.pdf).toString("base64"),
          },
        }),
      ),
    );
    assert.deepEqual(await f.store.load(task.request.id), task);
    await f.store.save(task);
    assert.equal(
      JSON.parse(f.codec.decode(await readFile(join(f.root, `${task.request.id}.bin`)))).version,
      2,
    );
    assert.deepEqual(await f.store.load(task.request.id), task);
  } finally {
    await f.cleanup();
  }
});

test("failure to clean the protected cache after commit does not misreport the saved output as a failed write", async () => {
  const f = await fixture(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  const target = join(f.root, "reviewed-output.txt");
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    async remove() {
      throw new Error("cleanup refused");
    },
    async save(_request, result, checkpoint) {
      await checkpoint();
      await writeFile(target, result.bytes);
      return target;
    },
  });
  try {
    const wire = channel(),
      done = broker.run(request(), wire.port);
    wire.send({ kind: "ready", seq: 1, result });
    await wire.wait("ack");
    wire.send({ kind: "save", seq: 2 });
    const outcome = await done;
    assert.equal(outcome.status, "saved");
    assert.ok(outcome.status === "saved" && outcome.warning);
    assert.equal((await readFile(target)).toString(), "SEGREDO_LOCAL");
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("prepared tasks survive restart as protected results; corrupt data is preserved and reported", async () => {
  const f = await fixture();
  try {
    const task = { request: request(), result, createdAt: 123 };
    await f.store.save(task);
    const encrypted = await readFile(join(f.root, `${task.request.id}.bin`));
    assert.equal(encrypted.includes(Buffer.from("SEGREDO_LOCAL")), false);
    assert.deepEqual(await f.store.load(task.request.id), task);
    const broken = randomUUID();
    await writeFile(join(f.root, `${broken}.bin`), "invalid protected result");
    const listed = await f.store.list();
    assert.equal(listed.tasks.length, 1);
    assert.equal(listed.errors.length, 1);
    assert.equal(
      (await readFile(join(f.root, `${broken}.bin`))).toString(),
      "invalid protected result",
    );
    await f.store.remove(task.request.id);
    assert.equal((await f.store.list()).tasks.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("an authorized task can save after license expiration within its SDK deadline; new jobs cannot start", async () => {
  const f = await fixture();
  let licensed = true,
    now = 0;
  const jobs = createDesktopJobs({
    assertAccess() {
      if (!licensed) throw new Error("restricted");
    },
    onStopError(error) {
      throw error;
    },
    monotonic: () => now,
    wallClock: () => now,
  });
  let committed = 0;
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    remove: f.store.remove,
    async save(_request, _result, checkpoint) {
      await checkpoint();
      committed++;
      return "C:\\isolated\\converted.txt";
    },
  });
  try {
    const task = request(),
      wire = channel(),
      done = broker.run(task, wire.port);
    assert.deepEqual(wire.messages, [{ kind: "start" }]);
    wire.send({ kind: "ready", seq: 1, result });
    await wire.wait("ack");
    licensed = false;
    jobs.setAccess(false);
    await assert.rejects(broker.run(request(), channel().port), /restricted/);
    now = 1000;
    wire.send({ kind: "save", seq: 2 });
    assert.equal((await done).status, "saved");
    assert.equal(committed, 1);
    assert.equal((await f.store.list()).tasks.length, 0);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("SDK preservation deadline stops work and retains the prepared result without committing output", async () => {
  const f = await fixture();
  let licensed = true,
    now = 0,
    committed = 0;
  const jobs = createDesktopJobs({
    assertAccess() {
      if (!licensed) throw new Error("restricted");
    },
    onStopError(error) {
      throw error;
    },
    monotonic: () => now,
    wallClock: () => now,
  });
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    remove: f.store.remove,
    async save() {
      committed++;
      return "unexpected";
    },
  });
  try {
    const task = request(),
      wire = channel(),
      done = broker.run(task, wire.port);
    wire.send({ kind: "ready", seq: 1, result });
    await wire.wait("ack");
    licensed = false;
    jobs.setAccess(false);
    now = 30 * 60 * 1000 + 1;
    jobs.checkDeadlines();
    assert.equal((await done).status, "preserved");
    wire.send({ kind: "save", seq: 2 });
    assert.equal(committed, 0);
    assert.equal((await f.store.list()).tasks[0].id, task.id);
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("OCR checkpoints keep CPU ownership, metadata updates reuse the permit, and later stages rejoin the queue fairly", async () => {
  const f = await fixture(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    remove: f.store.remove,
    async save() {
      return null;
    },
  });
  const detail = ocrTaskDetailSchema.parse({
    kind: "ocr",
    stage: "recognizing",
    skipped: 0,
    remaining: [0],
    pages: [],
    options: {
      language: "por",
      dpi: 200,
      force: false,
      turn: 0,
      skew: 0,
      autoOrientation: true,
      autoSkew: true,
    },
  });
  const output: TaskResult = { ...result, extension: "pdf", detail };
  const selected: LocalTaskRequest = {
    ...request(),
    kind: "ocr",
    extension: "pdf",
    defaultName: "ocr.pdf",
  };
  try {
    const first = channel(),
      second = channel(),
      third = channel();
    const a = broker.run(selected, first.port),
      b = broker.run(request(), second.port),
      c = broker.run(request(), third.port);
    first.send({ kind: "checkpointResult", seq: 1, result: output });
    await first.wait("ack", 1);
    assert.equal(second.messages.length, 0);
    const recognized = {
      ...detail,
      remaining: [],
      pages: [
        {
          page: 0,
          turn: 0,
          skew: 0,
          result: {
            width: 600,
            height: 800,
            confidence: 90,
            words: [{ text: "ORIGINAL", confidence: 90, x0: 10, y0: 10, x1: 100, y1: 30, line: 0 }],
          },
          preview: "data:image/jpeg;base64,YQ==",
        },
      ],
    };
    first.send({ kind: "progress", seq: 2, detail: recognized });
    await first.wait("ack", 2);
    assert.equal(second.messages.length, 0);
    const review = { ...recognized, stage: "review" };
    first.send({ kind: "ready", seq: 3, result: { ...output, detail: review } });
    await first.wait("ack", 3);
    assert.deepEqual(second.messages, [{ kind: "start" }]);
    const corrected = {
      ...review,
      pages: recognized.pages.map((page) => ({
        ...page,
        result: {
          ...page.result,
          words: page.result.words.map((word) => ({ ...word, text: "CORRIGIDO" })),
        },
      })),
    };
    first.send({ kind: "update", seq: 4, detail: corrected });
    await first.wait("ack", 4);
    const stored = await f.store.load(selected.id);
    assert.equal(
      stored.result.detail?.kind === "ocr" && stored.result.detail.pages[0].result.words[0].text,
      "CORRIGIDO",
    );
    first.send({ kind: "stage", seq: 5 });
    second.send({ kind: "ready", seq: 1, result });
    await second.wait("ack", 1);
    assert.deepEqual(third.messages, [{ kind: "start" }]);
    assert.equal(
      first.messages.some((reply) => reply.kind === "ack" && reply.seq === 5),
      false,
    );
    third.disconnect();
    await c;
    await first.wait("ack", 5);
    first.send({
      kind: "ready",
      seq: 6,
      result: { ...output, detail: { ...corrected, stage: "output" } },
    });
    await first.wait("ack", 6);
    first.disconnect();
    second.disconnect();
    assert.equal((await a).status, "preserved");
    await b;
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});

test("one CPU task runs at a time; reviewed results release the queue and cancellation does not start a cancelled job", async () => {
  const f = await fixture(),
    jobs = createDesktopJobs({
      assertAccess() {},
      onStopError(error) {
        throw error;
      },
    });
  const broker = createTaskBroker({
    begin: (stop) => jobs.begin({ stop }),
    preserve: (task, checkpoint) => f.store.save(task, checkpoint),
    remove: f.store.remove,
    async save() {
      return null;
    },
  });
  try {
    const first = channel(),
      second = channel(),
      third = channel();
    const a = broker.run(request(), first.port),
      b = broker.run(request(), second.port),
      c = broker.run(request(), third.port);
    assert.equal(second.messages.length, 0);
    assert.equal(third.messages.length, 0);
    third.send({ kind: "cancel", seq: 1 });
    await c;
    first.send({ kind: "ready", seq: 1, result });
    await first.wait("ack");
    assert.deepEqual(second.messages, [{ kind: "start" }]);
    second.disconnect();
    assert.equal((await b).status, "cancelled");
    first.disconnect();
    assert.equal((await a).status, "preserved");
    assert.equal(
      third.messages.some((message) => message.kind === "start"),
      false,
    );
  } finally {
    broker.dispose();
    jobs.dispose();
    await f.cleanup();
  }
});
