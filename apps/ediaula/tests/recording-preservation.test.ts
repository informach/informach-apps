import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "@informach/edi-desktop/jobs";
import type { CaptureMonitor } from "../src/shared/recording.ts";

const root = await mkdtemp(join(tmpdir(), "ediaula-recording-preservation-"));
// The OS adapter supplies a synthetic screen and cursor helper. The recorder,
// FFmpeg processes, stop/pause coordination, MP4 files and FFprobe are real.
const spawnSource = `
import { spawn as nativeSpawn } from 'node:child_process';
export function spawn(bin, args, options) {
  if (bin === 'powershell.exe') return nativeSpawn(process.execPath,
    ['-e', "console.log('READY');setInterval(()=>{},1000)"], options);
  const input = args.findIndex(value => value.startsWith('ddagrab='));
  if (input >= 0) {
    args = args.map(value => value.startsWith('ddagrab=') ? (value.includes('output_idx=99') ? 'missing_edi_capture_source' : 'color=c=blue:s=640x480:r=30')
      : value === 'hwdownload,format=bgra' ? 'format=bgra' : value);
    args.splice(input - 3, 0, '-re');
  }
  return nativeSpawn(bin, args, options);
}`;
const spawnUrl = `data:text/javascript,${encodeURIComponent(spawnSource)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(root)}, getAppPath: () => ${JSON.stringify(root)} };`)}`,
        shortCircuit: true,
      };
    if (specifier === "node:child_process" && context.parentURL !== spawnUrl)
      return { url: spawnUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const recorder = await import("../src/main/recorder.ts");
const { FFMPEG, probe, run } = await import("../src/main/ffmpeg.ts");
hooks.deregister();
after(async () => {
  try {
    await recorder.cancel();
  } finally {
    await rm(root, { recursive: true });
  }
});

const monitor: CaptureMonitor = {
  index: 0,
  output: 0,
  x: 0,
  y: 0,
  width: 640,
  height: 480,
  primary: true,
  label: "Synthetic",
};

test("expiração interrompe captura nativa e preserva MP4 legível mesmo com pausa concorrente", async () => {
  let preservation: Promise<void> | undefined;
  const jobs = createDesktopJobs({
    assertAccess: () => {},
    onStopError: (error) => {
      throw error;
    },
  });
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  const job = jobs.begin({
    preserveForMs: 0,
    stop: () => {
      preservation = recorder.preserve();
      return preservation;
    },
  });
  jobs.setAccess(false);
  await Promise.all([preservation, recorder.pause()]);
  await assert.rejects(recorder.resume(), /preservada/);
  const saved = await recorder.stop();
  job.finish();
  assert.ok(saved.duration > 0);
  assert.equal((await probe(saved.screen)).hasVideo, true);
  const previous = await readFile(saved.screen);
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  const next = await recorder.stop();
  assert.notEqual(next.dir, saved.dir);
  assert.deepEqual(await readFile(saved.screen), previous);
  assert.equal((await probe(next.screen)).hasVideo, true);
});

test("limite de preservação encerra FFmpeg real e aguarda handles antes de remover staging", async () => {
  const path = join(root, "existing.mp4");
  await writeFile(path, "previous export");
  let licensed = true;
  let now = 0;
  const cancellation = new AbortController();
  const jobs = createDesktopJobs({
    assertAccess: () => {
      if (!licensed) throw new Error("restricted");
    },
    onStopError: (error) => {
      throw error;
    },
    monotonic: () => now,
    wallClock: () => now,
  });
  const job = jobs.begin({ stop: () => cancellation.abort() });
  try {
    await assert.rejects(
      withStagedFiles(
        [path],
        async (staged) => {
          const output = staged.get(path);
          assert.ok(output);
          await run(
            FFMPEG,
            [
              "-v",
              "error",
              "-re",
              "-f",
              "lavfi",
              "-i",
              "color=s=128x128:r=30",
              "-t",
              "3600",
              "-c:v",
              "libx264",
              "-y",
              output,
            ],
            {
              signal: cancellation.signal,
              duration: 3600,
              onProgress: () => {
                if (!licensed) return;
                licensed = false;
                jobs.setAccess(false);
                now += JOB_PRESERVATION_MS;
                jobs.checkDeadlines();
              },
            },
          );
        },
        () => job.check(),
      ),
      /aborted/,
    );
    assert.equal(await readFile(path, "utf8"), "previous export");
  } finally {
    job.finish();
  }
});

test("erro nativo antes do primeiro quadro rejeita início sem rejeição background tardia", async () => {
  await recorder.prepare({ monitor: 0, fps: 30 }, [{ ...monitor, output: 99 }]);
  try {
    await assert.rejects(recorder.start(), /filter|Invalid|Error/i);
  } finally {
    await recorder.cancel();
  }
  assert.equal(recorder.isRecording(), false);
});
