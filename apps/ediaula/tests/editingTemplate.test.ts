import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEditingTemplate } from "../src/shared/editingTemplate.ts";
import type { Project } from "../src/shared/types.ts";

const project: Project = {
  version: 1,
  id: "private-project-id",
  name: "Aula | 01",
  course: "Farol",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  tracks: [
    {
      id: "private-track-id",
      kind: "video",
      name: "Balões",
      muted: false,
      hidden: false,
      locked: false,
    },
  ],
  assets: [
    {
      id: "private-asset-id",
      name: "Balão",
      path: "C:/private/media.png",
      kind: "image",
      generated: "annotation",
      duration: 0,
      width: 200,
      height: 100,
      fps: 0,
      hasVideo: true,
      hasAudio: false,
      size: 100,
      proxyStatus: "none",
    },
  ],
  clips: [
    {
      id: "private-clip-id",
      assetId: "private-asset-id",
      trackId: "private-track-id",
      start: 12,
      duration: 4,
      in: 0,
      volume: 1,
      annotation: {
        kind: "balloon",
        text: "Clique aqui",
        color: "#FF0000",
        tailPoint: { x: 2, y: 0.5 },
        balloonGeometry: { x: 20, y: 20, w: 100, h: 80, tipX: 220, tipY: 60 },
      },
      transform: { x: 0.4, y: 0.3, scale: 0.2, opacity: 1 },
      enter: "pop",
    },
  ],
};

test("editing model preserves editable style, layout and speech anchors without local paths or IDs", () => {
  const md = buildEditingTemplate(
    project,
    [{ start: 12, end: 13, text: "Procure a chave." }],
    "Evitar cobrir o personagem.",
  );
  assert.ok(md.includes("Procure a chave."));
  assert.ok(md.includes("Clique aqui"));
  assert.ok(md.includes('"tailPoint"'));
  assert.ok(md.includes('"scale": 0.2'));
  assert.ok(md.includes('"track": "F1"'));
  assert.ok(md.includes('"media": "M1"'));
  assert.ok(md.includes("Evitar cobrir o personagem."));
  assert.ok(!md.includes("C:/private"));
  assert.ok(!md.includes("private-"));
  assert.ok(!md.includes("balloonGeometry"));
  assert.ok(md.includes("não copie cortes"));
});

test("generation handles empty projects and leaves the source project unchanged", () => {
  const before = structuredClone(project);
  buildEditingTemplate(project);
  assert.deepEqual(project, before);
  const md = buildEditingTemplate({ ...project, assets: [], clips: [], tracks: [] });
  assert.ok(md.includes("0:00.00"));
  assert.ok(md.includes("Pedido sugerido"));
});

test("user text cannot terminate a JSON code fence or introduce table columns", () => {
  const changed = structuredClone(project);
  changed.clips[0].annotation!.text = "Texto ``` com | separador";
  const md = buildEditingTemplate(changed);
  assert.ok(md.includes("````json"));
  assert.ok(md.includes("Aula \\| 01"));
});
