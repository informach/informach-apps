import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { chromium, type Page } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { portableVisualFixture } from "../portableVisualFixture";
import { rasterTestBundle } from "../rasterBundle";
import { decodeGif, readEbml, readMp4Boxes } from "../rasterDecoders";
import { rendererServer } from "../rendererServer";

declare global {
  interface Window {
    EdiRasterTest?: typeof import("../rasterBrowser");
  }
}

const SIZE = 200;
interface Stats {
  width: number;
  height: number;
  mean: number;
  over: number;
  alphaMismatch: number;
}
/** Decodes two images in the page and measures their difference per channel. */
function compareInPage(page: Page, a: string, b: string, threshold: number) {
  return page.evaluate(
    async ({ a, b, threshold }) => {
      const read = await Promise.all(
        [a, b].map(async (source) => {
          const bitmap = await createImageBitmap(await (await fetch(source)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
            context = canvas.getContext("2d");
          if (!context) throw new Error("Missing comparison canvas");
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        }),
      );
      const [left, right] = read;
      if (!left || !right) throw new Error("Missing images");
      if (left.width !== right.width || left.height !== right.height)
        return { width: right.width, height: right.height, mean: 255, over: 1, alphaMismatch: 1 };
      let total = 0,
        over = 0,
        alphaMismatch = 0;
      for (let offset = 0; offset < left.data.length; offset += 4) {
        let worst = 0;
        for (let channel = 0; channel < 3; channel++) {
          const diff = Math.abs(
            (left.data[offset + channel] ?? 0) - (right.data[offset + channel] ?? 0),
          );
          total += diff;
          worst = Math.max(worst, diff);
        }
        if (worst > threshold) over++;
        if ((left.data[offset + 3] ?? 0) >= 128 !== (right.data[offset + 3] ?? 0) >= 128)
          alphaMismatch++;
      }
      const pixels = left.width * left.height;
      return {
        width: left.width,
        height: left.height,
        mean: total / (pixels * 3),
        over: over / pixels,
        alphaMismatch: alphaMismatch / pixels,
      };
    },
    { a, b, threshold },
  ) as Promise<Stats>;
}
const dataUrl = (bytes: Uint8Array, type: string) =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

test("raster frames match the live shared player and every format decodes in the browser", {
  timeout: 180000,
}, async () => {
  const fixture = portableVisualFixture(),
    project = fixture.project,
    board = project.artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(project, board.id, {
      animationId: fixture.animationId,
    }),
    server = await rendererServer(
      new Map([
        [
          "/raster.html",
          {
            content: `<!doctype html><body style="margin:0;background:#fff"><svg id="ref" width="${SIZE}" height="${SIZE}" style="display:block"></svg></body>`,
            mime: "text/html",
          },
        ],
      ]),
    ),
    code = await rasterTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({
        viewport: { width: 400, height: 400 },
        deviceScaleFactor: 1,
      }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/raster.html`);
    await page.addScriptTag({ content: code });
    await page.evaluate(async (document) => {
      const svg = window.document.querySelector("#ref"),
        api = window.EdiRasterTest;
      if (!(svg instanceof SVGSVGElement) || !api) throw new Error("Missing raster runtime");
      Reflect.set(
        window,
        "referencePlayer",
        await api.createVisualSvgPlayerAsync(svg, document, {
          autoplay: false,
          respectReducedMotion: false,
          pauseOffscreen: false,
        }),
      );
    }, compiled.document);
    const base = {
      artboardId: board.id,
      animationId: fixture.animationId,
      width: SIZE,
      height: SIZE,
      fps: 10,
      confirmRaster: true,
      confirmAnimationOnly: true,
      confirmPalette: true,
    };
    const exported = await page.evaluate(
      async ({ project, base }) => {
        const api = window.EdiRasterTest;
        if (!api) throw new Error("Missing raster runtime");
        const results: Record<string, { extension: string; type: string; bytes: number[] }> = {};
        for (const [format, background] of [
          ["png-sequence", "#ffffff"],
          ["png-sequence", "transparent"],
          ["gif", "transparent"],
          ["webm", "#ffffff"],
          ["mp4", "#ffffff"],
        ] as const) {
          const support =
            format === "mp4"
              ? await VideoEncoder.isConfigSupported({
                  codec: "avc1.64001e",
                  width: 200,
                  height: 200,
                  framerate: 10,
                  avc: { format: "avc" },
                })
              : { supported: true };
          if (!support.supported) continue;
          const result = await api.buildRasterExport(project, { ...base, format, background });
          results[`${format}:${background}`] = {
            extension: result.extension,
            type: result.type,
            bytes: Array.from(result.content),
          };
        }
        return results;
      },
      { project, base },
    );
    const opaque = exported["png-sequence:#ffffff"],
      transparent = exported["png-sequence:transparent"];
    assert.ok(opaque && transparent);
    assert.equal(opaque.extension, "png.zip");
    const files = unzipSync(Uint8Array.from(opaque.bytes)),
      clear = unzipSync(Uint8Array.from(transparent.bytes)),
      manifest = JSON.parse(strFromU8(files["sequence.json"] ?? new Uint8Array()));
    assert.equal(manifest.frames, 11);
    assert.equal(manifest.loop, false);
    assert.equal(manifest.files[10].time, 1);
    // Reference: a screenshot of the same player mounted live in the page DOM.
    let clock = 0;
    for (const index of [0, 3, 7, 10]) {
      const time = manifest.files[index].time as number;
      await page.evaluate((delta) => {
        const player = Reflect.get(window, "referencePlayer");
        if (delta > 0) player.advance(delta);
      }, time - clock);
      clock = time;
      const screenshot = await page.locator("#ref").screenshot(),
        frame = files[`quadro-${String(index).padStart(5, "0")}.png`];
      assert.ok(frame);
      const stats = await compareInPage(
        page,
        dataUrl(screenshot, "image/png"),
        dataUrl(frame, "image/png"),
        24,
      );
      assert.equal(stats.width, SIZE);
      assert.ok(
        stats.mean < 1.5 && stats.over < 0.01,
        `frame ${index} differs from the live player: ${JSON.stringify(stats)}`,
      );
    }
    const first = files["quadro-00000.png"],
      last = files["quadro-00010.png"],
      firstClear = clear["quadro-00000.png"];
    assert.ok(first && last && firstClear);
    const motion = await compareInPage(
      page,
      dataUrl(first, "image/png"),
      dataUrl(last, "image/png"),
      24,
    );
    assert.ok(motion.over > 0.02, `animation should move the mask: ${JSON.stringify(motion)}`);
    const alpha = await page.evaluate(
      async (source) => {
        const bitmap = await createImageBitmap(await (await fetch(source)).blob()),
          canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
          context = canvas.getContext("2d");
        if (!context) throw new Error("Missing alpha canvas");
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let transparentPixels = 0;
        for (let offset = 3; offset < data.length; offset += 4)
          if ((data[offset] ?? 0) === 0) transparentPixels++;
        return transparentPixels / (bitmap.width * bitmap.height);
      },
      dataUrl(firstClear, "image/png"),
    );
    assert.ok(alpha > 0.2, `transparent PNG keeps its empty areas transparent (${alpha})`);
    // GIF: our independent reader and the browser's own decoder agree with the PNG frames.
    const gifEntry = exported["gif:transparent"];
    assert.ok(gifEntry);
    const gifBytes = Uint8Array.from(gifEntry.bytes),
      gif = decodeGif(gifBytes);
    assert.equal(gif.frames.length, 11);
    assert.equal(gif.loop, false);
    assert.deepEqual(new Set(gif.frames.map((frame) => frame.delay)), new Set([10]));
    const browserGif = await page.evaluate(
      async (source) => {
        const decoder = new ImageDecoder({
          data: await (await fetch(source)).arrayBuffer(),
          type: "image/gif",
        });
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        if (!track) throw new Error("Missing GIF track");
        const durations: number[] = [];
        for (let index = 0; index < track.frameCount; index++) {
          const { image } = await decoder.decode({ frameIndex: index });
          durations.push(image.duration ?? 0);
          image.close();
        }
        return { frameCount: track.frameCount, durations };
      },
      dataUrl(gifBytes, "image/gif"),
    );
    assert.equal(browserGif.frameCount, 11);
    assert.ok(browserGif.durations.every((value) => value === 100000));
    // Videos: Chromium's own demuxers and decoders read the muxed files.
    for (const key of ["webm:#ffffff", "mp4:#ffffff"]) {
      const entry = exported[key];
      if (!entry) {
        assert.equal(key, "mp4:#ffffff", "WebM VP9 encoding is required");
        continue;
      }
      const bytes = Uint8Array.from(entry.bytes);
      if (key.startsWith("webm")) assert.equal(readEbml(bytes).length, 2);
      else
        assert.deepEqual(
          readMp4Boxes(bytes).map((box) => box.type),
          ["ftyp", "moov", "mdat"],
        );
      const playable = await page.evaluate(
        (type) => document.createElement("video").canPlayType(type),
        key.startsWith("webm") ? 'video/webm; codecs="vp9"' : 'video/mp4; codecs="avc1.64001e"',
      );
      if (!playable) continue;
      const video = await page.evaluate(
        async ({ source, times }) => {
          const element = document.createElement("video");
          element.muted = true;
          element.src = source;
          await new Promise((resolve, reject) => {
            element.addEventListener("loadeddata", resolve, { once: true });
            element.addEventListener("error", () => reject(new Error("Video did not load")), {
              once: true,
            });
          });
          const frames: string[] = [];
          for (const time of times) {
            element.currentTime = time;
            await new Promise((resolve) =>
              element.addEventListener("seeked", resolve, { once: true }),
            );
            const canvas = document.createElement("canvas");
            canvas.width = element.videoWidth;
            canvas.height = element.videoHeight;
            canvas.getContext("2d")?.drawImage(element, 0, 0);
            frames.push(canvas.toDataURL("image/png"));
          }
          return {
            width: element.videoWidth,
            height: element.videoHeight,
            duration: element.duration,
            frames,
          };
        },
        { source: dataUrl(bytes, entry.type), times: [0.05, 0.55, 1.05] },
      );
      assert.equal(video.width, SIZE);
      assert.equal(video.height, SIZE);
      assert.ok(Math.abs(video.duration - 1.1) < 0.06, `${key} duration ${video.duration}`);
      for (const [position, index] of [0, 5, 10].entries()) {
        const frame = files[`quadro-${String(index).padStart(5, "0")}.png`],
          decoded = video.frames[position];
        assert.ok(frame && decoded);
        const stats = await compareInPage(page, decoded, dataUrl(frame, "image/png"), 48);
        assert.ok(
          stats.mean < 6 && stats.over < 0.03,
          `${key} frame ${index}: ${JSON.stringify(stats)}`,
        );
      }
    }
    assert.deepEqual(errors, []);
    const leftovers = await page.evaluate(
      () => document.querySelectorAll('body > div[aria-hidden="true"]').length,
    );
    assert.equal(leftovers, 0);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("export dialog gates raster formats on consents and downloads the files it reports", {
  timeout: 180000,
}, async () => {
  const fixture = portableVisualFixture(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.getByText("Silhueta animada").first().click();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    const download = async (
      format: string,
      prepare: (dialog: ReturnType<Page["locator"]>) => Promise<void>,
    ) => {
      await page.locator('[data-action="export"]').click();
      const dialog = page.locator("#export-dialog");
      await dialog.locator(`[name="format"][value="${format}"]`).check();
      await dialog.getByLabel("Largura da exportação").fill("120");
      assert.equal(await dialog.locator("#download").isDisabled(), true);
      await prepare(dialog);
      await dialog.getByLabel("Confirmar conversão em imagens").check();
      assert.equal(
        await dialog.locator("#download").isDisabled(),
        true,
        "timeline consent is still missing",
      );
      await dialog.getByLabel("Confirmar exportação somente da timeline").check();
      await dialog.locator("#download:not([disabled])").waitFor();
      const downloading = page.waitForEvent("download");
      await dialog.locator("#download").click();
      const file = await downloading,
        path = await file.path();
      assert.ok(path);
      return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile(path)) };
    };
    const zip = await download("png-sequence", async () => {});
    assert.equal(zip.name, "projeto.png.zip");
    const sequence = JSON.parse(
      strFromU8(unzipSync(zip.bytes)["sequence.json"] ?? new Uint8Array()),
    );
    assert.equal(sequence.width, 120);
    assert.equal(sequence.height, 120);
    assert.equal(sequence.frames, 11);
    const gif = await download("gif", async (dialog) => {
      await dialog.getByLabel("Confirmar paleta do GIF").check();
    });
    assert.equal(gif.name, "projeto.gif");
    assert.equal(decodeGif(gif.bytes).frames.length, 11);
    const webm = await download("webm", async (dialog) => {
      assert.equal(await dialog.getByLabel("Fundo transparente").count(), 0);
      await dialog.getByLabel("Cor de fundo do vídeo").fill("#102030");
      await dialog.getByText("Verificando o codificador de vídeo…").waitFor({ state: "detached" });
    });
    assert.equal(webm.name, "projeto.webm");
    assert.equal(readEbml(webm.bytes)[0]?.id, 0x1a45dfa3);
    // Odd heights are rounded up to the even size the report announces.
    await page.locator('[data-action="export"]').click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('[name="format"][value="mp4"]').check();
    await dialog.getByLabel("Manter a proporção da prancheta").uncheck();
    await dialog.getByLabel("Altura da exportação").fill("101");
    await dialog.getByText(/Vídeo usa 1\d+×102/).waitFor();
    await dialog.getByText(/quadros · \d+×102 · 10 FPS/).waitFor();
    await dialog.locator("#close-export").click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
