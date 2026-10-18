import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { measureLoudness } from "../src/main/loudness.ts";
import type { Asset, Project } from "../src/shared/types.ts";
import { VOICE_CHAIN_VERSION } from "../src/shared/voiceChain.ts";

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.wav`,
  kind: "audio",
  duration: 60,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

/** A lesson with a treated voice and a music bed that steps aside while someone speaks. */
const lesson: Project = {
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    media("voz", {
      voicePreset: "teacher",
      treated: { path: "C:/tratada/voz.wav", preset: "teacher", version: VOICE_CHAIN_VERSION },
    }),
    media("musica"),
  ],
  tracks: [
    { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    {
      id: "m1",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
    },
  ],
  clips: [
    { id: "v", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 30, volume: 1 },
    { id: "m", assetId: "musica", trackId: "m1", start: 0, in: 0, duration: 30, volume: 0.35 },
  ],
};

const SUMMARY = `[Parsed_ebur128_0 @ 0] Summary:\n\n  Integrated loudness:\n    I:         -17.4 LUFS\n    Threshold: -27.6 LUFS\n\n  True peak:\n    Peak:       -2.1 dBFS\n`;

test("the check measures the mix the export makes: treated voice, music stepping aside", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-loudness-"));
  try {
    const read: string[] = [];
    let script = "";
    let scriptPath = "";
    let args: string[] = [];
    const value = await measureLoudness(JSON.parse(JSON.stringify(lesson)), [[1, 12]], {
      assertRead: async (path) => {
        read.push(path);
        return path;
      },
      writeFilterScript: async (text) => {
        script = text;
        scriptPath = join(dir, "filtro.txt");
        await writeFile(scriptPath, text);
        return scriptPath;
      },
      filterScriptOption: "-filter_complex_script",
      run: async (a, duration, onStderr) => {
        args = a;
        assert.equal(duration, 30);
        onStderr("frame=1\n");
        onStderr(SUMMARY);
      },
    });
    assert.deepEqual(value, { lufs: -17.4, peak: -2.1 });
    // The treated voice is what is heard, never the recorded file.
    assert.ok(read.includes("C:/tratada/voz.wav"));
    assert.ok(!read.includes("C:/aulas/voz.wav"));
    assert.ok(read.includes("C:/aulas/musica.wav"));
    // The music follows the speech given (from 1 s to 12 s), as in the export.
    assert.match(
      script,
      /volume='1-[\d.]+\*min\(1,clip\(\(t-0\.\d+\)\/[\d.]+,0,1\)\*clip\(\(12\.\d+-t\)/,
    );
    assert.match(script, /\[aout\]ebur128=peak=true:framelog=quiet\[measured\]$/);
    assert.deepEqual(args.slice(-5), ["-map", "[measured]", "-f", "null", "-"]);
    assert.ok(args.includes("-filter_complex_script"));
    // The filter script is removed afterwards.
    await assert.rejects(stat(scriptPath));
    // Without speech, the music steps aside where the export would without transcripts.
    let plain = "";
    await measureLoudness(lesson, undefined, {
      assertRead: async (path) => path,
      writeFilterScript: async (text) => {
        plain = text;
        const path = join(dir, "filtro2.txt");
        await writeFile(path, text);
        return path;
      },
      filterScriptOption: "-filter_complex_script",
      run: async (_a, _d, onStderr) => onStderr(SUMMARY),
    });
    assert.notEqual(plain, script);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a measurement that printed no summary is no measurement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-loudness-"));
  try {
    const value = await measureLoudness(lesson, undefined, {
      assertRead: async (path) => path,
      writeFilterScript: async (text) => {
        const path = join(dir, "filtro.txt");
        await writeFile(path, text);
        return path;
      },
      filterScriptOption: "-/filter_complex",
      run: async (_a, _d, onStderr) => onStderr("Error opening input"),
    });
    assert.equal(value, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
