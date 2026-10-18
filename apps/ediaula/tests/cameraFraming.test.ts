import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMERA_FRAMINGS,
  cameraFraming,
  frameCamera,
  framingOf,
  screenBesideCamera,
} from "../src/shared/cameraFraming.ts";
import { clipLayout } from "../src/shared/compose.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const frame = { width: 1920, height: 1080 };
const camera = { width: 1280, height: 720 };
const near = (a: number, b: number, what: string): void =>
  assert.ok(Math.abs(a - b) < 1.5, `${what}: ${a} ≠ ${b}`);

test("o círculo no canto é um quadrado de 28% da altura, dentro da margem", () => {
  const t = cameraFraming("circle", camera, frame, { x: 0.5, y: 0.5, scale: 1, opacity: 1 });
  const box = clipLayout({ transform: t }, camera, frame).visible;
  assert.equal(t.mask, "circle");
  near(box.w, 0.28 * 1080, "largura");
  near(box.h, box.w, "altura");
  near(frame.width - (box.x + box.w), 54, "margem direita");
  near(frame.height - (box.y + box.h), 54, "margem de baixo");
});

test("o arredondado no canto mantém a proporção da câmera e a borda pedida", () => {
  const t = cameraFraming("rounded", camera, frame, {
    x: 0.5,
    y: 0.5,
    scale: 1,
    opacity: 0.9,
    border: "#C8F031",
    mask: "circle",
  });
  const box = clipLayout({ transform: t }, camera, frame).visible;
  assert.equal(t.mask, "rounded");
  assert.equal(t.border, "#C8F031");
  assert.equal(t.opacity, 0.9);
  near(box.w, 0.3 * 1920, "largura");
  near(box.w / box.h, 16 / 9, "proporção");
  near(frame.height - (box.y + box.h), 54, "margem de baixo");
});

test("lado a lado: a câmera preenche a metade direita e a tela cabe inteira na esquerda", () => {
  const t = cameraFraming("side", camera, frame);
  const cam = clipLayout({ transform: t }, camera, frame).visible;
  near(cam.x, 960, "início da câmera");
  near(cam.w, 960, "largura da câmera");
  near(cam.h, 1080, "altura da câmera");
  assert.equal(t.mask, undefined);
  const s = screenBesideCamera(frame, frame);
  const screen = clipLayout({ transform: s }, frame, frame).visible;
  near(screen.x, 0, "início da tela");
  near(screen.w, 960, "largura da tela");
  near(screen.y + screen.h / 2, 540, "centro da tela");
});

test("tela cheia cobre o quadro inteiro, cortando o que sobra de uma câmera 4:3", () => {
  const t = cameraFraming("full", { width: 640, height: 480 }, frame);
  const box = clipLayout({ transform: t }, { width: 640, height: 480 }, frame).visible;
  near(box.x, 0, "x");
  near(box.y, 0, "y");
  near(box.w, 1920, "largura");
  near(box.h, 1080, "altura");
});

test("no formato vertical, lado a lado vira a câmera embaixo e a tela em cima", () => {
  const tall = { width: 1080, height: 1920 };
  const box = clipLayout({ transform: cameraFraming("side", camera, tall) }, camera, tall).visible;
  near(box.y, 960, "início da câmera");
  near(box.w, 1080, "largura");
  near(box.h, 960, "altura");
});

test("cada enquadramento se reconhece, e um ajuste à mão não é nenhum", () => {
  for (const f of CAMERA_FRAMINGS)
    assert.equal(framingOf(cameraFraming(f, camera, frame), camera, frame), f);
  const moved = { ...cameraFraming("circle", camera, frame), x: 0.2 };
  assert.equal(framingOf(moved, camera, frame), null);
  assert.equal(framingOf(undefined, camera, frame), null);
});

test("frameCamera enquadra todos os trechos da câmera e leva a tela do mesmo take", () => {
  const asset = (id: string, role: "screen" | "camera", take: string): Asset => ({
    id,
    name: id,
    path: `${id}.mp4`,
    kind: "video",
    duration: 60,
    width: role === "camera" ? 1280 : 1920,
    height: role === "camera" ? 720 : 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
    recording: { id: take, role },
  });
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("tela", "screen", "a"),
      asset("cam", "camera", "a"),
      asset("outra", "screen", "b"),
    ],
    tracks: [],
    clips: [
      { id: "c1", assetId: "cam", trackId: "t", start: 0, in: 0, duration: 10, volume: 0 },
      { id: "c2", assetId: "cam", trackId: "t", start: 12, in: 12, duration: 10, volume: 0 },
      { id: "s1", assetId: "tela", trackId: "m", start: 0, in: 0, duration: 22, volume: 1 },
      { id: "o1", assetId: "outra", trackId: "m", start: 30, in: 0, duration: 5, volume: 1 },
    ],
  };
  const side = frameCamera(project, "cam", "side");
  const byId = (p: Project, id: string) => p.clips.find((c) => c.id === id);
  for (const id of ["c1", "c2"])
    assert.equal(framingOf(byId(side, id)?.transform, project.assets[1], project.settings), "side");
  assert.deepEqual(byId(side, "s1")?.transform, screenBesideCamera(project.assets[0], frame));
  assert.equal(byId(side, "o1")?.transform, undefined);

  const circle = frameCamera(side, "cam", "circle", "#C8F031");
  assert.equal(byId(circle, "c1")?.transform?.border, "#C8F031");
  assert.equal(framingOf(byId(circle, "c2")?.transform, project.assets[1], frame), "circle");
  // The screen goes back to filling the frame.
  assert.equal(byId(circle, "s1")?.transform, undefined);
});
