const assert = require("node:assert/strict");
const path = require("node:path");
const { deflateSync } = require("node:zlib");
const { chromium } = require("playwright");
const { ScrollSession } = require("../src/main/scroll-session.ts");
const { scrollMain } = require("./fixtures/scroll-main.cjs");
function png(frame) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]),
      output = Buffer.alloc(body.length + 8);
    output.writeUInt32BE(data.length);
    body.copy(output, 4);
    let crc = 0xffffffff;
    for (const b of body) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(frame.width);
  header.writeUInt32BE(frame.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(frame.height * (frame.width * 4 + 1));
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4,
        o = y * (frame.width * 4 + 1) + 1 + x * 4;
      rows[o] = frame.bitmap[i + 2];
      rows[o + 1] = frame.bitmap[i + 1];
      rows[o + 2] = frame.bitmap[i];
      rows[o + 3] = frame.bitmap[i + 3];
    }
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
}
async function run() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const sessions = [],
    errors = [],
    actions = [];
  try {
    for (const axis of ["vertical", "horizontal"]) {
      const pixels = Buffer.alloc(160 * 160 * 4);
      let seed = 29;
      for (let i = 0; i < pixels.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels[i] = seed >>> 24;
        pixels[i + 1] = (seed >>> 16) & 255;
        pixels[i + 2] = (seed >>> 8) & 255;
        pixels[i + 3] = 255;
      }
      const image = (offset) => {
        const bytes = Buffer.alloc(100 * 100 * 4);
        for (let y = 0; y < 100; y++) {
          const start =
            ((y + (axis === "vertical" ? offset : 0)) * 160 +
              (axis === "horizontal" ? offset : 0)) *
            4;
          pixels.copy(bytes, y * 400, start, start + 400);
        }
        return { getSize: () => ({ width: 100, height: 100 }), toBitmap: () => bytes };
      };
      // Exercise the shipped worker entry, alongside source entry tests in Node.
      const session = new ScrollSession(
        image(0),
        path.resolve(__dirname, "../out/main/scroll-worker.js"),
      );
      sessions.push(session);
      let count = 0,
        auto = false,
        waitingFocus = false;
      let reviewBarrier, reviewReached;
      const state = () => ({
        mode: "scroll",
        count: session.images.length,
        height: 100,
        width: 100,
        monitor: "Synthetic",
        feedback: session.warning,
        automatic: auto,
        waitingFocus,
        steps: 0,
        ...session.state(),
      });
      const page = await browser.newPage({ viewport: { width: 410, height: 720 } });
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (message) => {
        if (message.type() === "error") console.log("fixture-console:", message.text());
      });
      await page.exposeFunction("invokeScroll", async (op, input) => {
        actions.push({ op, input });
        if (op === "state") return state();
        if (op === "review") {
          auto = false;
          session.stop();
          const result = await session.edit(input);
          const response = { ...state(), preview: png(result.result) };
          reviewReached?.();
          if (reviewBarrier) await reviewBarrier;
          return response;
        }
        if (op === "next") {
          await session.add(image(++count * 30), false, input);
          return state();
        }
        if (op === "targets")
          return [
            { token: "11111111-1111-4111-8111-111111111111", name: "Owned synthetic window" },
          ];
        if (op === "auto") {
          assert.equal(input.authorized, true);
          assert.equal(input.axis, axis);
          assert.equal(input.maxSteps, 3);
          auto = axis === "vertical";
          waitingFocus = axis === "horizontal";
          session.resume();
          return state();
        }
        if (op === "pause") {
          auto = false;
          waitingFocus = false;
          session.stop();
          return state();
        }
        if (op === "assist") {
          session.resume();
          return state();
        }
        if (op === "finish") {
          const result = await session.stitch();
          return { width: result.result.width, height: result.result.height };
        }
        throw new Error("Unknown test operation");
      });
      await page.addInitScript(() => {
        let onControl;
        window.scrollFixtureReviews = 0;
        const publish = async (op, input) => {
          const value = await window.invokeScroll(op, input);
          if (op === "review") window.scrollFixtureReviews++;
          if (value?.mode) onControl?.(value);
          return value;
        };
        window.ediSuite = { onRecovery() {} };
        window.edi = {
          controlState: () => publish("state"),
          onControl: (fn) => {
            onControl = fn;
          },
          onControlError() {},
          onRecordProgress() {},
          onStop() {},
          scrollReview: (input) => publish("review", input),
          scrollTargets: () => publish("targets"),
          scrollAuto: (input) => publish("auto", input),
          scrollPause: () => publish("pause"),
          scrollAssist: () => publish("assist"),
          nextSegment: (input) => publish("next", input),
          finish: () => publish("finish"),
          cancel: () => publish("pause"),
        };
      });
      await page.goto(`${server.resolvedUrls.local[0]}src/recording/control.html`);
      await page.locator("#scroll-axis").selectOption(axis);
      await page.locator("#crop-top").fill("2");
      await page.locator("#crop-bottom").fill("3");
      await page.locator("#crop-left").fill("4");
      await page.locator("#crop-right").fill("5");
      await page.locator("#scroll-configure").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#scroll-budget").textContent.includes("91 × 95") ||
          document.querySelector("#error").textContent,
      );
      assert.equal(await page.locator("#error").innerText(), "");
      await page.locator("#next").click();
      await page.waitForFunction(
        () => document.querySelector("#count").textContent === "2 trechos",
      );
      await page.locator("#scroll-preview").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-seams").textContent.includes("Emenda 1"),
      );
      assert.match(await page.locator("#scroll-seams").innerText(), /100% confiança/);
      await page.waitForFunction(
        () => document.querySelectorAll("#scroll-markers .scroll-marker").length === 1,
      );
      await page.waitForFunction(
        () =>
          document.querySelector("#scroll-image").complete &&
          document.querySelector("#scroll-image").naturalWidth > 0,
      );
      assert.equal(
        await page.locator("#scroll-image").evaluate((img) => img.naturalWidth),
        axis === "vertical" ? 91 : 121,
      );
      if (axis === "vertical") {
        const evidence = await require("./renderer-evidence.cjs")("scroll");
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(evidence, "settings.png") });
        await page.locator("#scroll-figure").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(evidence, "preview.png") });
      }
      await page.getByLabel("Corte da emenda 1").fill("20");
      await page.getByRole("button", { name: "Aplicar corte" }).click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-seams").textContent.includes("0% confiança"),
      );
      await page.locator("#scroll-undo").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-seams").textContent.includes("100% confiança"),
      );
      await page.getByRole("button", { name: "Remover trecho 2" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("#count").textContent === "1 trecho" ||
          document.querySelector("#error").textContent,
      );
      assert.equal(await page.locator("#error").innerText(), "");
      await page.locator("#scroll-undo").click();
      await page.waitForFunction(
        () => document.querySelector("#count").textContent === "2 trechos",
      );
      await page.locator("#scroll-targets").click();
      await page.locator("#scroll-target").selectOption("11111111-1111-4111-8111-111111111111");
      await page.locator("#scroll-limit").fill("3");
      await page.locator("#scroll-auto").click();
      await page.waitForFunction(
        (axis) =>
          document
            .querySelector("#scroll-progress")
            .textContent.includes(axis === "vertical" ? "Automático" : "Ative a janela"),
        axis,
      );
      assert.equal(await page.locator("#scroll-auto").isDisabled(), true);
      await page.locator("#scroll-pause").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-progress").textContent.includes("Pausado"),
      );
      assert.equal(session.images.length, 2);
      await page.locator("#scroll-assist").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-progress").textContent.includes("Assistido"),
      );
      await page.locator("#cancel").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-progress").textContent.includes("Pausado"),
      );
      assert.equal(session.images.length, 2);
      const completedReviews = await page.evaluate(() => window.scrollFixtureReviews);
      let releaseReview;
      reviewBarrier = new Promise((resolve) => {
        releaseReview = resolve;
      });
      const reached = new Promise((resolve) => {
        reviewReached = resolve;
      });
      await page.locator("#crop-top").fill("4");
      await page.locator("#scroll-configure").click();
      await reached;
      assert.equal(await page.locator("#scroll-preview").isDisabled(), true);
      await page.locator("#scroll-pause").click();
      await page.waitForFunction(() =>
        document.querySelector("#scroll-progress").textContent.includes("Pausado"),
      );
      releaseReview();
      reviewBarrier = null;
      reviewReached = null;
      await page.waitForFunction(
        (before) => window.scrollFixtureReviews > before,
        completedReviews,
      );
      assert.equal(await page.locator("#scroll-figure").isHidden(), true);
      assert.equal(session.images.length, 2);
      await page.locator("#finish").click();
      await page.close();
      session.dispose();
    }
    // Real main + real worker: interrupt before edit settles, not after its result.
    for (const operation of ["remove", "configure", "cut"]) {
      const page = await browser.newPage({ viewport: { width: 410, height: 720 } });
      page.setDefaultTimeout(15000);
      let reached,
        rejectWait,
        cancelBusy = false,
        cancelNext = false,
        publish = Promise.resolve();
      let finishDone;
      const finished = new Promise((resolve) => {
        finishDone = resolve;
      });
      const workerReached = new Promise((resolve, reject) => {
        reached = resolve;
        rejectWait = reject;
      });
      const h = scrollMain({
        preview: png,
        onControl: (name, value) => {
          if (name === "control-update")
            publish = publish.then(() =>
              page.evaluate((state) => window.emitMainState?.(state), value),
            );
        },
      });
      try {
        await h.api.next(false);
        await page.exposeFunction("invokeMain", async (op, input) => {
          if (op === "state") return h.api.control();
          if (op === "pause") {
            if (cancelNext) {
              cancelBusy = h.api.state().scroll.state().busy;
              assert.equal(cancelBusy, true);
            }
            h.api.pause();
            return h.api.control();
          }
          if (op === "review") {
            const pending = h.api.review(input);
            if (cancelNext) {
              await Promise.resolve();
              await Promise.resolve();
              if (!h.api.state().scroll.state().busy) rejectWait(Error("Worker was not pending"));
              else reached();
            }
            return pending;
          }
          if (op === "finish") {
            await h.api.finish();
            finishDone();
            return;
          }
          throw Error("Unknown fixture action");
        });
        await page.addInitScript(() => {
          window.ediSuite = { onRecovery() {} };
          window.edi = {
            controlState: () => window.invokeMain("state"),
            onControl: (fn) => {
              window.emitMainState = fn;
            },
            onControlError() {},
            onRecordProgress() {},
            onStop() {},
            scrollReview: (input) => window.invokeMain("review", input),
            scrollPause: () => window.invokeMain("pause"),
            cancel: () => window.invokeMain("pause"),
            finish: () => window.invokeMain("finish"),
          };
        });
        await page.goto(`${server.resolvedUrls.local[0]}src/recording/control.html`);
        await page.locator("#scroll-preview").click();
        await page.waitForFunction(() => !document.querySelector("#scroll-figure").hidden);
        cancelNext = true;
        if (operation === "configure") {
          await page.locator("#scroll-axis").selectOption("horizontal");
          await page.locator("#crop-top").fill("1");
          await page.locator("#scroll-configure").click();
        } else if (operation === "cut") {
          await page.getByLabel("Corte da emenda 1").fill("20");
          await page.getByRole("button", { name: "Aplicar corte" }).click();
        } else await page.getByRole("button", { name: "Remover trecho 2" }).click();
        await workerReached;
        await page.locator("#scroll-pause").click();
        await page.waitForFunction(
          () =>
            !document.querySelector("#scroll-preview").disabled &&
            !document.querySelector("#finish").disabled,
        );
        await publish;
        assert.equal(cancelBusy, true);
        assert.equal(h.api.control().count, 2);
        assert.equal(h.api.control().busy, false);
        assert.equal(h.api.control().paused, true);
        assert.equal(await page.locator("#count").innerText(), "2 trechos");
        assert.equal(await page.locator("#scroll-figure").isHidden(), true);
        cancelNext = false;
        await page.locator("#scroll-preview").click();
        await page.waitForFunction(() => !document.querySelector("#scroll-figure").hidden);
        await page.locator("#finish").click();
        await finished;
        assert.equal(h.saved.length, 1);
      } finally {
        h.api.cleanup();
        await publish;
        await page.close();
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(actions.filter((a) => a.op === "finish").length, 2);
    console.log(
      JSON.stringify({
        actualControllerBothAxes: true,
        pendingReviewCancel: true,
        actualMainMidWorkerCancel: ["remove", "configure", "cut"],
        seamMarkers: true,
        shippedWorker: true,
        cropFourEdges: true,
        preview: true,
        perSeamConfidence: true,
        cutRemoveUndo: true,
        explicitAuto: true,
        activationWaitAndCancel: true,
        pausePreserves: true,
        assistedFallback: true,
        viewport: "410x720",
      }),
    );
  } finally {
    for (const session of sessions) session.dispose();
    await browser.close();
    await server.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
