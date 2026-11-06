import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";

const run = promisify(execFile);
const require = createRequire(resolve("apps/ediplayer/package.json"));

/** FFmpeg for the fixture: the suite bundle when prepared, else the development binary. */
function ffmpegPath(root: string): string {
  const bundled = join(root, ".cache", "edi-native-media", "windows-x64", "bin", "ffmpeg.exe");
  try {
    require.resolve(bundled);
    return bundled;
  } catch {
    const binary: unknown = require("ffmpeg-static");
    if (typeof binary !== "string") throw new Error("ffmpeg-static unavailable");
    return binary;
  }
}

function ffprobePath(root: string): string {
  const bundled = join(root, ".cache", "edi-native-media", "windows-x64", "bin", "ffprobe.exe");
  if (ffmpegPath(root).startsWith(join(root, ".cache"))) return bundled;
  const binary: unknown = require("@derhuerst/ffprobe-static");
  const file = binary && typeof binary === "object" ? Reflect.get(binary, "path") : binary;
  if (typeof file !== "string") throw new Error("ffprobe-static unavailable");
  return file;
}

/** Replaces the main process's file dialogs: the journey answers them instead of a person. */
async function answerDialogs(application: ElectronApplication, open: string[], save: string) {
  await application.evaluate(
    ({ dialog }, answers) => {
      Reflect.set(dialog, "showOpenDialog", async () => ({
        canceled: false,
        filePaths: answers.open,
      }));
      Reflect.set(dialog, "showSaveDialog", async () => ({
        canceled: false,
        filePath: answers.save,
      }));
    },
    { open, save },
  );
}

/**
 * Opens a real clip, plays it, marks a stretch in the edit mode and saves it without
 * re-encoding: the output exists with the expected length and the source is byte for byte the
 * same. Screens are captured for review against the design canvas.
 */
export async function verifyPlayerNativeJourney(
  editor: Page,
  application: ElectronApplication,
  root: string,
  results: string,
): Promise<void> {
  editor.setDefaultTimeout(20000);
  const dir = await mkdtemp(join(tmpdir(), "ediplayer-journey-"));
  try {
    const clip = join(dir, "aula-revisao.mp4");
    await run(ffmpegPath(root), [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30:duration=20",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000:duration=20",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      clip,
    ]);
    const before = createHash("sha256")
      .update(await readFile(clip))
      .digest("hex");
    const output = join(dir, "aula-revisao (editado).mp4");
    await answerDialogs(application, [clip], output);

    await editor.getByRole("button", { name: /Abrir arquivo/ }).click();
    await editor.waitForFunction(() => {
      const v = document.querySelector(".stage video");
      return v instanceof HTMLVideoElement && v.readyState >= 2 && v.currentTime > 0.3;
    });
    await editor.screenshot({ path: join(results, "ediplayer-player.png") });
    const seekTo = (t: number) =>
      editor.evaluate((at) => {
        const v = document.querySelector(".stage video");
        if (!(v instanceof HTMLVideoElement)) throw new Error("Missing video");
        v.pause();
        v.currentTime = at;
        return new Promise<void>((done) =>
          v.addEventListener("seeked", () => done(), { once: true }),
        );
      }, t);
    const position = () =>
      editor.evaluate(() => {
        const v = document.querySelector(".stage video");
        return v instanceof HTMLVideoElement ? { at: v.currentTime, paused: v.paused } : null;
      });

    // Entering edit mode keeps the same video where it was (it must not reload from 0).
    await seekTo(6);
    await editor.keyboard.press("e");
    await editor.locator(".ruler").waitFor();
    const kept = await position();
    assert.ok(
      kept && Math.abs(kept.at - 6) < 0.2 && kept.paused,
      `edit mode moved the video: ${JSON.stringify(kept)}`,
    );
    await seekTo(3);
    await editor.keyboard.press("i");
    await seekTo(8);
    await editor.keyboard.press("o");
    await editor.getByText("Trechos marcados").waitFor();
    await editor.locator(".mark-row.sel").waitFor();
    await editor.waitForFunction(
      () => document.querySelectorAll(".strip .tile[style*='url']").length > 0,
    );
    // Dragging the needle's head moves through the video and keeps the selected stretch.
    const grip = await editor.locator(".playhead-grip").boundingBox();
    const ruler = await editor.locator(".ruler").boundingBox();
    assert.ok(grip && ruler, "the needle has no head");
    // hover waits for the head to be still and to be what the pointer would hit.
    await editor.locator(".playhead-grip").hover({ position: { x: grip.width / 2, y: 6 } });
    await editor.mouse.down();
    await editor.mouse.move(ruler.x + ruler.width * 0.5, grip.y + 6, { steps: 8 });
    await editor.mouse.move(ruler.x + ruler.width * 0.8, grip.y + 6, { steps: 8 });
    await editor.mouse.up();
    const scrubbed = await position();
    assert.ok(
      scrubbed && Math.abs(scrubbed.at - 16) < 0.6,
      `head drag: ${JSON.stringify(scrubbed)}`,
    );
    await editor.locator(".mark-row.sel").waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-edit.png") });

    await editor.keyboard.press("Control+s");
    await editor.getByRole("dialog", { name: "Salvar resultado" }).waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-save.png") });
    await editor.getByRole("button", { name: "Salvar…" }).click();
    await editor.getByText("Pronto").waitFor({ timeout: 60000 });
    await editor.screenshot({ path: join(results, "ediplayer-queue.png") });

    const made = await stat(output);
    assert.ok(made.size > 10_000, "the cut was not written");
    const after = createHash("sha256")
      .update(await readFile(clip))
      .digest("hex");
    assert.equal(after, before, "the source changed");
    // 20 s minus the 5 s marked: exactly 15 s.
    const probe = await run(ffprobePath(root), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      output,
    ]);
    const length = Number(probe.stdout.trim());
    assert.ok(Math.abs(length - 15) < 0.15, `cut length ${length}`);

    // Dividir e apagar: two cuts, the middle part deleted with Delete, the rest saved as one.
    const parted = join(dir, "aula-revisao (partes).mp4");
    await answerDialogs(application, [clip], parted);
    // The finished queue covers the list of stretches; a person hides it the same way.
    await editor.getByRole("button", { name: "Ocultar" }).click();
    await editor.getByRole("button", { name: "Apagar trecho 1" }).click();
    // S right after a click on the ruler, while playing, cuts where the click put the video
    // (the stored time lags behind), and the ruler is not ringed as if all were selected.
    const strip0 = await editor.locator(".strip").boundingBox();
    assert.ok(strip0, "the ruler has no frames");
    await editor.keyboard.press(" ");
    await editor.mouse.click(strip0.x + strip0.width * 0.85, strip0.y + strip0.height / 2);
    await editor.keyboard.press("s");
    const cut = await editor.evaluate(() => {
      const line = document.querySelector(".ruler .cut-handle");
      const ruler = document.querySelector(".ruler");
      return {
        at: line instanceof HTMLElement ? Number.parseFloat(line.style.left) : -1,
        ring: ruler ? getComputedStyle(ruler).outlineStyle : "",
      };
    });
    assert.ok(Math.abs(cut.at - 85) < 3, `S cut at ${cut.at}% instead of 85%`);
    assert.equal(cut.ring, "none", "the ruler is ringed after S");
    await editor.keyboard.press("Control+z");
    await editor.keyboard.press(" ");
    await seekTo(5);
    await editor.keyboard.press("s");
    await seekTo(12);
    await editor.keyboard.press("s");
    // A click on the middle part selects it in any tool, and Delete deletes it.
    await editor.locator(".tool-grid").getByRole("button", { name: "Aparar e cortar" }).click();
    const strip = await editor.locator(".strip").boundingBox();
    assert.ok(strip, "the ruler has no frames");
    await editor.mouse.click(strip.x + strip.width * 0.4, strip.y + strip.height / 2);
    await editor.locator(".part-sel").waitFor();
    await editor.keyboard.press("Delete");
    await editor.locator(".result .big").getByText("00:13").waitFor();
    await editor.locator(".tool-grid").getByRole("button", { name: "Dividir" }).click();
    await editor.getByText("apagado", { exact: true }).waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-split.png") });
    await editor.keyboard.press("Control+s");
    await editor.getByRole("dialog", { name: "Salvar resultado" }).waitFor();
    await editor.getByRole("button", { name: "Salvar…" }).click();
    // The finished file appears only when the job publishes it.
    for (let waited = 0; ; waited += 250) {
      if (
        await stat(parted).then(
          () => true,
          () => false,
        )
      )
        break;
      if (waited > 60000) throw new Error("the parts were not saved");
      await new Promise((done) => setTimeout(done, 250));
    }
    await editor.getByText("Fila · concluída").waitFor({ timeout: 60000 });
    const partedProbe = await run(ffprobePath(root), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      parted,
    ]);
    // 20 s minus the part from 5 to 12 s: exactly 13 s (the cut is exact by default).
    const partedLength = Number(partedProbe.stdout.trim());
    assert.ok(Math.abs(partedLength - 13) < 0.15, `parts length ${partedLength}`);
    assert.equal(
      createHash("sha256")
        .update(await readFile(clip))
        .digest("hex"),
      before,
      "the source changed",
    );

    // The simple way, from the player: needle somewhere, S divides there (opening the edit
    // mode), a click picks the clip, Delete deletes it.
    await editor.getByRole("button", { name: "Sair da edição" }).click();
    await editor.locator(".ruler").waitFor({ state: "detached" });
    await seekTo(15);
    await editor.keyboard.press("s");
    await editor.locator(".ruler").waitFor();
    const lines = await editor.evaluate(() =>
      [...document.querySelectorAll(".ruler .cut-handle")].map((l) =>
        l instanceof HTMLElement ? Number.parseFloat(l.style.left) : -1,
      ),
    );
    assert.ok(
      lines.some((l) => Math.abs(l - 75) < 2),
      `S from the player did not cut at the needle: ${lines}`,
    );
    const strip1 = await editor.locator(".strip").boundingBox();
    assert.ok(strip1, "the ruler has no frames");
    await editor.mouse.click(strip1.x + strip1.width * 0.9, strip1.y + strip1.height / 2);
    await editor.locator(".part-flag").getByText("Del apaga").waitFor();
    await editor.keyboard.press("Delete");
    await editor.locator(".part-flag").getByText("Apagado · Ctrl+Z volta").waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-simple-split.png") });
    // Zoom and handles: 8× makes the ruler eight panels wide with the cut in view; dragging the
    // cut's knob moves the cut by the dragged time, and the deleted part follows it.
    // The buttons zoom around the needle: put it by the cut first.
    await seekTo(15.4);
    for (let i = 0; i < 3; i++)
      await editor.getByRole("button", { name: "Aproximar a régua" }).click();
    const widths = await editor.evaluate(() => {
      const view = document.querySelector(".ruler-scroll");
      const ruler = document.querySelector(".ruler");
      return { view: view?.clientWidth ?? 0, ruler: ruler?.getBoundingClientRect().width ?? 0 };
    });
    assert.ok(
      Math.abs(widths.ruler / widths.view - 8) < 0.2,
      `zoom 8× gave a ruler ${widths.ruler}px in ${widths.view}px`,
    );
    const knob = editor.locator(".cut-handle.start .cut-knob");
    const knobBox = await knob.boundingBox();
    const viewBox = await editor.locator(".ruler-scroll").boundingBox();
    assert.ok(knobBox && viewBox, "the cut has no handle");
    assert.ok(
      knobBox.x > viewBox.x && knobBox.x < viewBox.x + viewBox.width,
      "the zoomed ruler does not show the cut",
    );
    const dx = -60;
    await knob.hover();
    await editor.mouse.down();
    await editor.mouse.move(knobBox.x + knobBox.width / 2 + dx / 2, knobBox.y + 4, { steps: 4 });
    await editor.mouse.move(knobBox.x + knobBox.width / 2 + dx, knobBox.y + 4, { steps: 4 });
    await editor.mouse.up();
    const expected = 15 + (dx / widths.ruler) * 20;
    const moved = await editor.evaluate(() => {
      const left = (selector: string) =>
        [...document.querySelectorAll(selector)].map((e) =>
          e instanceof HTMLElement ? Number.parseFloat(e.style.left) : -1,
        );
      return { cuts: left(".ruler .cut-handle"), zones: left(".ruler .cut-zone") };
    });
    const cutAt = ((moved.cuts.at(-1) ?? 0) / 100) * 20;
    assert.ok(Math.abs(cutAt - expected) < 0.05, `cut moved to ${cutAt}, expected ${expected}`);
    assert.ok(
      moved.zones.some((z) => Math.abs((z / 100) * 20 - cutAt) < 0.01),
      `the deleted part did not follow the cut: ${moved.zones}`,
    );
    await editor.locator(".part-flag").getByText("Apagado · Ctrl+Z volta").waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-zoom-handles.png") });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
