import assert from "node:assert/strict";
import { test } from "node:test";
import { partProjectFields, partProjectName, rangeProject } from "../src/shared/lessonParts.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const SCRIPT = `# Roteiro
## Seção 1. O farol
### \`F1P1-V01\` · A Chave do Farol
**Professora:**
> "Neste desafio você vai programar o jogo do farol que guia o barco até a costa."
>
> "Primeiro jogue a versão pronta para entender como o barco chega."
## Seção 2. Os blocos
### \`F1P1-V02\` · Blocos de repetição
**Professora:**
> "Agora arraste o bloco repita para dentro do evento quando clicar na bandeira."
>
> "Mude o número de vezes e veja o barco andar mais longe a cada volta."
## Seção 3. O desafio final
**Professora:**
> "Monte sozinho a sequência que acende o farol antes de o barco bater nas pedras."
`;

const asset = (id: string): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.mp4`,
  kind: "video",
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
});

const lesson = (): Project => ({
  version: 1,
  id: "longa",
  name: "Gravação longa",
  course: "Sistema Zero",
  createdAt: 0,
  updatedAt: 5,
  exportedAt: 9,
  settings: { width: 1920, height: 1080, fps: 30 },
  script: { text: SCRIPT, section: 0, confirmed: true },
  publish: { title: "Tudo", chapters: [{ time: 0, title: "a" }], thumbnail: { time: 50 } },
  assets: [asset("tela"), { ...asset("balao"), kind: "image", generated: "annotation" }],
  tracks: [
    { id: "t1", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    { id: "t2", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "a", assetId: "tela", trackId: "t2", start: 0, in: 0, duration: 30, volume: 1 },
    { id: "b", assetId: "tela", trackId: "t2", start: 30, in: 40, duration: 50, volume: 1 },
    {
      id: "k",
      assetId: "tela",
      trackId: "t1",
      start: 35,
      in: 0,
      duration: 10,
      volume: 1,
      keyframes: [
        { t: 0, x: 0.2, y: 0.5, scale: 1 },
        { t: 8, x: 0.8, y: 0.5, scale: 1 },
      ],
    },
    { id: "n", assetId: "balao", trackId: "t1", start: 90, in: 0, duration: 4, volume: 1 },
  ],
  proposals: [],
  reviewedSeams: ["x"],
});

test("rangeProject keeps the stretch, cut at its borders and moved to 0:00", () => {
  const part = rangeProject(lesson(), 20, 60);
  const byId = new Map(part.clips.map((c) => [c.id, c]));
  // "a" is cut at 20 s: 10 s of it, from second 20 of the file.
  const a = part.clips.find((c) => c.in === 20);
  assert.ok(a);
  assert.equal(a.start, 0);
  assert.equal(a.duration, 10);
  // "b" whole start (30 s) is now 10 s; it is cut at 60 s.
  const b = byId.get("b");
  assert.equal(b?.start, 10);
  assert.equal(b?.duration, 30);
  // The moving clip keeps its moments on its own clock.
  assert.equal(byId.get("k")?.start, 15);
  assert.deepEqual(
    byId.get("k")?.keyframes?.map((k) => k.t),
    [0, 8],
  );
  // The annotation at 90 s is outside, and so is its picture.
  assert.equal(byId.has("n"), false);
  assert.ok(!part.assets.some((x) => x.id === "balao"));
  // Times of the whole lesson are left out.
  assert.equal(part.proposals, undefined);
  assert.equal(part.reviewedSeams, undefined);
  assert.equal(part.exportedAt, undefined);
  assert.deepEqual(part.publish, { title: "Tudo" });
});

test("um projeto por parte: nome da aula e da parte, roteiro inteiro com a parte escolhida", () => {
  const doc = parseScript(SCRIPT);
  assert.ok(doc);
  assert.equal(partProjectName(" DPJ Aula01 ", doc, 0), "DPJ Aula01 · Parte 1. A Chave do Farol");
  assert.equal(partProjectName("DPJ Aula01", doc, 2), "DPJ Aula01 · Parte 3. O desafio final");
  const lesson = { id: "p-aula", script: { text: SCRIPT, section: 0, confirmed: false } };
  assert.deepEqual(partProjectFields(lesson, doc, 1), {
    script: { text: SCRIPT, section: 1, confirmed: true },
    publish: { videoId: "F1P1-V02", title: "Blocos de repetição" },
    // A marca de parte: o painel Roteiro do projeto da parte não oferece criar partes de novo.
    partOf: { lesson: "p-aula", section: 1 },
  });
  // Parte sem vídeo nomeado: sem publish.
  assert.equal(partProjectFields(lesson, doc, 2).publish, undefined);
  // Aula sem roteiro: só a marca de parte.
  assert.deepEqual(partProjectFields({ id: "p-aula" }, doc, 1), {
    publish: { videoId: "F1P1-V02", title: "Blocos de repetição" },
    partOf: { lesson: "p-aula", section: 1 },
  });
});
