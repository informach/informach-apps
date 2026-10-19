import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { applyMotionCommands, emptyMotion } from "@informach/edi-motion";
import { chromium } from "playwright";

test("public ESM runtime validates identity, resets channels and stops scheduling when inactive", {
  timeout: 60_000,
}, async () => {
  const code = await readFile(resolve("out/renderer/edi-player.mjs"), "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported test browser");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(0);
    await page.setContent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g data-edi-object="node-a"><rect width="10" height="10"/></g></svg>',
    );
    const motion = applyMotionCommands(emptyMotion(), new Set(["node-a"]), [
      {
        type: "create-animation",
        animation: { id: "animation-a", name: "A", fps: 30, frames: 30, mode: "once", tracks: [] },
      },
      {
        type: "set-key",
        animationId: "animation-a",
        targetId: "node-a",
        property: "x",
        frame: 0,
        value: 10,
      },
      {
        type: "set-key",
        animationId: "animation-a",
        targetId: "node-a",
        property: "x",
        frame: 30,
        value: 90,
      },
      {
        type: "create-animation",
        animation: { id: "animation-b", name: "B", fps: 24, frames: 48, mode: "loop", tracks: [] },
      },
    ]);
    const data = {
      version: 1,
      motion,
      objects: [
        { id: "node-a", transform: { x: 5, y: 0, rotation: 0, sx: 0.001, sy: 1, opacity: 100 } },
      ],
    };
    const initial = await page.evaluate(
      async ({ moduleUrl, data }) => {
        const { createSvgPlayer } = await import(moduleUrl);
        const svg = document.querySelector("svg");
        if (!svg) throw new Error("Missing SVG");
        const player = createSvgPlayer(svg, data, { autoplay: false, pauseOffscreen: false });
        window.ediSVGPlayer = player;
        player.seek(0.5);
        const pose = svg.querySelector("g")?.getAttribute("transform");
        let rejected = false;
        try {
          player.seek(Infinity);
        } catch {
          rejected = true;
        }
        if (!rejected || player.time !== 0.5) throw new Error("Invalid seek corrupted player time");
        player.setAnimation("animation-b");
        const reset = svg.querySelector("g")?.getAttribute("transform");
        player.setAnimation("animation-a");
        player.play();
        return { pose, reset };
      },
      { moduleUrl, data },
    );
    assert.match(initial.pose ?? "", /^translate\(50 0\)/);
    assert.match(initial.reset ?? "", /^translate\(5 0\)/);
    await page.clock.runFor(2000);
    assert.deepEqual(
      await page.evaluate(() => ({
        time: window.ediSVGPlayer?.time,
        playing: window.ediSVGPlayer?.playing,
      })),
      { time: 1, playing: false },
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.ediSVGPlayer?.play());
    await page.clock.runFor(2000);
    assert.equal(await page.evaluate(() => window.ediSVGPlayer?.time), 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.runFor(500);
    const beforePause = await page.evaluate(() => {
      window.ediSVGPlayer?.pause();
      return window.ediSVGPlayer?.time;
    });
    await page.clock.runFor(2000);
    assert.equal(await page.evaluate(() => window.ediSVGPlayer?.time), beforePause);
    const destroyed = await page.evaluate(() => {
      const player = window.ediSVGPlayer;
      if (!player) throw new Error("Missing player");
      player.destroy();
      player.destroy();
      try {
        player.seek(0);
        return false;
      } catch {
        return !player.playing;
      }
    });
    assert.equal(destroyed, true);
    const invalid = await page.evaluate(
      async ({ moduleUrl, data }) => {
        const { createSvgPlayer } = await import(moduleUrl);
        const svg = document.querySelector("svg");
        if (!svg) throw new Error("Missing SVG");
        try {
          createSvgPlayer(svg, { ...data, objects: [] });
          return false;
        } catch {
          return true;
        }
      },
      { moduleUrl, data },
    );
    assert.equal(invalid, true);
  } finally {
    await browser.close();
  }
});
