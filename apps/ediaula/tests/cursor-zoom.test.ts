import assert from "node:assert/strict";
import { test } from "node:test";
import { type CursorFx, DEFAULT_CURSOR_FX, fxAt } from "../src/shared/cursor.ts";
import { cursorSizeAtZoom, ZOOM_FULL, zoomCursorRanges } from "../src/shared/cursorZoom.ts";
import type { Project } from "../src/shared/types.ts";
import { layerViewAt } from "../src/shared/zoomLayer.ts";

// A recording on the lower track from 0 to 10 s (source = timeline), a zoom layer above it from
// 2 to 6 s at 1.6x with 0.6 s in and out.
const project = {
  settings: { width: 1920, height: 1080, fps: 30 },
  tracks: [
    { id: "zoom", name: "Zoom", kind: "video" },
    { id: "tela", name: "Tela", kind: "video" },
  ],
  clips: [
    {
      id: "z1",
      assetId: "",
      trackId: "zoom",
      start: 2,
      duration: 4,
      in: 0,
      zoomLayer: { scale: ZOOM_FULL, x: 0.5, y: 0.5, easeIn: 0.6, easeOut: 0.6 },
    },
    { id: "c1", assetId: "rec", trackId: "tela", start: 0, duration: 10, in: 0 },
  ],
} as unknown as Project;
const asset = { id: "rec", zooms: undefined };
const fx: CursorFx = { ...DEFAULT_CURSOR_FX, size: 2.2 };

test("o cursor tem o tamanho da gravação sem zoom e o pedido com o zoom aberto", () => {
  assert.equal(cursorSizeAtZoom(2.2, 1.6, 1), 2.2);
  assert.equal(cursorSizeAtZoom(2.2, 1.6, ZOOM_FULL), 1.6);
  assert.equal(cursorSizeAtZoom(2.2, 1.6, 2.5), 1.6);
});

test("os trechos seguem o zoom: tamanho pedido dentro, o da gravação fora, sem salto na tela", () => {
  const ranges = zoomCursorRanges(project, asset, fx, 1.6);
  const size = (t: number): number => fxAt({ ...fx, ranges }, t).size;
  assert.equal(size(1), 2.2);
  assert.equal(size(4), 1.6);
  assert.equal(size(8), 2.2);
  // Abrindo e fechando o zoom, o tamanho na tela (tamanho x zoom) muda aos poucos, quadro a quadro.
  const layer = project.clips[0];
  let antes = 2.2;
  for (let t = 1.5; t < 6.5; t += 1 / 30) {
    const k = t >= 2 && t < 6 ? layerViewAt(layer, t).scale : 1;
    const naTela = size(t) * k;
    assert.ok(
      Math.abs(naTela - antes) < 0.16,
      `salto de ${antes} para ${naTela} em ${t.toFixed(2)} s`,
    );
    antes = naTela;
  }
});

test("rodar de novo troca os trechos do zoom e mantém os outros", () => {
  const outro = { id: "cr1", start: 0, end: 1, fx: { halo: true } };
  const primeira = zoomCursorRanges(project, asset, { ...fx, ranges: [outro] }, 1.6);
  const segunda = zoomCursorRanges(project, asset, { ...fx, ranges: primeira }, 1.6);
  assert.deepEqual(segunda, primeira);
  assert.deepEqual(zoomCursorRanges(project, asset, { ...fx, ranges: primeira }, undefined), [
    outro,
  ]);
});
