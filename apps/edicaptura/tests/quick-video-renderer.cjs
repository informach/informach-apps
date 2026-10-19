const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { NativeMedia, resolveNativeMedia } = require("@informach/edi-desktop/native-media");
const { QuickVideo } = require("../src/main/quick-video.ts");
const { Library } = require("../src/main/library.cjs");
const { VideoStreams } = require("../src/main/video-stream.ts");

(async () => {
  const base = path.resolve(__dirname, "../test-results");
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, "quick-video-"));
  const media = new NativeMedia(
    resolveNativeMedia({
      packaged: false,
      resourcesPath: "",
      developmentRoot: path.resolve(__dirname, "../../.."),
    }),
  );
  const service = new QuickVideo(media, path.join(root, "cache"));
  const streams = new VideoStreams(() => true);
  let browser, server, origin, page, exported;
  const urls = (url) => url.replace("edicaptura-media://video/", `${origin}/owned-media/`);
  const lib = new Library(path.join(root, "library"), async (folder, id, file) =>
    urls(await streams.grant(folder, id, file)),
  );
  try {
    await lib.init();
    const source = path.join(root, "source.webm");
    await media.run(media.paths.ffmpeg, [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=20:d=3",
      "-c:v",
      "libvpx-vp9",
      "-live",
      "1",
      source,
    ]);
    const doc = await lib.save(
      { kind: "video", name: "Vídeo próprio", media: { status: "pending" } },
      await fs.readFile(source),
    );
    const { createServer } = await import("vite");
    server = await createServer({
      root: path.resolve(__dirname, ".."),
      configFile: false,
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        {
          name: "owned-video",
          configureServer(vite) {
            vite.middlewares.use(async (req, res, next) => {
              if (!req.url.startsWith("/owned-media/")) return next();
              const request = new Request(
                `edicaptura-media://video/${req.url.slice("/owned-media/".length)}`,
                { headers: req.headers.range ? { Range: req.headers.range } : {} },
              );
              const response = await streams.respond(request);
              res.writeHead(response.status, Object.fromEntries(response.headers));
              if (!response.body) return res.end();
              const reader = response.body.getReader();
              res.on("close", () => {
                void reader.cancel();
              });
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
                res.end();
              } catch {
                res.destroy();
              }
            });
          },
        },
      ],
    });
    await server.listen();
    origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.exposeFunction("bridge", async (action, value) => {
      if (action === "list") return lib.list(value);
      if (action === "read") return lib.read(value);
      if (action === "update") return lib.updateMetadata(value);
      if (action === "inspect") return service.inspect(lib, value, () => {});
      if (action === "cancel") return service.cancel(value);
      if (action === "output") {
        const result = await service.output(
          lib,
          value,
          value.preview ? null : path.join(root, `output-${value.jobId}.${value.format}`),
          () => {},
          (ratio) => {
            void page.evaluate((event) => window.fixture.progress?.(event), {
              jobId: value.jobId,
              ratio,
            });
          },
        );
        exported = result;
        return value.preview
          ? {
              ...result,
              url: urls(await streams.grant(lib.root, doc.id, result.file, "image/gif")),
            }
          : result;
      }
      throw new Error(`Unknown fixture action ${action}`);
    });
    await page.addInitScript(() => {
      window.fixture = {};
      window.ediSuite = { onRecovery() {} };
      window.edi = {
        recordRecoveries: async () => [],
        status: async () => ({ version: "test", captureShortcut: "PrintScreen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: (v) => window.bridge("list", v),
        read: (v) => window.bridge("read", v),
        update: (v) =>
          window.bridge("update", v).then((result) => {
            window.fixture.lastSaved = result;
            return result;
          }),
        videoInspect: (v) => window.bridge("inspect", v),
        videoOutput: (v) => window.bridge("output", v),
        videoCancel: (v) => window.bridge("cancel", v),
        onVideoProgress: (cb) => {
          window.fixture.progress = cb;
        },
        onDocument: (cb) => {
          window.fixture.open = cb;
        },
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
      };
    });
    await page.goto(`${origin}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.open);
    await page.evaluate((id) => window.edi.read(id).then(window.fixture.open), doc.id);
    await page.waitForFunction(() =>
      document.querySelector("#video-metadata").textContent.includes("320 × 180"),
    );
    await page.locator("#video-start").fill("0.5");
    await page.locator("#video-end").fill("1.5");
    await page.locator("#video-trim").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.lastSaved?.videoRecipe?.start === 0.5);
    assert.deepEqual((await lib.read(doc.id)).videoRecipe, { version: 1, start: 0.5, end: 1.5 });
    await page.locator("#video-undo").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.lastSaved?.videoRecipe === null);
    assert.equal((await lib.read(doc.id)).videoRecipe, null);
    await page.locator("#video-redo").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.lastSaved?.videoRecipe?.start === 0.5);
    assert.equal((await lib.read(doc.id)).videoRecipe.start, 0.5);
    await page.evaluate(() => {
      const video = document.querySelector("#video-preview");
      video.currentTime = 2;
      video.dispatchEvent(new Event("timeupdate"));
    });
    assert.equal(await page.locator("#video-preview").evaluate((video) => video.currentTime), 0.5);
    await page.locator("#video-width").fill("160");
    await page.locator("#video-gif-preview").click();
    await page.waitForFunction(() => {
      const image = document.querySelector("#video-gif-image");
      return !image.hidden && image.naturalWidth === 160;
    });
    assert.equal(exported.format, "gif");
    await page.locator("#video-mp4").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("Arquivo salvo"),
    );
    const info = await media.probe(exported.file);
    assert.equal(info.width, 160);
    assert(Math.abs(info.duration - 1) < 0.1);
    assert.equal(info.hasAudio, false);
    await page.reload();
    await page.waitForFunction(() => window.fixture.open);
    await page.evaluate((id) => window.edi.read(id).then(window.fixture.open), doc.id);
    await page.waitForFunction(() => document.querySelector("#video-start").value === "0.5");
    assert.equal(await page.locator("#video-end").inputValue(), "1.5");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        realRenderer: true,
        metadata: true,
        trim: true,
        undoRedoPersisted: true,
        previewClamped: true,
        actualGif: true,
        mp4: info,
        reopen: true,
        sourceBytes: (await fs.stat(lib.file(doc.id, "webm"))).size,
      }),
    );
  } finally {
    await service.cancel();
    streams.revoke();
    await browser?.close();
    await server?.close();
    assert(path.resolve(root).startsWith(base + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
