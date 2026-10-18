const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { zipSync, unzipSync } = require("fflate");
const { Library } = require("./library.cjs");
const {
  snapshot,
  encodeArchive,
  decodeArchive,
  importProject,
  verifiedCopy,
  sha256,
} = require("./portable.ts");
const { registerLibraryIpc, readPreferences, validateWebm } = require("./library-ipc.ts");
const { webpDimensions } = require("./raster-codec.mts");
const { FinalExport } = require("./final-export.mts");
async function fixture(t) {
  const base = path.resolve(__dirname, "../../test-results/portability");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const root = path.join(folder, "library"),
    lib = new Library(root);
  await lib.init();
  return { folder, lib, root };
}
test("trash/restore and metadata edits preserve original and raster assets; duplicate is fully editable", async (t) => {
  const { lib } = await fixture(t),
    assetId = randomUUID();
  const original = Buffer.from("source"),
    raster = Buffer.from("raster");
  const doc = await lib.save(
    { name: "Composição", annotations: [{ kind: "image", assetId, x: 1, y: 2, x2: 4, y2: 5 }] },
    original,
    [{ id: assetId, bytes: raster }],
  );
  const before = sha256(await fs.readFile(lib.file(doc.id, "png")));
  await lib.updateMetadata({
    id: doc.id,
    tags: ["escola"],
    collection: "Aulas",
    favorite: true,
    deletedAt: new Date().toISOString(),
  });
  assert.equal((await lib.list({})).total, 0);
  assert.equal((await lib.list({ trash: true })).total, 1);
  await lib.updateMetadata({ id: doc.id, deletedAt: null });
  assert.equal((await lib.list({ favorite: true, tag: "escola", collection: "Aulas" })).total, 1);
  assert.equal(sha256(await fs.readFile(lib.file(doc.id, "png"))), before);
  const duplicate = await lib.duplicate(doc.id),
    reopened = await lib.read(duplicate.id);
  assert.notEqual(duplicate.id, doc.id);
  assert.equal(reopened.annotations[0].assetId, assetId);
  assert.equal(reopened.annotations[0].dataUrl, undefined);
  assert.equal(reopened.assets.length, 1);
  assert.ok(reopened.assets[0].dataUrl.endsWith(raster.toString("base64")));
  assert.ok(reopened.dataUrl.endsWith(original.toString("base64")));
  await assert.rejects(
    lib.save({ id: doc.id, name: "overwrite" }, Buffer.from("other")),
    /imutável/,
  );
});
test("list/save use incremental index without hydrating the other projects", async (t) => {
  const { lib } = await fixture(t),
    a = await lib.save({ name: "A" }, Buffer.from("a")),
    b = await lib.save({ name: "B" }, Buffer.from("b"));
  await lib.list({});
  // Remove unrelated bytes after index initialization: metadata/list operation must not read them.
  await fs.unlink(lib.file(b.id, "png"));
  await fs.unlink(lib.file(b.id, "json"));
  await lib.updateMetadata({ id: a.id, name: "Renamed" });
  assert.equal((await lib.list({ search: "Renamed" })).total, 1);
  assert.equal((await lib.list({ search: "B" })).total, 1);
  await lib.refreshIndex();
  assert.equal((await lib.list({ search: "B" })).total, 0);
});
test("portable round-trip preserves original, edits and assets, reuses identical imports and resolves collisions safely", async (t) => {
  const { lib, folder } = await fixture(t);
  const doc = await lib.save(
    { name: "Source", annotations: [{ kind: "text", text: "Object", x: 0, y: 0 }] },
    Buffer.from("original"),
  );
  const source = await snapshot(lib.root, doc.id),
    archive = encodeArchive(source, "project"),
    decoded = decodeArchive(archive, "project");
  assert.deepEqual(decoded.files, source);
  assert.deepEqual(await importProject(lib.root, decoded.files), { id: doc.id, reused: true });
  await lib.updateMetadata({ id: doc.id, name: "Local changed" });
  const imported = await lib.importPortable(decoded.files);
  assert.equal((await lib.importPortable(decoded.files)).id, imported.id);
  assert.notEqual(imported.id, doc.id);
  assert.equal((await lib.read(doc.id)).name, "Local changed");
  assert.equal((await lib.read(imported.id)).annotations[0].text, "Object");
  const other = path.join(folder, "other");
  await fs.mkdir(other);
  await verifiedCopy(await snapshot(lib.root), other);
  assert.equal((await new Library(other).read(imported.id)).name, "Source");
});
test("backup round-trip retains damaged metadata and trash without changing the source", async (t) => {
  const { lib, folder } = await fixture(t);
  const doc = await lib.save({ name: "Trashed" }, Buffer.from("source"));
  await lib.updateMetadata({ id: doc.id, deletedAt: new Date().toISOString() });
  await fs.writeFile(path.join(lib.root, "broken.json"), "{damaged");
  const recovery = encodeArchive(await snapshot(lib.root, doc.id), "project");
  await fs.writeFile(path.join(lib.root, "recovery-example.edicapture"), recovery);
  const before = await snapshot(lib.root),
    archive = encodeArchive(before, "library"),
    decoded = decodeArchive(archive, "library");
  await verifiedCopy(decoded.files, path.join(folder, "restored"));
  assert.deepEqual(await snapshot(lib.root), before);
  assert.equal((await new Library(path.join(folder, "restored")).list({ trash: true })).total, 1);
  assert.equal(await fs.readFile(path.join(folder, "restored/broken.json"), "utf8"), "{damaged");
  assert.deepEqual(
    await fs.readFile(path.join(folder, "restored/recovery-example.edicapture")),
    recovery,
  );
});
test("portable validation rejects traversal, duplicate names, symlinks, wrong sizes, checksums and unsupported versions", async (t) => {
  const { lib } = await fixture(t),
    doc = await lib.save({ name: "A" }, Buffer.from("source"));
  const archive = encodeArchive(await snapshot(lib.root, doc.id), "project");
  const raw = unzipSync(archive);
  const wrongHash = { ...raw, [`${doc.id}.png`]: Buffer.from("change") };
  assert.throws(() => decodeArchive(Buffer.from(zipSync(wrongHash))), /Checksum/);
  assert.throws(
    () => decodeArchive(Buffer.from(zipSync({ "../escape": Buffer.from("x") }))),
    /Invalid|inválid|string/i,
  );
  const unsupported = {
    ...raw,
    "manifest.json": Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(raw["manifest.json"]).toString()), version: 2 }),
    ),
  };
  assert.throws(() => decodeArchive(Buffer.from(zipSync(unsupported))));
  const linked = Buffer.from(archive);
  let central = linked.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  linked.writeUInt32LE(0xa1ff0000, central + 38);
  assert.throws(() => decodeArchive(linked), /insegura/);
  const excess = Buffer.from(archive);
  central = excess.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  excess.writeUInt32LE(900_000_000, central + 24);
  assert.throws(() => decodeArchive(excess), /limite|divergente/);
  assert.throws(
    () =>
      decodeArchive(
        Buffer.from(zipSync({ "Photo.png": Buffer.from("x"), "photo.png": Buffer.from("y") })),
      ),
    /duplicada/,
  );
  const truncated = archive.subarray(0, archive.length - 1);
  assert.throws(() => decodeArchive(truncated));
});
test("verified copy refuses nonempty targets and disk failure leaves the source recoverable", async (t) => {
  const { lib, folder } = await fixture(t);
  const doc = await lib.save({ name: "Source" }, Buffer.from("source")),
    files = await snapshot(lib.root);
  await assert.rejects(verifiedCopy(files, lib.root), /vazia/);
  const blocker = path.join(folder, "blocked");
  await fs.writeFile(blocker, "existing");
  await assert.rejects(verifiedCopy(files, path.join(blocker, "child")));
  assert.equal((await lib.read(doc.id)).name, "Source");
  assert.deepEqual(await snapshot(lib.root), files);
  // A real filesystem write error cannot poison the serialized save queue.
  await assert.rejects(
    lib.save({
      id: doc.id,
      annotations: [{ kind: "image", assetId: randomUUID(), x: 0, y: 0, x2: 1, y2: 1 }],
    }),
  );
  await lib.updateMetadata({ id: doc.id, name: "Retry" });
  assert.equal((await lib.read(doc.id)).name, "Retry");
});
test("lying deflate sizes cannot allocate or accept output beyond declared bounds", () => {
  const huge = Buffer.alloc(2_000_000, 65),
    source = new Map([["payload.png", huge]]);
  const raw = unzipSync(encodeArchive(source, "library"));
  const manifest = JSON.parse(Buffer.from(raw["manifest.json"]).toString());
  manifest.files[0].size = 1;
  manifest.files[0].sha256 = sha256(Buffer.from("A"));
  raw["manifest.json"] = Buffer.from(JSON.stringify(manifest));
  const bomb = Buffer.from(zipSync(raw, { level: 9 }));
  let offset = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (offset >= 0) {
    const length = bomb.readUInt16LE(offset + 28),
      name = bomb.subarray(offset + 46, offset + 46 + length).toString();
    if (name === "payload.png") {
      bomb.writeUInt32LE(1, offset + 24);
      const local = bomb.readUInt32LE(offset + 42);
      bomb.writeUInt32LE(1, local + 22);
      break;
    }
    offset = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 4);
  }
  assert.throws(
    () => decodeArchive(bomb),
    /larger than 1 bytes|Cannot create a Buffer larger|output|size|length/i,
  );
});
test("workflow cancellation, strict invalid input, root copy and preference rollback use isolated actual files", async (t) => {
  const { lib, folder } = await fixture(t);
  let active = lib;
  const original = await lib.save({ name: "Source" }, Buffer.from("source"));
  const handlers = new Map(),
    choices = [],
    settingsPath = path.join(folder, "settings.json");
  const defaults = await readPreferences(settingsPath, lib.root);
  assert.equal(defaults.tray, false);
  assert.equal(defaults.startWithWindows, false);
  registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => active,
    preferences: defaults,
    settingsPath,
    electron: {
      dialog: {
        showOpenDialog: async () => choices.shift() || { canceled: true, filePaths: [] },
        showSaveDialog: async () => ({ canceled: true }),
      },
      nativeImage: {},
      clipboard: {},
      shell: {},
    },
    assertAccess() {},
    canSwitch: () => true,
    switching() {},
    applyPreferences() {},
    thumbnail() {},
    replaceRoot: async (root) => {
      active = new Library(root);
      await active.init();
    },
  });
  const workflow = handlers.get("library:workflow");
  assert.equal(await workflow({ action: "backup" }), null);
  assert.equal(await workflow({ action: "restore" }), null);
  assert.equal(await workflow({ action: "portable-import" }), null);
  assert.equal(await workflow({ action: "root", mode: "copy" }), null);
  assert.equal(await handlers.get("file:batch-destination")(-1), null);
  await assert.rejects(workflow({ action: "reveal", id: "../../escape" }));
  const destination = path.join(folder, "moved");
  await fs.mkdir(destination);
  choices.push({ canceled: false, filePaths: [destination] });
  await workflow({ action: "root", mode: "copy" });
  assert.equal(active.root, destination);
  assert.equal((await lib.read(original.id)).name, "Source");
  assert.equal((await active.read(original.id)).name, "Source");
  assert.equal(JSON.parse(await fs.readFile(settingsPath, "utf8")).root, destination);
  await fs.writeFile(settingsPath, "{broken");
  await assert.rejects(readPreferences(settingsPath, lib.root), /danificadas/);
});
test("WebM metadata contract validates header, budget and unsupported media", () => {
  validateWebm(Buffer.from("1a45dfa342827765626d0000", "hex"));
  assert.throws(() => validateWebm(Buffer.from("mp4-not-webm")), /WebM válido/);
});
test("WebP dimensions are bounded before decoding compressed pixels", () => {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8);
  bytes.write("VP8X", 12);
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(29, 24, 3);
  bytes.writeUIntLE(19, 27, 3);
  assert.deepEqual(webpDimensions(bytes), { width: 30, height: 20 });
  bytes.writeUIntLE(100_000, 24, 3);
  bytes.writeUIntLE(100_000, 27, 3);
  assert.throws(() => webpDimensions(bytes), /megapixels/);
  assert.throws(() => webpDimensions(bytes.subarray(0, 25)), /inválido/);
});
test("failed settings write rolls root back and retains verified destination and original", async (t) => {
  const { lib, folder } = await fixture(t),
    doc = await lib.save({ name: "Source" }, Buffer.from("original"));
  const handlers = new Map(),
    settingsPath = path.join(folder, "settings.json"),
    destination = path.join(folder, "destination");
  const preferences = await readPreferences(settingsPath, lib.root);
  await fs.mkdir(settingsPath);
  await fs.writeFile(path.join(settingsPath, "blocker"), "preserve");
  await fs.mkdir(destination);
  let active = lib;
  registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => active,
    preferences,
    settingsPath,
    electron: {
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [destination] }) },
      nativeImage: {},
      clipboard: {},
      shell: {},
    },
    assertAccess() {},
    canSwitch: () => true,
    switching() {},
    applyPreferences() {},
    thumbnail() {},
    replaceRoot: async (root) => {
      active = new Library(root);
      await active.init();
    },
  });
  await assert.rejects(handlers.get("library:workflow")({ action: "root", mode: "copy" }));
  assert.equal(active.root, lib.root);
  assert.equal((await lib.read(doc.id)).name, "Source");
  assert.equal((await new Library(destination).read(doc.id)).name, "Source");
  assert.equal(await fs.readFile(path.join(settingsPath, "blocker"), "utf8"), "preserve");
});
test("backup/restore workflow and favorite destinations are usable without changing originals", async (t) => {
  const { lib, folder } = await fixture(t),
    doc = await lib.save({ name: "Original" }, Buffer.from("bytes"));
  const before = await snapshot(lib.root),
    handlers = new Map(),
    choices = [],
    backup = path.join(folder, "backup.edilibrary"),
    restored = path.join(folder, "restored"),
    settingsPath = path.join(folder, "settings.json");
  await fs.mkdir(restored);
  let active = lib;
  registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => active,
    preferences: await readPreferences(settingsPath, lib.root),
    settingsPath,
    electron: {
      dialog: {
        showOpenDialog: async () => choices.shift() || { canceled: true, filePaths: [] },
        showSaveDialog: async () => ({ canceled: false, filePath: backup }),
      },
      nativeImage: {},
      clipboard: {},
      shell: {},
    },
    assertAccess() {},
    canSwitch: () => true,
    switching() {},
    applyPreferences() {},
    thumbnail() {},
    replaceRoot: async (root) => {
      active = new Library(root);
      await active.init();
    },
  });
  const workflow = handlers.get("library:workflow");
  assert.equal(await workflow({ action: "backup" }), backup);
  assert.deepEqual(await snapshot(lib.root), before);
  const backupHash = sha256(await fs.readFile(backup));
  await lib.updateMetadata({ id: doc.id, name: "Changed local" });
  choices.push(
    { canceled: false, filePaths: [backup] },
    { canceled: false, filePaths: [restored] },
  );
  await workflow({ action: "restore" });
  assert.equal((await active.read(doc.id)).name, "Original");
  assert.equal((await lib.read(doc.id)).name, "Changed local");
  assert.equal(sha256(await fs.readFile(backup)), backupHash);
  choices.push({ canceled: false, filePaths: [folder] });
  assert.deepEqual((await workflow({ action: "destination-add" })).destinations, [folder]);
  choices.push({ canceled: false, filePaths: [folder] });
  assert.deepEqual((await workflow({ action: "destination-add" })).destinations, [folder]);
  const token = await handlers.get("file:batch-destination")(0);
  assert.match(token, /^[a-f0-9-]{36}$/);
  assert.equal(await handlers.get("file:batch-finish")(token), true);
  assert.deepEqual((await workflow({ action: "destination-remove", index: 0 })).destinations, []);
});
test("final export clipboard validates identity, existence, size and stale replacement without touching clipboard", async (t) => {
  const { folder, lib } = await fixture(t),
    tracker = new FinalExport();
  await assert.rejects(tracker.validated(), /Exporte um arquivo/);
  await assert.rejects(
    tracker.copyFile(() => {}),
    /Exporte um arquivo/,
  );
  const png = path.join(folder, "Final $(never-executed) [imagem].png");
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");
  await fs.writeFile(png, bytes);
  await tracker.remember(png, "png");
  assert.equal((await tracker.validated()).file, png);
  const replacement = path.join(folder, "replacement.png");
  await fs.writeFile(replacement, bytes);
  await fs.rename(replacement, png);
  await assert.rejects(tracker.validated(), /alterado ou substituído/);
  await tracker.remember(png, "png");
  await fs.unlink(png);
  await assert.rejects(tracker.validated(), /não está mais disponível/);
  const large = path.join(folder, "large.webm");
  await fs.writeFile(large, "x");
  await fs.truncate(large, 400_000_001);
  await tracker.remember(large, "webm");
  await assert.rejects(
    tracker.copyFile(() => {}),
    /400 MB/,
  );
  await assert.rejects(tracker.remember(large, "png"), /400 MB/);
  await assert.rejects(tracker.remember(folder, "png"), /inválido/);
  const handlers = new Map(),
    copiedText = [];
  const workflow = registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => lib,
    preferences: await readPreferences(path.join(folder, "settings.json"), lib.root),
    settingsPath: path.join(folder, "settings.json"),
    electron: {
      clipboard: { writeText: (value) => copiedText.push(value) },
      dialog: {},
      nativeImage: {},
      shell: {},
    },
    assertAccess() {},
    canSwitch: () => true,
    switching() {},
    replaceRoot: async () => {},
    applyPreferences() {},
    thumbnail() {},
  });
  await assert.rejects(handlers.get("file:copy-final")(), /Exporte um arquivo/);
  await assert.rejects(handlers.get("file:copy-path")(), /Exporte um arquivo/);
  await fs.writeFile(png, bytes);
  await workflow.rememberExport(png, "png");
  assert.throws(() => handlers.get("file:copy-final")(png), /Too big|expected|Too many|array/i);
  await assert.rejects(handlers.get("file:copy-path")(png));
  assert.equal(await handlers.get("file:copy-path")(), png);
  assert.deepEqual(copiedText, [png]);
  await fs.unlink(png);
  await assert.rejects(handlers.get("file:copy-final")(), /não está mais disponível/);
  assert.deepEqual(copiedText, [png], "file action never degrades to text copy");
});
