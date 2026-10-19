const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const { Library } = require("./library.cjs");
const { atomicWrite } = require("@informach/edi-desktop/files");
const { copyVideo } = require("./video-files.ts");

const hash = (value) => createHash("sha256").update(value).digest("hex");
test("individual export preserves every library file through direct, junction and case aliases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edicaptura-export-final-"));
  const lib = new Library(path.join(root, "library"));
  await lib.init();
  const output = path.join(root, "output");
  await fs.mkdir(output);
  const original = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await lib.save({ name: "Owned image", kind: "image" }, original);
  const video = await lib.save(
    { kind: "video", name: "Owned video" },
    Buffer.from("owned-video-bytes"),
  );
  const protectedFiles = [
    lib.file(image.id, "png"),
    lib.file(image.id, "json"),
    lib.file(video.id, "webm"),
    lib.file(video.id, "json"),
  ];
  const protectedHashes = new Map(
    await Promise.all(protectedFiles.map(async (file) => [file, hash(await fs.readFile(file))])),
  );
  const originalRoot = lib.root;
  const alias = path.join(root, "alias");
  await fs.symlink(lib.root, alias, process.platform === "win32" ? "junction" : "dir");
  const source = await fs.readFile(path.join(__dirname, "main.cjs"), "utf8");
  const callbackSource = source.slice(
    source.indexOf('  handle("file:export"'),
    source.indexOf('  handle("control:state"'),
  );
  let callback;
  let destination;
  let remembered = 0;
  let checks = 0;
  let revokeAt = Infinity;
  let switchAt = Infinity;
  let mutation = "switch";
  let finalCanonicalCheck = false;
  let finalMutation = null;
  let accessRevoked = false;
  const context = {
    library: lib,
    librarySwitch: false,
    editor: {
      isDestroyed: () => false,
      trustedURL: "owned://editor",
      webContents: { mainFrame: { url: "owned://editor" } },
    },
    desktop: {
      assertAccess() {
        checks++;
        if (finalCanonicalCheck && finalMutation) {
          finalCanonicalCheck = false;
          queueMicrotask(finalMutation);
        }
        if (checks === switchAt) {
          if (mutation === "root") lib.root = output;
          else if (mutation === "library") context.library = new Library(output);
          else if (mutation === "editor") context.editor = { isDestroyed: () => false };
          else if (mutation === "frame")
            context.editor.webContents.mainFrame = { url: "owned://editor" };
          else if (mutation === "navigation")
            context.editor.webContents.mainFrame.url = "owned://other";
          else context.librarySwitch = true;
        }
        if (checks >= revokeAt || accessRevoked) throw new Error("owned-access-revoked");
      },
    },
    app: { getPath: () => output },
    path,
    fs,
    Buffer,
    atomicWrite,
    copyVideo,
    BrowserWindow: {},
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
    send() {},
    pngBytes: () => original,
    nativeImage: { createFromBuffer: () => ({ toJPEG: () => Buffer.from("owned-jpeg") }) },
    decodeRaster: async () => ({ getSize: () => ({ width: 8, height: 8 }), isEmpty: () => false }),
    libraryWorkflow: {
      rememberExport: async () => {
        remembered++;
      },
    },
    publishIndividualExport: (...args) =>
      require("./export-destination.ts").publishIndividualExport(...args),
    handle: (_name, _roles, handler) => {
      callback = handler;
    },
  };
  vm.runInNewContext(callbackSource, context);
  // Real Library read remains in the WebM route; the owned record is format-valid.
  try {
    const cases = [];
    for (const format of ["png", "jpg", "webp", "webm"])
      for (const file of protectedFiles)
        for (const target of [
          file,
          path.join(alias, path.basename(file)),
          ...(process.platform === "win32" ? [file.toUpperCase()] : []),
        ])
          cases.push({ format, target });
    for (const { format, target } of cases) {
      destination = target;
      checks = 0;
      const beforeRemember = remembered;
      await assert.rejects(
        callback({
          id: video.id,
          format,
          dataUrl: "data:image/webp;base64,b3duZWQ=",
          name: "owned",
        }),
        /biblioteca/,
      );
      assert.equal(remembered, beforeRemember);
      for (const file of protectedFiles)
        assert.equal(hash(await fs.readFile(file)), protectedHashes.get(file));
    }
    for (const format of ["png", "jpg", "webp", "webm"]) {
      destination = path.join(output, `valid.${format}`);
      checks = 0;
      await callback({
        id: video.id,
        format,
        dataUrl: "data:image/webp;base64,b3duZWQ=",
        name: "owned",
      });
      const expected =
        format === "png"
          ? original
          : format === "jpg"
            ? Buffer.from("owned-jpeg")
            : format === "webp"
              ? Buffer.from("owned")
              : Buffer.from("owned-video-bytes");
      assert.deepEqual(await fs.readFile(destination), expected);
    }
    const guardCount = checks;
    for (const mode of ["revoke", "switch", "root", "library", "editor", "frame", "navigation"])
      for (let boundary = 1; boundary <= guardCount; boundary++) {
        checks = 0;
        lib.root = originalRoot;
        context.library = lib;
        context.editor = {
          isDestroyed: () => false,
          trustedURL: "owned://editor",
          webContents: { mainFrame: { url: "owned://editor" } },
        };
        context.librarySwitch = false;
        mutation = mode;
        revokeAt = mode === "revoke" ? boundary : Infinity;
        switchAt = mode !== "revoke" ? boundary : Infinity;
        destination = path.join(output, `authority-${mode}-${boundary}.webm`);
        const beforeRemember = remembered;
        await assert.rejects(callback({ id: video.id, format: "webm", name: "owned" }));
        await assert.rejects(fs.stat(destination), { code: "ENOENT" });
        assert.equal(remembered, beforeRemember);
      }
    // Hold the real final canonical lookup. Also change authority in the microtask
    // after its guard, before the enclosing await resumes at the rename boundary.
    for (const mode of ["during-await", "post-await"])
      for (const authority of ["revoke", "root"]) {
        lib.root = originalRoot;
        context.library = lib;
        context.librarySwitch = false;
        context.editor = {
          isDestroyed: () => false,
          trustedURL: "owned://editor",
          webContents: { mainFrame: { url: "owned://editor" } },
        };
        revokeAt = switchAt = Infinity;
        accessRevoked = false;
        checks = 0;
        destination = path.join(output, `late-${mode}-${authority}.webm`);
        const marker = Buffer.from("owned-prior-output");
        await fs.writeFile(destination, marker);
        const beforeRemember = remembered;
        const realpath = fs.realpath;
        let targetCalls = 0;
        let release;
        let reached;
        const held = new Promise((resolve) => {
          reached = resolve;
        });
        const barrier = new Promise((resolve) => {
          release = resolve;
        });
        const mutate = () => {
          if (authority === "revoke") accessRevoked = true;
          else lib.root = output;
        };
        fs.realpath = async (...args) => {
          const actual = await realpath(...args);
          if (args[0] === destination && ++targetCalls === 2) {
            reached();
            await barrier;
            if (mode === "post-await") finalCanonicalCheck = true;
          }
          return actual;
        };
        finalMutation = mode === "post-await" ? mutate : null;
        const operation = callback({ id: video.id, format: "webm", name: "owned" });
        try {
          await held;
          if (mode === "during-await") mutate();
          release();
          await assert.rejects(operation);
          assert.deepEqual(await fs.readFile(destination), marker);
          assert.equal(remembered, beforeRemember);
        } finally {
          release();
          fs.realpath = realpath;
          finalMutation = null;
          finalCanonicalCheck = false;
        }
      }
    console.log(
      JSON.stringify({
        protectedDestinationCases: cases.length,
        externalControls: 4,
        authorityCases: guardCount * 7,
        finalAsyncBoundaryCases: 4,
      }),
    );
  } finally {
    // Only this newly-created synthetic fixture; no historic media is enumerated.
    await fs.unlink(alias);
    await fs.rm(root, { recursive: true });
  }
});
