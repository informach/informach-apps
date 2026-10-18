const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { NativeMedia, resolveNativeMedia } = require("@informach/edi-desktop/native-media");
const { QuickVideo } = require("../src/main/quick-video.ts");
const { videoOutputSchema } = require("../src/domain/quick-video.ts");
const { Library } = require("../src/main/library.cjs");
const { snapshot, importProject } = require("../src/main/portable.ts");
const { VideoStreams } = require("../src/main/video-stream.ts");
const { FinalExport } = require("../src/main/final-export.mts");

test("approved native media: real metadata, frame, selected GIF/MP4/audio, recipe/portable, failures/cancel and range", {
  timeout: 120000,
}, async () => {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(require("node:os").tmpdir()), "edi-quick-video-"),
  );
  const media = new NativeMedia(
    resolveNativeMedia({
      packaged: false,
      resourcesPath: "",
      developmentRoot: path.resolve(__dirname, "../../.."),
    }),
  );
  const lib = new Library(path.join(root, "library"));
  await lib.init();
  const service = new QuickVideo(media, path.join(root, "cache"));
  let pending;
  try {
    assert.match(await media.run(media.paths.ffmpeg, ["-version"]), /version 9\.0\.2/);
    const input = path.join(root, "sintético-áudio.webm");
    await media.run(media.paths.ffmpeg, [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=320x180:r=20:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=320x180:r=20:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=green:s=320x180:r=20:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=3",
      "-filter_complex",
      "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
      "-map",
      "[v]",
      "-map",
      "3:a",
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "opus",
      "-strict",
      "-2",
      "-metadata",
      "title=private-source-marker",
      "-live",
      "1",
      input,
    ]);
    const bytes = await fs.readFile(input),
      originalHash = createHash("sha256").update(bytes).digest("hex");
    const doc = await lib.save(
      { kind: "video", name: "Vídeo sintético", media: { status: "pending" } },
      bytes,
    );
    const ready = await service.inspect(lib, doc.id, () => {});
    assert.equal(ready.media.status, "ready");
    assert.equal(ready.media.width, 320);
    assert.equal(ready.media.height, 180);
    assert.equal(ready.media.hasAudio, true);
    assert(Math.abs(ready.media.durationSeconds - 3) < 0.1);
    assert.match(ready.preview, /^data:image\/png;base64,/);
    const malformed = await lib.save(
      { kind: "video", name: "Invalid fixture", media: { status: "pending" } },
      Buffer.from("invalid-owned-webm"),
    );
    await assert.rejects(service.inspect(lib, malformed.id, () => {}));
    assert.equal((await lib.read(malformed.id)).media.status, "failed");
    assert.equal(
      (await fs.readFile(lib.file(malformed.id, "webm"))).toString(),
      "invalid-owned-webm",
    );
    const recipe = { version: 1, start: 1.15, end: 1.85 };
    await lib.updateMetadata({ id: doc.id, videoRecipe: recipe });
    assert.deepEqual((await new Library(lib.root).read(doc.id)).videoRecipe, recipe);
    const portableRoot = path.join(root, "portable");
    await fs.mkdir(portableRoot);
    await importProject(portableRoot, await snapshot(lib.root, doc.id));
    assert.deepEqual((await new Library(portableRoot).read(doc.id)).videoRecipe, recipe);
    const request = (format, extra = {}) =>
      videoOutputSchema.parse({
        id: doc.id,
        jobId: randomUUID(),
        recipe,
        format,
        width: 160,
        fps: 10,
        at: 1.5,
        ...extra,
      });
    const { registerQuickVideo } = require("../src/main/quick-video-ipc.ts");
    const handlers = new Map();
    let releasePicker, reachedPicker;
    const pickerReached = new Promise((done) => {
      reachedPicker = done;
    });
    const picker = new Promise((done) => {
      releasePicker = done;
    });
    const workflow = registerQuickVideo({
      app: {
        isPackaged: false,
        getAppPath: () => path.resolve(__dirname, "../../.."),
        getPath: () => root,
      },
      handle: (name, _roles, operation) => handlers.set(name, operation),
      library: () => lib,
      streams: new VideoStreams(() => true),
      assertAccess() {},
      beginJob: () => ({ check() {}, finish() {} }),
      chooseDestination: async () => {
        reachedPicker();
        return picker;
      },
      remember: async () => {},
      progress() {},
    });
    const pickerRequest = request("mp4");
    const canceledPicker = handlers.get("video:output")(pickerRequest);
    const pickerRejected = assert.rejects(canceledPicker, /cancelada/);
    await pickerReached;
    assert.equal(workflow.busy(), true);
    await handlers.get("video:cancel")(pickerRequest.jobId);
    releasePicker(path.join(root, "late.mp4"));
    await pickerRejected;
    assert.equal(workflow.busy(), false);
    await assert.rejects(fs.stat(path.join(root, "late.mp4")), { code: "ENOENT" });
    await workflow.close();
    const progress = [];
    const mp4 = await service.output(
      lib,
      request("mp4"),
      path.join(root, "saída.mp4"),
      () => {},
      (n) => progress.push(n),
    );
    assert(progress.length > 0 && progress.at(-1) === 1);
    const mp4Info = await media.probe(mp4.file);
    assert.equal(mp4Info.videoCodec, "h264");
    assert.equal(mp4Info.width, 160);
    assert.equal(mp4Info.height, 90);
    assert.equal(mp4Info.hasAudio, true);
    assert(Math.abs(mp4Info.duration - 0.7) < 0.1);
    const inspect = JSON.parse(
      await media.run(media.paths.ffprobe, [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        mp4.file,
      ]),
    );
    assert(!JSON.stringify(inspect).includes("private-source-marker"));
    assert.equal(inspect.streams.length, 2);
    assert.equal(inspect.streams.find((s) => s.codec_type === "audio").codec_name, "aac");
    let audioBytes = 0,
      energy = 0;
    await media.run(
      media.paths.ffmpeg,
      ["-v", "error", "-i", mp4.file, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1"],
      {
        onStdout(chunk) {
          audioBytes += chunk.length;
          for (let n = 0; n + 1 < chunk.length; n += 2) energy += chunk.readInt16LE(n) ** 2;
        },
      },
    );
    assert(audioBytes > 48000 && audioBytes < 90000);
    assert(Math.sqrt(energy / (audioBytes / 2)) > 500);
    const blue = async (file) => {
      const chunks = [];
      await media.run(
        media.paths.ffmpeg,
        [
          "-v",
          "error",
          "-i",
          file,
          "-frames:v",
          "1",
          "-vf",
          "scale=1:1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { onStdout: (chunk) => chunks.push(chunk) },
      );
      const pixel = Buffer.concat(chunks);
      assert(
        pixel[2] > 180 && pixel[0] < 60 && pixel[1] < 60,
        `Selected blue frame: ${[...pixel]}`,
      );
    };
    await blue(mp4.file);
    const frame = await service.output(
      lib,
      request("png"),
      path.join(root, "quadro.png"),
      () => {},
      () => {},
    );
    await blue(frame.file);
    const gif = await service.output(
      lib,
      request("gif"),
      null,
      () => {},
      () => {},
    );
    await blue(gif.file);
    assert(gif.bytes > 0);
    const gifProbe = JSON.parse(
      await media.run(media.paths.ffprobe, [
        "-v",
        "error",
        "-show_format",
        "-of",
        "json",
        gif.file,
      ]),
    );
    assert(Math.abs(Number(gifProbe.format.duration) - 0.7) < 0.11);
    const streams = new VideoStreams(() => true),
      url = await streams.grant(lib.root, doc.id, gif.file, "image/gif");
    const response = await streams.respond(new Request(url, { headers: { Range: "bytes=0-5" } }));
    assert.equal(response.headers.get("Content-Type"), "image/gif");
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "GIF89a");
    await streams.revokeFile(gif.file);
    assert.equal((await streams.respond(new Request(url))).status, 403);
    const final = new FinalExport();
    await final.remember(mp4.file, "mp4");
    assert.equal((await final.validated()).size, mp4.bytes);
    await fs.appendFile(mp4.file, "changed");
    await assert.rejects(final.validated(), /alterado/);
    await assert.rejects(
      service.output(
        lib,
        request("mp4", { recipe: { ...recipe, end: 30 } }),
        path.join(root, "bad.mp4"),
        () => {},
        () => {},
      ),
      /Intervalo/,
    );
    await assert.rejects(
      service.output(
        lib,
        request("png", { at: 0 }),
        path.join(root, "bad.png"),
        () => {},
        () => {},
      ),
      /Quadro/,
    );
    const canceled = request("mp4");
    await assert.rejects(
      service.output(
        lib,
        canceled,
        path.join(root, "cancel.mp4"),
        () => {},
        () => {
          void service.cancel(canceled.jobId);
        },
      ),
      /cancel|abort/i,
    );
    assert(
      !(await fs.readdir(root)).some((name) => name.includes("partial") || name === "cancel.mp4"),
    );
    for (const format of ["mp4", "gif"]) {
      const large = path.join(root, `large-owned.${format}`);
      await fs.writeFile(large, "controlled sparse fixture");
      await fs.truncate(large, 400_000_001);
      await final.remember(large, format);
      assert.equal((await final.validated()).size, 400_000_001);
      await assert.rejects(
        final.copyFile(() => {
          throw Error("Clipboard must not be reached");
        }),
        /400 MB/,
      );
      await fs.unlink(large);
    }
    const libraryAlias = path.join(root, "library-alias");
    await fs.symlink(lib.root, libraryAlias, "junction");
    for (const target of [
      lib.file(doc.id, "webm").toUpperCase(),
      path.join(libraryAlias, `${doc.id}.webm`),
    ]) {
      await assert.rejects(
        service.output(
          lib,
          request("mp4"),
          target,
          () => {},
          () => {},
        ),
        /original não pode/,
      );
      assert.equal(
        createHash("sha256")
          .update(await fs.readFile(lib.file(doc.id, "webm")))
          .digest("hex"),
        originalHash,
      );
    }
    await fs.unlink(libraryAlias);
    const before = await fs.readFile(lib.file(doc.id, "webm"));
    assert.equal(createHash("sha256").update(before).digest("hex"), originalHash);
    const abort = new AbortController();
    let started;
    const announced = new Promise((resolve) => {
      started = resolve;
    });
    pending = media.run(
      media.paths.ffmpeg,
      [
        "-v",
        "error",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:r=20:d=60",
        "-f",
        "null",
        "-",
      ],
      { jobId: "owned-cancel", signal: abort.signal, duration: 60, onProgress: () => started() },
    );
    const rejected = assert.rejects(pending, /abort|cancel/i);
    await announced;
    await assert.rejects(
      media.run(media.paths.ffmpeg, ["-version"], { jobId: "owned-cancel" }),
      /andamento/,
    );
    abort.abort();
    await rejected;
    await media.run(media.paths.ffmpeg, ["-version"], { jobId: "owned-cancel" });
    await assert.rejects(
      media.run(media.paths.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=s=1920x1080:d=1",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "pipe:1",
      ]),
      /2 MiB/,
    );
    console.log(
      JSON.stringify({
        native: "9.0.2",
        realProbe: ready.media,
        mp4: mp4Info,
        gifBytes: gif.bytes,
        frame: [frame.width, frame.height],
        audioBytes,
        sourceUnchanged: true,
        cancellationWaitedForClose: true,
      }),
    );
  } finally {
    await service.cancel();
    await pending?.catch(() => undefined);
    assert(path.resolve(root).startsWith(path.resolve(require("node:os").tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
});
const { syncBuiltinESMExports } = require("node:module");
for (const mode of ["cancel", "revoke", "control"])
  test(`final publication boundary: ${mode} alone preserves authority and files`, {
    timeout: 30000,
  }, async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(require("node:os").tmpdir()), "edi-publication-boundary-"),
    );
    const media = new NativeMedia(
      resolveNativeMedia({
        packaged: false,
        resourcesPath: "",
        developmentRoot: path.resolve(__dirname, "../../.."),
      }),
    );
    const lib = new Library(path.join(root, "library"));
    const service = new QuickVideo(media, path.join(root, "cache"));
    const originalRealpath = fs.realpath;
    let release, deadline;
    try {
      await lib.init();
      const input = path.join(root, "owned.webm");
      await media.run(media.paths.ffmpeg, [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=blue:s=64x48:r=20:d=1",
        "-c:v",
        "libvpx-vp9",
        input,
      ]);
      const sourceBytes = await fs.readFile(input);
      const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
      const sourceHash = hash(sourceBytes);
      const doc = await lib.save({ kind: "video", name: "Owned boundary fixture" }, sourceBytes);
      const destination = path.join(root, "owned-output.mp4");
      const marker = Buffer.from("existing owned destination");
      await fs.writeFile(destination, marker);
      let reached,
        calls = 0,
        permitted = true;
      const reachedBoundary = new Promise((done) => {
        reached = done;
      });
      const barrier = new Promise((done) => {
        release = done;
      });
      // Preserve actual filesystem resolution; hold only the final canonical
      // destination response, after encoding/probe/fsync and before publication.
      fs.realpath = async (file, ...args) => {
        const actual = await originalRealpath.call(fs, file, ...args);
        if (path.resolve(file) === root && ++calls === 3) {
          reached();
          await barrier;
        }
        return actual;
      };
      syncBuiltinESMExports();
      const jobId = randomUUID();
      const output = service.output(
        lib,
        { id: doc.id, jobId, recipe: { version: 1, start: 0, end: 0.8 }, format: "mp4", width: 64 },
        destination,
        () => {
          if (!permitted) throw new Error("owned authority revoked");
        },
        () => {},
      );
      const outcome = output.then(
        (value) => ({ success: true, value }),
        (error) => ({ success: false, error }),
      );
      await Promise.race([
        reachedBoundary,
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Final publication boundary not reached")),
            20000,
          );
        }),
      ]);
      clearTimeout(deadline);
      assert.equal(service.busy, true);
      assert.deepEqual(await fs.readFile(destination), marker);
      if (mode === "revoke") permitted = false;
      const cancellation = mode === "cancel" ? service.cancel(jobId) : null;
      release();
      const result = await outcome;
      await cancellation;
      const finalSource = await fs.readFile(lib.file(doc.id, "webm"));
      const finalDestination = await fs.readFile(destination);
      const partials = (await fs.readdir(root)).filter((name) => name.includes(".partial."));
      console.log(
        JSON.stringify({
          boundary: "last destination realpath before rename",
          mode,
          calls,
          cancellationRequested: mode === "cancel",
          authorityRevoked: !permitted,
          success: result.success,
          sourceUnchanged: hash(finalSource) === sourceHash,
          destinationUnchanged: finalDestination.equals(marker),
          stagingFiles: partials.length,
          jobStillBusy: service.busy,
        }),
      );
      assert.equal(calls, 3);
      assert.deepEqual(finalSource, sourceBytes);
      assert.equal(hash(finalSource), sourceHash);
      assert.deepEqual(partials, []);
      assert.equal(service.busy, false);
      if (mode === "control") {
        assert.equal(result.success, true);
        assert(!finalDestination.equals(marker));
        const info = await media.probe(destination);
        assert.equal(info.videoCodec, "h264");
        assert.equal(info.width, 64);
        assert.equal(info.height, 48);
      } else {
        assert.equal(result.success, false, `${mode} must reject before publication`);
        assert.match(
          result.error.message,
          mode === "cancel" ? /abort|cancel/i : /owned authority revoked/,
        );
        assert.deepEqual(finalDestination, marker);
        assert.equal(hash(finalDestination), hash(marker));
      }
    } finally {
      clearTimeout(deadline);
      release?.();
      fs.realpath = originalRealpath;
      syncBuiltinESMExports();
      await service.cancel();
      assert(path.resolve(root).startsWith(path.resolve(require("node:os").tmpdir()) + path.sep));
      await fs.rm(root, { recursive: true, force: true });
    }
  });
