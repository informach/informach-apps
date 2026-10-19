const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { RecordingStore } = require("../src/main/recording-store.ts");
const { Library } = require("../src/main/library.cjs");
const { VideoStreams } = require("../src/main/video-stream.ts");
const fixture = {
  mimeTypeHasOpus: (type) => typeof type === "string" && type.includes("opus"),
};
async function run() {
  const parent = path.resolve(__dirname, "../test-results/recording-renderer");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "case-"));
  const { createServer } = await import("vite");
  const library = new Library(path.join(root, "library"));
  await library.init();
  const store = new RecordingStore(path.join(root, "raw"));
  const streams = new VideoStreams((owner) => owner === library.root);
  let servedBytes = 0;
  const serveVideo = async (req, res) => {
    const abort = new AbortController();
    res.once("close", () => abort.abort());
    try {
      const response = await streams.respond(
        new Request(`edicaptura-media://video/${req.url.slice(1)}`, {
          headers: req.headers.range ? { range: req.headers.range } : {},
          signal: abort.signal,
        }),
      );
      console.log(
        JSON.stringify({ fixtureMediaStatus: response.status, ownUrlLength: req.url.length }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        for await (const chunk of response.body) {
          servedBytes += chunk.length;
          if (res.destroyed) break;
          if (!res.write(chunk))
            await new Promise((resolve) => {
              const done = () => {
                res.off("drain", done);
                res.off("close", done);
                resolve();
              };
              res.once("drain", done);
              res.once("close", done);
            });
        }
      res.end();
    } catch (error) {
      res.destroy(error);
    }
  };
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    plugins: [
      {
        name: "controlled-video",
        configureServer(server) {
          server.middlewares.use("/fixture-video/", serveVideo);
          server.middlewares.use("/fixture-recovery", (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end('<!doctype html><body><section class="main-actions"></section></body>');
          });
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  // Chromium's fake microphone plays a steady beep: the sound test needs a real signal.
  const browser = await chromium.launch({
    headless: true,
    // Electron's default autoplay policy: sound starts without a click, as in the app.
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const failures = [];
  try {
    for (const mode of [
      "resume-stop",
      "resume-stop-event",
      "resume-stop-error",
      "backpressure",
      "disk-error",
      "sound-pause",
    ]) {
      const session = await store.begin(library.root, 60);
      const page = await browser.newPage();
      const phases = [];
      const beganAt = Date.now(),
        phaseEvents = [],
        appendEvents = [];
      let appendStartedAt = null;
      let releaseFirst,
        releaseResume,
        failFinal = false,
        first = true,
        saved,
        pending = 0,
        peak = 0;
      let releaseInitialFailure;
      const initialFailureBarrier =
        mode === "disk-error"
          ? new Promise((resolve) => {
              releaseInitialFailure = resolve;
            })
          : null;
      const firstBarrier =
        mode === "sound-pause"
          ? Promise.resolve()
          : mode !== "disk-error"
            ? new Promise((resolve) => {
                releaseFirst = resolve;
              })
            : null;
      const resumeBarrier = mode.startsWith("resume-stop")
        ? new Promise((resolve) => {
            releaseResume = resolve;
          })
        : null;
      page.on("console", (message) => {
        if (message.type() === "error") console.log("fixtureConsole", message.text());
      });
      page.on("pageerror", (error) => failures.push(error.message));
      await page.exposeFunction("fixtureAppend", async (packet) => {
        pending++;
        appendStartedAt = Date.now();
        peak = Math.max(peak, pending);
        try {
          if (failFinal) {
            failFinal = false;
            throw Error("Controlled final append unavailable");
          }
          if (first) {
            first = false;
            if (firstBarrier) await firstBarrier;
            else throw Error("Controlled disk unavailable");
          }
          return await store.append({ ...packet, bytes: new Uint8Array(packet.bytes) });
        } finally {
          appendEvents.push({
            sequence: packet.sequence,
            bytes: packet.bytes.length,
            beganMs: appendStartedAt - beganAt,
            elapsedMs: Date.now() - appendStartedAt,
          });
          appendStartedAt = null;
          pending--;
        }
      });
      await page.exposeFunction("fixturePhase", async (phase) => {
        phases.push(phase);
        phaseEvents.push({ phase, atMs: Date.now() - beganAt });
        if (phase === "failed" && initialFailureBarrier) await initialFailureBarrier;
        if (phase === "recording" && resumeBarrier) await resumeBarrier;
      });
      await page.exposeFunction("fixtureSave", async (input) => {
        await store.finish(input);
        saved = await store.commit(
          input.sessionId,
          library.root,
          (file, journal) => library.importVideoFile(file, journal),
          async (record) => {
            await library.read(record.id);
          },
        );
        return true;
      });
      await page.addInitScript(
        ({ session, sound }) => {
          window.fixture = {
            saves: [],
            options: {
              version: 1,
              microphone: { enabled: sound, volume: 100, muted: false, deviceId: "" },
              system: { enabled: sound, volume: 80, muted: false },
              countdown: sound ? 1 : 0,
            },
            notices: [],
            callbacks: {},
            started: false,
            phase: "preparing",
            tracks: [],
          };
          window.ediSuite = {
            onRecovery(callback) {
              window.fixture.recover = callback;
            },
          };
          const fixture = window.fixture;
          fixture.emitted = [];
          const NativeRecorder = MediaRecorder;
          window.MediaRecorder = class extends NativeRecorder {
            constructor(...args) {
              super(...args);
              fixture.mimeType = this.mimeType;
              this.addEventListener("dataavailable", (event) => fixture.emitted.push(event.data));
              this.addEventListener("stop", () => {
                fixture.stopped = true;
              });
            }
          };
          navigator.mediaDevices.getDisplayMedia = async (constraints) => {
            fixture.displayConstraints = constraints;
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 480;
            const context = canvas.getContext("2d");
            const pixels = context.createImageData(640, 480);
            let seed = 19;
            const paint = () => {
              for (let i = 0; i < pixels.data.length; i += 4) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                pixels.data[i] = seed >>> 24;
                pixels.data[i + 1] = seed >>> 16;
                pixels.data[i + 2] = seed >>> 8;
                pixels.data[i + 3] = 255;
              }
              context.putImageData(pixels, 0, 0);
            };
            paint();
            const stream = canvas.captureStream(30);
            const timer = setInterval(paint, 33);
            if (constraints?.audio) {
              // The computer's sound: a quiet tone, as Windows loopback would hand it.
              const context = new AudioContext();
              const tone = context.createOscillator();
              const level = context.createGain();
              level.gain.value = 0.2;
              const out = context.createMediaStreamDestination();
              tone.connect(level).connect(out);
              tone.start();
              stream.addTrack(out.stream.getAudioTracks()[0]);
            }
            fixture.tracks = stream.getTracks();
            const monitor = setInterval(() => {
              if (fixture.tracks.every((track) => track.readyState === "ended")) {
                clearInterval(timer);
                clearInterval(monitor);
              }
            }, 33);
            return stream;
          };
          const publish = (phase) => {
            fixture.phase = phase;
            fixture.callbacks.control?.({
              mode: "video",
              phase,
              width: 640,
              height: 480,
              count: 0,
              monitor: "Synthetic canvas",
            });
          };
          window.edi = {
            controlState: async () => ({
              mode: "video",
              phase: "preparing",
              width: 640,
              height: 480,
              count: 0,
              monitor: "Synthetic canvas",
            }),
            onControl: (callback) => {
              fixture.callbacks.control = callback;
            },
            onControlError() {},
            onRecordProgress: (callback) => {
              fixture.callbacks.progress = callback;
            },
            onStop: (callback) => {
              fixture.callbacks.stop = callback;
            },
            beginRecording: async () => {
              window.dispatchEvent(
                new CustomEvent("edicaptura-record", {
                  detail: {
                    ...session,
                    rect: { x: 0, y: 0, width: 640, height: 480 },
                    display: { width: 640, height: 480 },
                  },
                }),
              );
            },
            recordReady: async () => {
              fixture.started = true;
              publish("recording");
            },
            recordPhase: async (phase) => {
              publish(phase);
              await window.fixturePhase(phase);
            },
            recordAppend: async (packet) => {
              const ack = await window.fixtureAppend({
                ...packet,
                bytes: Array.from(packet.bytes),
              });
              fixture.callbacks.progress?.(ack);
              return ack;
            },
            recordSave: (input) => window.fixtureSave(input),
            recordFailed: async (message) => {
              fixture.notices.push(message);
            },
            finish: async () => fixture.recover(),
            recordOptions: async () => ({ ...fixture.options, error: null }),
            recordOptionsSave: async (options) => {
              fixture.saves.push(options);
              fixture.options = options;
              return options;
            },
            onTogglePause: (callback) => {
              fixture.callbacks.togglePause = callback;
            },
            cancel: async () => fixture.recover(),
          };
        },
        { session, sound: mode === "sound-pause" },
      );
      const url = server.resolvedUrls.local[0];
      await page.goto(`${url}src/recording/control.html`);
      await page.waitForFunction(() => window.fixture.started);
      if (mode === "sound-pause") {
        // No disk barrier here: the sound and the manual pause are checked below.
      } else if (mode !== "disk-error") {
        await page.waitForFunction(() => window.fixture.phase === "paused", { timeout: 45000 });
        const before = await page.locator("#timer").textContent();
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              let frames = 0;
              const frame = () => (++frames === 20 ? resolve() : requestAnimationFrame(frame));
              requestAnimationFrame(frame);
            }),
        );
        assert.equal(await page.locator("#timer").textContent(), before);
        releaseFirst();
        try {
          await page.waitForFunction(() => window.fixture.phase === "recording");
        } catch (error) {
          console.error(
            "Resume diagnostic",
            JSON.stringify({
              mode,
              phases,
              pending,
              phaseEvents,
              appendEvents,
              appendPendingMs: appendStartedAt === null ? null : Date.now() - appendStartedAt,
              renderer: await page.evaluate(() => ({
                phase: window.fixture.phase,
                title: document.querySelector("#title").textContent,
                stopped: window.fixture.stopped,
                notices: window.fixture.notices,
              })),
              journal: await store.read(session.sessionId),
            }),
          );
          throw error;
        }
      } else await page.waitForFunction(() => window.fixture.phase === "failed");
      if (mode === "sound-pause") {
        await page.waitForFunction(() => window.fixture.phase === "recording");
        assert.ok(fixture.mimeTypeHasOpus(await page.evaluate(() => window.fixture.mimeType)));
        assert.equal(
          JSON.stringify(await page.evaluate(() => window.fixture.displayConstraints.audio)),
          JSON.stringify({
            restrictOwnAudio: true,
            suppressLocalAudioPlayback: false,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }),
        );
        // Both meters hear their source before the pause.
        try {
          await page.waitForFunction(
            () =>
              document.querySelector("#mic-level").value > -60 &&
              document.querySelector("#system-level").value > -60,
          );
        } catch (error) {
          console.error(
            "Sound meter diagnostic",
            JSON.stringify(
              await page.evaluate(() => ({
                mic: document.querySelector("#mic-level").value,
                system: document.querySelector("#system-level").value,
                micStatus: document.querySelector("#mic-status").textContent,
                systemStatus: document.querySelector("#system-status").textContent,
                error: document.querySelector("#error").textContent,
              })),
            ),
          );
          throw error;
        }
        await page.waitForFunction(() => window.fixture.emitted.length >= 4);
        await page.locator("#pause").click();
        await page.waitForFunction(() => window.fixture.phase === "held");
        assert.equal(await page.locator("#pause").textContent(), "Retomar");
        const heldTimer = await page.locator("#timer").textContent();
        const heldParts = await page.evaluate(() => window.fixture.emitted.length);
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));
        assert.equal(await page.locator("#timer").textContent(), heldTimer);
        assert.equal(await page.evaluate(() => window.fixture.emitted.length), heldParts);
        // The global shortcut reaches the controller as this event.
        await page.evaluate(() => window.fixture.callbacks.togglePause());
        await page.waitForFunction(() => window.fixture.phase === "recording");
        await page.waitForFunction((parts) => window.fixture.emitted.length > parts + 1, heldParts);
        await page.locator("#finish").click();
      } else if (mode === "resume-stop-event")
        await page.evaluate(() => window.fixture.callbacks.stop());
      else await page.locator("#finish").click();
      if (initialFailureBarrier) {
        assert.equal(saved, undefined);
        releaseInitialFailure();
      }
      if (resumeBarrier) {
        await page.waitForFunction(() => window.fixture.stopped);
        assert.equal(saved, undefined);
        failFinal = mode === "resume-stop-error";
        releaseResume();
        if (mode === "resume-stop-error") {
          await page.waitForFunction(() => window.fixture.phase === "failed");
          assert.equal(saved, undefined);
          assert.ok((await store.read(session.sessionId)).bytes > 0);
          await page.locator("#finish").click();
        }
      }
      try {
        await page.waitForFunction(
          () => document.querySelector("#title").textContent === "Gravação salva na biblioteca.",
        );
      } catch (error) {
        console.error(
          "Recording completion diagnostic",
          JSON.stringify({
            mode,
            phases,
            pending,
            renderer: await page.evaluate(() => ({
              phase: window.fixture.phase,
              stopped: window.fixture.stopped,
              title: document.querySelector("#title").textContent,
              error: document.querySelector("#error").textContent,
              notices: window.fixture.notices,
              emitted: window.fixture.emitted.map((part) => part.size),
            })),
            journal: await store.read(session.sessionId),
          }),
        );
        throw error;
      }
      assert.ok(saved);
      const emitted = await page.evaluate(async () => {
        const bytes = await new Blob(window.fixture.emitted).arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        return {
          bytes: bytes.byteLength,
          sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
        };
      });
      const stored = await fs.readFile(library.file(saved.id, "webm"));
      assert.equal(
        stored.length,
        emitted.bytes,
        `${mode}: every emitted/admitted byte must be saved`,
      );
      assert.equal(createHash("sha256").update(stored).digest("hex"), emitted.sha256);
      assert.equal(peak, 1, "only one chunk IPC in flight");
      assert.ok(
        await page.evaluate(() =>
          window.fixture.tracks.every((track) => track.readyState === "ended"),
        ),
      );
      const journal = await store.read(session.sessionId);
      assert.equal(journal.status, "committed");
      assert.ok(journal.durationMs > 0);
      if (mode === "sound-pause") {
        const held = phaseEvents.filter((event) => event.phase === "held");
        assert.equal(held.length, 1, "one manual pause");
        const wall = Date.now() - beganAt;
        assert.ok(
          journal.durationMs < wall - 1400,
          `active duration ${journal.durationMs} ms leaves out the 1.5 s pause of ${wall} ms`,
        );
      }
      const capability = await streams.grant(
        library.root,
        saved.id,
        library.file(saved.id, "webm"),
      );
      await page.evaluate(
        async (playback) => {
          const video = document.createElement("video");
          video.muted = true;
          document.body.append(video);
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(Error("Synthetic video cannot be decoded"));
            video.src = playback;
          });
          if (video.videoWidth !== 640 || video.videoHeight !== 480)
            throw Error("Unexpected decoded dimensions");
          await video.play();
          video.pause();
          video.remove();
        },
        `${url}fixture-video/${capability.split("/").at(-1)}`,
      );
      console.log(
        JSON.stringify({
          mode,
          parts: journal.parts.length,
          bytes: journal.bytes,
          activeDurationMs: journal.durationMs,
          onePacketInFlight: peak,
          phases,
          phaseEvents,
          appendEvents,
          decode: "640x480",
          tracksEnded: true,
          emittedBytes: emitted.bytes,
          emittedSha256: emitted.sha256,
          allFinalBytesPersisted: true,
        }),
      );
      await page.close();
    }
    const original = (await library.list())[0];
    const bytes = await fs.readFile(library.file(original.id, "webm"));
    const largeFile = path.join(root, "large-owned.webm");
    await fs.writeFile(largeFile, bytes);
    await fs.truncate(largeFile, 600_000_000);
    const largeUrl = await streams.grant(library.root, crypto.randomUUID(), largeFile);
    const largePage = await browser.newPage();
    await largePage.goto(`${server.resolvedUrls.local[0]}fixture-recovery`);
    const beforeLarge = servedBytes;
    await largePage.evaluate(
      async (url) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        document.body.append(video);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("Large video decode deadline")), 10000);
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(Error("Large owned video decode failed"));
          };
          video.src = url;
        });
        if (video.videoWidth !== 640 || video.videoHeight !== 480)
          throw Error("Large decoded dimensions mismatch");
        video.removeAttribute("src");
        video.load();
        video.remove();
        const prefix = await fetch(url, { headers: { Range: "bytes=0-1048575" } });
        if (
          prefix.status !== 206 ||
          prefix.headers.get("content-range") !== "bytes 0-1048575/600000000" ||
          (await prefix.arrayBuffer()).byteLength !== 1048576
        )
          throw Error("Large prefix range failed");
        const range = await fetch(url, { headers: { Range: "bytes=599999994-599999999" } });
        if (
          range.status !== 206 ||
          range.headers.get("content-range") !== "bytes 599999994-599999999/600000000" ||
          (await range.arrayBuffer()).byteLength !== 6
        )
          throw Error("Large suffix range failed");
      },
      `${server.resolvedUrls.local[0]}fixture-video/${largeUrl.split("/").at(-1)}`,
    );
    await largePage.close();
    console.log(
      JSON.stringify({
        largeOwnedFileBytes: 600_000_000,
        servedBytes: servedBytes - beforeLarge,
        decode: "640x480",
        prefixRange: 1048576,
        suffixRange: 6,
      }),
    );
    const interrupted = await store.begin(library.root, 60);
    for (let offset = 0, sequence = 0; offset < bytes.length; offset += 1024 * 1024, sequence++) {
      const chunk = bytes.subarray(offset, offset + 1024 * 1024);
      await store.append({
        sessionId: interrupted.sessionId,
        sequence,
        bytes: chunk,
        sha256: createHash("sha256").update(chunk).digest("hex"),
        durationMs: 1000,
      });
    }
    const startup = new RecordingStore(store.root);
    const recoveries = await startup.recoveries();
    const conflict = library.file(interrupted.sessionId, "json");
    await fs.mkdir(conflict);
    const recoveryPage = await browser.newPage();
    recoveryPage.on("pageerror", (error) => failures.push(error.message));
    await recoveryPage.exposeFunction("fixtureRecover", (id) =>
      startup.commit(
        id,
        library.root,
        (file, journal) => library.importVideoFile(file, journal),
        async (record) => {
          await library.read(record.id);
        },
      ),
    );
    await recoveryPage.goto(`${server.resolvedUrls.local[0]}fixture-recovery`);
    await recoveryPage.evaluate(async (recoveries) => {
      window.recoveryNotices = [];
      const { mountRecordingRecovery } = await import("/src/editor/recording-recovery.js");
      await mountRecordingRecovery(
        {
          recordRecoveries: async () => recoveries,
          recordRecover: (id) => window.fixtureRecover(id),
        },
        () => async (document) => {
          window.activatedRecovery = document.id;
        },
        (message) => window.recoveryNotices.push(message),
      );
    }, recoveries);
    const recoverButton = recoveryPage.getByRole("button", {
      name: "Recuperar na biblioteca original",
    });
    await recoverButton.click();
    await recoveryPage.waitForFunction(() => window.recoveryNotices.length > 0);
    assert.equal(await recoverButton.isEnabled(), true);
    assert.ok(
      (await fs.stat(path.join(store.directory(interrupted.sessionId), "0.chunk"))).isFile(),
    );
    await fs.rmdir(conflict);
    await recoverButton.click();
    await recoveryPage.waitForFunction(
      (id) => window.activatedRecovery === id,
      interrupted.sessionId,
    );
    assert.equal(await recoveryPage.locator(".recording-recovery").count(), 0);
    assert.equal((await startup.read(interrupted.sessionId)).status, "committed");
    console.log(
      JSON.stringify({
        recoveryUI: true,
        diskFailureKeepsRaw: true,
        explicitRetry: true,
        sameLibraryIdentity:
          interrupted.sessionId === (await library.read(interrupted.sessionId)).id,
      }),
    );
    await recoveryPage.close();
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    await server.close();
    streams.revoke();
    assert.ok(root.startsWith(parent + path.sep));
    await fs.rm(root, { recursive: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
