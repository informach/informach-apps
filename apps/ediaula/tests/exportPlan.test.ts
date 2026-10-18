import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExportPlan, exportVideoArgs, proxyVideoArgs } from "../src/shared/exportPlan.ts";
import { exportSpecSchema } from "../src/shared/project-schema.ts";
import { ENCODERS, type Project } from "../src/shared/types.ts";

const project = (): Project => ({
  version: 1,
  id: "p",
  name: "Teste",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "v",
      name: "tela",
      path: "C:/m/tela.mp4",
      kind: "video",
      duration: 60,
      width: 3840,
      height: 2160,
      fps: 30,
      hasVideo: true,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
    {
      id: "i",
      name: "logo",
      path: "C:/m/logo.png",
      kind: "image",
      duration: 0,
      width: 500,
      height: 500,
      fps: 0,
      hasVideo: true,
      hasAudio: false,
      size: 1,
      proxyStatus: "none",
    },
    {
      id: "m",
      name: "musica",
      path: "C:/m/musica.mp3",
      kind: "audio",
      duration: 120,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
  ],
  tracks: [
    { id: "v2", kind: "video", name: "Sobreposição", muted: false, hidden: false, locked: false },
    { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "a1", kind: "audio", name: "Música", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "c1", assetId: "v", trackId: "v1", start: 0, in: 10, duration: 20, volume: 1 },
    { id: "c2", assetId: "i", trackId: "v2", start: 5, in: 0, duration: 5, volume: 1 },
    { id: "c3", assetId: "m", trackId: "a1", start: 0, in: 0, duration: 25, volume: 0.3 },
  ],
});

const spec = {
  outPath: "C:/out/aula.mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: 8000,
  normalizeLoudness: true,
  encoder: "nvenc" as const,
};

test("inputs are trimmed at the source and ordered bottom layer first", () => {
  const plan = buildExportPlan(project(), spec);
  assert.equal(plan.duration, 25);
  const tela = plan.inputArgs.indexOf("C:/m/tela.mp4");
  const read = plan.inputArgs.slice(tela - 5, tela + 1);
  assert.deepEqual([read[0], read[2], read[4]], ["-ss", "-t", "-i"]);
  // From a source frame before the in-point (10 s) to the end of its 20 s.
  const seek = Number(read[1]);
  assert.ok(seek < 10 && seek > 10 - 1 / 30 - 0.01, `seek ${read[1]}`);
  assert.ok(Math.abs(seek + Number(read[3]) - 30) < 0.01, `length ${read[3]}`);
  assert.ok(tela < plan.inputArgs.indexOf("C:/m/logo.png"), "lower layer is read first");
  assert.match(plan.filter, /loop=loop=-1:size=1/, "a still is decoded once and repeated");
  // V1 (index 0) is overlaid before V2 (index 1).
  assert.ok(plan.filter.indexOf("[base][v0]overlay") < plan.filter.indexOf("[o0][v1]overlay"));
});

/** Index of the `-i` input that reads `path` (the first one, or the `nth`). */
const inputOf = (args: string[], path: string, nth = 0): number => {
  let index = -1;
  let seen = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "-i") continue;
    index++;
    if (args[i + 1] === path && seen++ === nth) return index;
  }
  return -1;
};

test("audio is placed at its timeline position, scaled and mixed", () => {
  const plan = buildExportPlan(project(), spec);
  const music = inputOf(plan.inputArgs, "C:/m/musica.mp3");
  assert.match(
    plan.filter,
    new RegExp(
      `\\[ai${music}\\]atrim=start=0:end=25,asetpts=PTS-STARTPTS,volume=0\\.3,apad=whole_len=1200000`,
    ),
  );
  assert.match(plan.filter, /amix=inputs=2:normalize=0/);
  assert.match(plan.filter, /loudnorm=I=-14/);
});

test("hidden tracks drop video but keep audio; muted tracks drop audio", () => {
  const p = project();
  p.tracks[1].hidden = true;
  p.tracks[2].muted = true;
  const plan = buildExportPlan(p, spec);
  const tela = inputOf(plan.inputArgs, "C:/m/tela.mp4");
  assert.equal(inputOf(plan.inputArgs, "C:/m/tela.mp4", 1), -1, "read once, for its sound");
  assert.doesNotMatch(plan.filter, new RegExp(`\\[${tela}:v\\]`));
  assert.match(plan.filter, new RegExp(`\\[${tela}:a\\]`));
  assert.doesNotMatch(plan.filter, /amix/);
});

test("silent projects get a null audio source and x264 when no GPU", () => {
  const p = project();
  p.clips = [p.clips[1]];
  const plan = buildExportPlan(p, { ...spec, encoder: "x264" });
  assert.match(plan.filter, /anullsrc/);
  assert.ok(plan.outputArgs.includes("libx264"));
});

test("AMD and Media Foundation export at the same bitrate and peak as NVENC and x264", () => {
  const codecs = { nvenc: "h264_nvenc", amf: "h264_amf", mf: "h264_mf", x264: "libx264" };
  for (const encoder of ENCODERS) {
    const plan = buildExportPlan(project(), { ...spec, encoder });
    const args = plan.outputArgs;
    const value = (name: string) => args[args.indexOf(name) + 1];
    assert.equal(value("-c:v"), codecs[encoder]);
    assert.equal(value("-b:v"), "8000k");
    assert.equal(value("-maxrate"), "12000k");
    assert.equal(value("-pix_fmt"), encoder === "mf" ? "nv12" : "yuv420p");
    assert.ok(exportSpecSchema.safeParse({ ...spec, encoder }).success);
  }
  // Media Foundation takes High as a number, only on hardware.
  const mf = exportVideoArgs("mf", 8000);
  assert.equal(mf[mf.indexOf("-profile:v") + 1], "100");
  assert.equal(mf[mf.indexOf("-hw_encoding") + 1], "1");
  const amf = exportVideoArgs("amf", 8000);
  assert.equal(amf[amf.indexOf("-profile:v") + 1], "high");
  assert.equal(exportSpecSchema.safeParse({ ...spec, encoder: "qsv" }).success, false);
});

test("proxies use each encoder with a short GOP", () => {
  for (const encoder of ENCODERS) {
    const args = proxyVideoArgs(encoder);
    assert.equal(args[args.indexOf("-g") + 1], "15");
  }
  assert.ok(proxyVideoArgs("mf").includes("-hw_encoding"));
});
