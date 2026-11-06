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
    await editor.mouse.move(grip.x + grip.width / 2, grip.y + 6);
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
    // 20 s minus the 5 s marked: 15 s, give or take a keyframe.
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
    assert.ok(Math.abs(length - 15) < 1.2, `cut length ${length}`);

    // Dividir e apagar: two cuts, the middle part deleted with Delete, the rest saved as one.
    const parted = join(dir, "aula-revisao (partes).mp4");
    await answerDialogs(application, [clip], parted);
    // The finished queue covers the list of stretches; a person hides it the same way.
    await editor.getByRole("button", { name: "Ocultar" }).click();
    await editor.getByRole("button", { name: "Apagar trecho 1" }).click();
    await editor.locator(".tool-grid").getByRole("button", { name: "Dividir" }).click();
    await seekTo(5);
    await editor.keyboard.press("s");
    await seekTo(12);
    await editor.keyboard.press("s");
    await seekTo(7);
    await editor.keyboard.press("Delete");
    await editor.getByText("apagada", { exact: true }).waitFor();
    await editor.screenshot({ path: join(results, "ediplayer-split.png") });
    await editor.getByRole("button", { name: "Salvar o vídeo sem as partes apagadas…" }).click();
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
    // 20 s minus the part from 5 to 12 s: 13 s, give or take a keyframe.
    const partedLength = Number(partedProbe.stdout.trim());
    assert.ok(Math.abs(partedLength - 13) < 1.2, `parts length ${partedLength}`);
    assert.equal(
      createHash("sha256")
        .update(await readFile(clip))
        .digest("hex"),
      before,
      "the source changed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
