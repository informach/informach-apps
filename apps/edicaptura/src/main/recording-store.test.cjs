const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  RecordingStore,
  RECORD_CHUNK_BYTES,
  RECORD_MAX_PARTS,
  RECORD_RESERVE_BYTES,
} = require("./recording-store.ts");
const { Library } = require("./library.cjs");
const { VideoStreams, videoRange } = require("./video-stream.ts");
const { resolveRecordingSource } = require("./recording-permission.ts");
async function fixture(t) {
  const parent = path.resolve(__dirname, "../../test-results/recording");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "case-"));
  t.after(async () => {
    assert.ok(root.startsWith(parent + path.sep));
    await fs.rm(root, { recursive: true });
  });
  const library = new Library(path.join(root, "library"));
  await library.init();
  const store = new RecordingStore(path.join(root, "raw"));
  const session = await store.begin(library.root, 60);
  return { root, library, store, session };
}
function packet(sessionId, sequence, content = "video", durationMs = 1000) {
  const bytes = Buffer.from(content);
  return {
    sessionId,
    sequence,
    bytes,
    durationMs,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
test("durable append checks sequence/hash/size, rejects concurrency and retries idempotently on real files", async (t) => {
  const { store, session } = await fixture(t);
  const first = packet(session.sessionId, 0);
  await assert.rejects(store.append({ ...first, sha256: "0".repeat(64) }), /Checksum/);
  await assert.rejects(store.append({ ...first, sequence: 1 }), /ordem/);
  await assert.rejects(
    store.append({ ...first, bytes: new Uint8Array(RECORD_CHUNK_BYTES + 1) }),
    /1 MiB/,
  );
  const pending = store.append(first);
  await assert.rejects(store.append(first), /confirmação/);
  const ack = await pending;
  assert.equal(ack.sequence, 0);
  const restarted = new RecordingStore(store.root);
  const journal = await restarted.read(session.sessionId);
  assert.equal(journal.bytes, 5);
  assert.equal(journal.parts[0].sha256, first.sha256);
  assert.deepEqual(await restarted.append(first), ack);
  await assert.rejects(restarted.append(packet(session.sessionId, 0, "different")), /conflitante/);
  await assert.rejects(restarted.append(packet(crypto.randomUUID(), 0)), /ENOENT/);
});
test("real disk conflict retains acknowledged parts and accepts explicit retry after correction", async (t) => {
  const { store, session } = await fixture(t);
  await store.append(packet(session.sessionId, 0));
  const conflict = path.join(store.directory(session.sessionId), "1.chunk");
  await fs.mkdir(conflict);
  await assert.rejects(store.append(packet(session.sessionId, 1, "later", 2000)), /inválido/);
  assert.equal((await store.read(session.sessionId)).parts.length, 1);
  await fs.rmdir(conflict);
  await store.append(packet(session.sessionId, 1, "later", 2000));
  assert.equal((await store.read(session.sessionId)).bytes, 10);
});

test("part-count boundary rejects before raw creation and restart never adopts beyond the journal budget", async (t) => {
  const { store, session } = await fixture(t);
  const journal = await store.read(session.sessionId);
  const sha256 = createHash("sha256").update("x").digest("hex");
  journal.parts = Array.from({ length: RECORD_MAX_PARTS }, (_, sequence) => ({
    sequence,
    bytes: 1,
    sha256,
    durationMs: 1000,
  }));
  journal.bytes = RECORD_MAX_PARTS;
  journal.durationMs = 1000;
  await fs.writeFile(
    path.join(store.directory(session.sessionId), "journal.json"),
    JSON.stringify(journal),
  );
  const next = path.join(store.directory(session.sessionId), `${RECORD_MAX_PARTS}.chunk`);
  await assert.rejects(
    store.append(packet(session.sessionId, RECORD_MAX_PARTS, "x")),
    /Limite de partes/,
  );
  await assert.rejects(fs.stat(next), { code: "ENOENT" });
  await fs.writeFile(next, "preserved extra orphan");
  const recovered = await new RecordingStore(store.root).recoveries();
  assert.equal(recovered[0].status, "interrupted");
  assert.equal((await store.read(session.sessionId)).parts.length, RECORD_MAX_PARTS);
  assert.equal(await fs.readFile(next, "utf8"), "preserved extra orphan");
});
test("crash after part sync but before journal commit recovers orphan without deleting raw", async (t) => {
  const { store, session } = await fixture(t);
  const part = packet(session.sessionId, 0, "synced orphan");
  const handle = await fs.open(path.join(store.directory(session.sessionId), "0.chunk"), "wx");
  await handle.writeFile(part.bytes);
  await handle.sync();
  await handle.close();
  const restarted = new RecordingStore(store.root);
  const recovered = await restarted.recoveries();
  assert.equal(recovered[0].bytes, part.bytes.length);
  assert.equal(recovered[0].status, "interrupted");
  assert.equal(recovered[0].durationMs, 0);
  await assert.rejects(restarted.append(packet(session.sessionId, 1)), /encerrada/);
  assert.equal((await restarted.read(session.sessionId)).parts[0].sha256, part.sha256);
});
test("commit preserves raw through publish/read failure; retry commits same library identity before cleanup", async (t) => {
  const { store, session, library } = await fixture(t);
  await store.append(packet(session.sessionId, 0, "first"));
  await store.append(packet(session.sessionId, 1, "last", 2000));
  await store.finish({ sessionId: session.sessionId, durationMs: 2000 });
  const raw = path.join(store.directory(session.sessionId), "0.chunk");
  await assert.rejects(
    store.commit(
      session.sessionId,
      library.root,
      async () => {
        throw Error("disk publication");
      },
      async () => {},
    ),
    /publication/,
  );
  assert.equal(await fs.readFile(raw, "utf8"), "first");
  const publish = (file, journal) => library.importVideoFile(file, journal);
  await assert.rejects(
    store.commit(session.sessionId, library.root, publish, async () => {
      throw Error("read unavailable");
    }),
    /read unavailable/,
  );
  assert.equal(await fs.readFile(raw, "utf8"), "first");
  assert.equal((await library.list()).length, 1);
  let readBeforeRemoval = false;
  await store.commit(session.sessionId, library.root, publish, async (record) => {
    assert.equal(record.id, session.sessionId);
    await library.read(record.id);
    assert.equal(await fs.readFile(raw, "utf8"), "first");
    readBeforeRemoval = true;
  });
  assert.ok(readBeforeRemoval);
  assert.equal(await fs.readFile(library.file(session.sessionId, "webm"), "utf8"), "firstlast");
  await assert.rejects(fs.stat(raw), /ENOENT/);
  assert.equal((await store.recoveries()).length, 0);
  assert.equal((await library.list()).length, 1);
  await store.commit(session.sessionId, library.root, publish, async (record) => {
    await library.read(record.id);
  });
  await assert.rejects(
    store.commit(session.sessionId, path.dirname(library.root), publish, async () => {}),
    /biblioteca original/,
  );
});
test("corruption blocks publication and preserves source; capacity comes from real disk", async (t) => {
  const { store, session, library } = await fixture(t);
  assert.ok(session.availableBytes > session.maxBytes * 3);
  assert.ok(session.maxDurationMs <= 60000);
  await store.append(packet(session.sessionId, 0));
  await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
  await fs.writeFile(path.join(store.directory(session.sessionId), "0.chunk"), "damaged");
  await assert.rejects(
    store.commit(
      session.sessionId,
      library.root,
      (file, journal) => library.importVideoFile(file, journal),
      async () => {},
    ),
    /danificada/,
  );
  assert.equal((await library.list()).length, 0);
});

test("publication/readBack retries reuse retained verified assembly and library media without a fourth copy", async (t) => {
  const { store, library } = await fixture(t);
  for (const failure of ["publication", "readBack"]) {
    const session = await store.begin(library.root, 60);
    await store.append(packet(session.sessionId, 0, Buffer.alloc(RECORD_CHUNK_BYTES, 19)));
    await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
    const publish = async (file, journal) => {
      const result = await library.importVideoFile(file, journal);
      if (failure === "publication") {
        await fs.unlink(library.file(journal.id, "json"));
        throw Error("publication metadata unavailable");
      }
      return result;
    };
    await assert.rejects(
      store.commit(session.sessionId, library.root, publish, async () => {
        throw Error("readBack unavailable");
      }),
      /unavailable/,
    );
    const assembled = path.join(store.directory(session.sessionId), "recording.webm");
    const beforeAssembly = await fs.stat(assembled),
      beforeMedia = await fs.stat(library.file(session.sessionId, "webm"));
    let assemblyAllocations = 0;
    const originalOpen = fs.open;
    const observer = t.mock.method(fs, "open", async (file, ...args) => {
      if (String(file).endsWith(".assembling")) assemblyAllocations++;
      return originalOpen(file, ...args);
    });
    try {
      await store.commit(
        session.sessionId,
        library.root,
        (file, journal) => library.importVideoFile(file, journal),
        async (entry) => {
          await library.read(entry.id);
          const assembly = await fs.stat(assembled),
            media = await fs.stat(library.file(entry.id, "webm"));
          assert.deepEqual(
            [assembly.ino, assembly.mtimeMs],
            [beforeAssembly.ino, beforeAssembly.mtimeMs],
          );
          assert.deepEqual([media.ino, media.mtimeMs], [beforeMedia.ino, beforeMedia.mtimeMs]);
          assert.equal(
            (await fs.stat(path.join(store.directory(session.sessionId), "0.chunk"))).size,
            RECORD_CHUNK_BYTES,
          );
        },
      );
      assert.equal(assemblyAllocations, 0, "retry must not allocate another full assembly");
      assert.equal(
        (await library.list()).filter((entry) => entry.id === session.sessionId).length,
        1,
      );
      assert.equal(
        (await fs.readFile(library.file(session.sessionId, "webm"))).length,
        RECORD_CHUNK_BYTES,
      );
    } finally {
      observer.mock.restore();
    }
  }
});

test("fresh commit allocation refuses exhausted source filesystem before assembly and preserves raw", async (t) => {
  const { store, library, session } = await fixture(t);
  await store.append(packet(session.sessionId, 0));
  await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
  const original = fs.statfs;
  const limited = t.mock.method(fs, "statfs", async (...args) => ({
    ...(await original(...args)),
    bavail: 0,
  }));
  try {
    await assert.rejects(
      store.commit(
        session.sessionId,
        library.root,
        (file, journal) => library.importVideoFile(file, journal),
        async (entry) => library.read(entry.id),
      ),
      /espaço|reserva/i,
    );
    assert.equal(
      (await fs.readdir(store.directory(session.sessionId))).some(
        (name) => name.endsWith(".assembling") || name.endsWith(".webm"),
      ),
      false,
    );
    assert.equal(
      await fs.readFile(path.join(store.directory(session.sessionId), "0.chunk"), "utf8"),
      "video",
    );
  } finally {
    limited.mock.restore();
  }
});

test("same/distinct filesystem space models admit actual copy lifetimes and retry with less than one spare media copy", async (t) => {
  const { store, library } = await fixture(t);
  async function used(directory) {
    let total = 0;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      total += entry.isDirectory() ? await used(file) : (await fs.stat(file)).size;
    }
    return total;
  }
  for (const model of ["same", "distinct"]) {
    const session = await store.begin(library.root, 60);
    await store.append(packet(session.sessionId, 0, Buffer.alloc(RECORD_CHUNK_BYTES, 31)));
    await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
    const rawInitial = await used(store.root),
      libraryInitial = await used(library.root);
    const metadataMargin = 64 * 1024;
    const sameBudget =
      rawInitial + libraryInitial + RECORD_RESERVE_BYTES + 2 * RECORD_CHUNK_BYTES + metadataMargin;
    const rawBudget = rawInitial + RECORD_RESERVE_BYTES + RECORD_CHUNK_BYTES + metadataMargin;
    const libraryBudget =
      libraryInitial + RECORD_RESERVE_BYTES + RECORD_CHUNK_BYTES + metadataMargin;
    const checked = new Set();
    const original = fs.statfs;
    const modeled = t.mock.method(fs, "statfs", async (directory) => {
      const isLibrary = path.resolve(directory) === library.root;
      checked.add(isLibrary ? "library" : "raw");
      const free =
        model === "same"
          ? sameBudget - (await used(store.root)) - (await used(library.root))
          : isLibrary
            ? libraryBudget - (await used(library.root))
            : rawBudget - (await used(store.root));
      assert.ok(free >= RECORD_RESERVE_BYTES, `${model}: existing copies must leave the reserve`);
      return { ...(await original(directory)), bsize: 1, bavail: free };
    });
    try {
      const publish = (file, journal) => library.importVideoFile(file, journal);
      await assert.rejects(
        store.commit(session.sessionId, library.root, publish, async () => {
          throw Error("held readBack failure");
        }),
        /held readBack/,
      );
      const available = await fs.statfs(store.directory(session.sessionId));
      assert.ok(available.bavail - RECORD_RESERVE_BYTES < RECORD_CHUNK_BYTES);
      await store.commit(session.sessionId, library.root, publish, async (entry) => {
        await library.read(entry.id);
      });
      assert.equal(
        (await library.list()).filter((entry) => entry.id === session.sessionId).length,
        1,
      );
      assert.deepEqual([...checked].sort(), ["library", "raw"]);
    } finally {
      modeled.mock.restore();
    }
  }
});

test("destination allocation is checked separately and retained assembly can be retried after freeing space", async (t) => {
  const { store, library, session } = await fixture(t);
  await store.append(packet(session.sessionId, 0));
  await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
  const original = fs.statfs;
  const limited = t.mock.method(fs, "statfs", async (directory) => {
    const disk = await original(directory);
    return path.resolve(directory) === library.root
      ? { ...disk, bsize: 1, bavail: RECORD_RESERVE_BYTES + 4 }
      : disk;
  });
  const publish = (file, journal) => library.importVideoFile(file, journal);
  try {
    await assert.rejects(
      store.commit(session.sessionId, library.root, publish, async () => {}),
      /espaço|reserva/,
    );
    assert.equal(
      await fs.readFile(path.join(store.directory(session.sessionId), "recording.webm"), "utf8"),
      "video",
    );
    assert.equal((await fs.readdir(library.root)).length, 0);
  } finally {
    limited.mock.restore();
  }
  await store.commit(session.sessionId, library.root, publish, async (entry) => {
    await library.read(entry.id);
  });
});

test("space consumed after readBack cannot spend the reserve for committed journal or remove raw", async (t) => {
  const { store, library, session } = await fixture(t);
  await store.append(packet(session.sessionId, 0));
  await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
  let exhausted = false;
  const original = fs.statfs;
  const limited = t.mock.method(fs, "statfs", async (directory) => {
    const disk = await original(directory);
    return exhausted ? { ...disk, bsize: 1, bavail: RECORD_RESERVE_BYTES } : disk;
  });
  const publish = (file, journal) => library.importVideoFile(file, journal);
  try {
    await assert.rejects(
      store.commit(session.sessionId, library.root, publish, async (entry) => {
        await library.read(entry.id);
        exhausted = true;
      }),
      /reserva/,
    );
    assert.equal((await store.read(session.sessionId)).status, "finalized");
    assert.equal(
      await fs.readFile(path.join(store.directory(session.sessionId), "0.chunk"), "utf8"),
      "video",
    );
    exhausted = false;
    await store.commit(session.sessionId, library.root, publish, async (entry) => {
      await library.read(entry.id);
    });
    assert.equal((await library.list()).length, 1);
  } finally {
    limited.mock.restore();
  }
});

test("retained assembly and published media checksums reject corruption without discarding raw; pre-journal assembly is verified from parts", async (t) => {
  const { store, library } = await fixture(t);
  for (const corrupt of ["assembly", "library", "none-before-journal"]) {
    const session = await store.begin(library.root, 60);
    await store.append(packet(session.sessionId, 0));
    await store.finish({ sessionId: session.sessionId, durationMs: 1000 });
    const publish = (file, journal) => library.importVideoFile(file, journal);
    await assert.rejects(
      store.commit(session.sessionId, library.root, publish, async () => {
        throw Error("readBack unavailable");
      }),
      /unavailable/,
    );
    const directory = store.directory(session.sessionId);
    if (corrupt === "none-before-journal") {
      const journal = await store.read(session.sessionId);
      delete journal.sha256;
      await fs.writeFile(path.join(directory, "journal.json"), JSON.stringify(journal));
      await store.commit(session.sessionId, library.root, publish, async (entry) => {
        await library.read(entry.id);
      });
    } else {
      await fs.writeFile(
        corrupt === "assembly"
          ? path.join(directory, "recording.webm")
          : library.file(session.sessionId, "webm"),
        "wrong",
      );
      await assert.rejects(
        store.commit(session.sessionId, library.root, publish, async () => {}),
        /danificada|difere/,
      );
      assert.equal(await fs.readFile(path.join(directory, "0.chunk"), "utf8"), "video");
    }
  }
});
test("ranges are single bounded safe integers; capabilities authorize a large sparse video without eager reads", async (t) => {
  const { root, library } = await fixture(t);
  for (const range of [
    "bytes=",
    "bytes=-0",
    "bytes=8-2",
    "bytes=100-200",
    "bytes=0-1,3-4",
    "bytes=9007199254740993-",
    "items=0-4",
  ])
    assert.throws(() => videoRange(range, 100));
  assert.deepEqual(videoRange("bytes=-5", 100), { start: 95, end: 99, partial: true });
  const file = path.join(root, "large.webm");
  const handle = await fs.open(file, "wx");
  await handle.truncate(600_000_000);
  await handle.write(Buffer.from("range!"), 0, 6, 599_999_994);
  await handle.close();
  let allowed = true;
  const streams = new VideoStreams((owner) => allowed && owner === library.root);
  const url = await streams.grant(library.root, crypto.randomUUID(), file);
  const request = (range) => new Request(url, { headers: { range } });
  const response = await streams.respond(request("bytes=-6"));
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "range!");
  assert.equal(response.headers.get("Content-Range"), "bytes 599999994-599999999/600000000");
  assert.equal((await streams.respond(request("bytes=0-2,4-6"))).status, 416);
  assert.equal((await streams.respond(new Request(url + "/../secret"))).status, 403);
  assert.equal((await streams.respond(new Request(url, { method: "POST" }))).status, 405);
  const head = await streams.respond(new Request(url, { method: "HEAD" }));
  assert.equal(head.headers.get("Content-Length"), "600000000");
  assert.equal(await head.text(), "");
  const open = await streams.respond(new Request(url));
  const reader = open.body.getReader();
  const first = await reader.read();
  assert.ok(first.value.length <= 256 * 1024);
  allowed = false;
  await reader.cancel();
  assert.equal((await streams.respond(request("bytes=0-10"))).status, 403);
  streams.revoke();
  allowed = true;
  assert.equal((await streams.respond(request("bytes=0-10"))).status, 403);
});
test("display acquisition denies replaced, ended or mutated sessions after asynchronous source discovery", async () => {
  for (const mutation of ["replace", "stop", "source"]) {
    const authority = { sourceId: "owned" };
    let active = authority,
      stopped = false,
      complete;
    const resolution = resolveRecordingSource(
      authority,
      () => active === authority && !stopped,
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    if (mutation === "replace") active = { sourceId: "owned" };
    if (mutation === "stop") stopped = true;
    if (mutation === "source") authority.sourceId = "other";
    complete([{ id: "owned" }, { id: "other" }]);
    assert.equal(await resolution, null);
  }
  assert.deepEqual(
    await resolveRecordingSource(
      { sourceId: "owned" },
      () => true,
      async () => [{ id: "owned" }],
    ),
    { id: "owned" },
  );
  let calls = 0;
  assert.equal(
    await resolveRecordingSource(
      { sourceId: "owned" },
      () => false,
      async () => {
        calls++;
        return [];
      },
    ),
    null,
  );
  assert.equal(calls, 0);
});
test("revocation while file open or stream read is pending cannot deliver a stale capability", async (t) => {
  const { root, library } = await fixture(t);
  const file = path.join(root, "owned.webm");
  await fs.writeFile(file, Buffer.alloc(1024 * 1024, 7));
  const streams = new VideoStreams(() => true);
  const first = await streams.grant(library.root, crypto.randomUUID(), file);
  const pending = streams.respond(new Request(first));
  streams.revoke();
  assert.equal((await pending).status, 403);
  const second = await streams.grant(library.root, crypto.randomUUID(), file);
  const response = await streams.respond(new Request(second));
  const reader = response.body.getReader();
  const read = reader.read();
  streams.revoke();
  await assert.rejects(read, /encerrado/);
  await reader.cancel().catch((error) => assert.match(error.message, /encerrado/));
  const grant = streams.grant(library.root, crypto.randomUUID(), file);
  streams.revoke();
  await assert.rejects(grant, /mudou/);
});
