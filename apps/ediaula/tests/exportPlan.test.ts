import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

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
  assert.deepEqual(plan.inputArgs.slice(tela - 5, tela + 1), [
    "-ss",
    "10",
    "-t",
    "20",
    "-i",
    "C:/m/tela.mp4",
  ]);
  assert.ok(tela < plan.inputArgs.indexOf("C:/m/logo.png"), "lower layer is read first");
  assert.ok(plan.inputArgs.includes("-loop"), "images loop");
  // V1 (index 0) is overlaid before V2 (index 1).
  assert.ok(plan.filter.indexOf("[base][v0]overlay") < plan.filter.indexOf("[o0][v1]overlay"));
});

test("audio is delayed to its timeline position, scaled and mixed", () => {
  const plan = buildExportPlan(project(), spec);
  assert.match(plan.filter, /volume=0\.3,adelay=0:all=1/);
  assert.match(plan.filter, /amix=inputs=2:normalize=0/);
  assert.match(plan.filter, /loudnorm=I=-14/);
});

test("hidden tracks drop video but keep audio; muted tracks drop audio", () => {
  const p = project();
  p.tracks[1].hidden = true;
  p.tracks[2].muted = true;
  const plan = buildExportPlan(p, spec);
  assert.doesNotMatch(plan.filter, /\[0:v\]/);
  assert.match(plan.filter, /\[0:a\]/);
  assert.doesNotMatch(plan.filter, /amix/);
});

test("silent projects get a null audio source and x264 when no GPU", () => {
  const p = project();
  p.clips = [p.clips[1]];
  const plan = buildExportPlan(p, { ...spec, encoder: "x264" });
  assert.match(plan.filter, /anullsrc/);
  assert.ok(plan.outputArgs.includes("libx264"));
});
