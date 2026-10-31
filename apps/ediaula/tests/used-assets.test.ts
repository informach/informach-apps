import assert from "node:assert/strict";
import { test } from "node:test";
import { packPlan } from "../src/shared/projectPackage.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";
import { onlyUsedAssets, usedAssetIds } from "../src/shared/usedAssets.ts";

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.mp4`,
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

const on = (assetId: string): Clip => ({
  id: `c-${assetId}`,
  assetId,
  trackId: "v1",
  start: 0,
  in: 0,
  out: 10,
  duration: 10,
  volume: 1,
});

const lesson = (assets: Asset[], clips: Clip[], extra: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks: [{ id: "v1", kind: "video", name: "v1", muted: false, hidden: false, locked: false }],
  clips,
  ...extra,
});

test("a aula leva o que está na timeline e o que isso precisa, e deixa o take regravado", () => {
  const p = lesson(
    [
      media("tela2"),
      // Recorded over: no clip of it is left.
      media("tela1"),
      // A frame held from the screen, and the pen drawn over another take.
      media("quadro", { kind: "image", still: { assetId: "tela-origem", t: 3 } }),
      media("tela-origem"),
      media("desenho", {
        drawing: { strokes: [], clears: [], pointer: { assetId: "tela3", offset: 0 } },
      } as Partial<Asset>),
      media("tela3"),
      media("fundo", { kind: "image" }),
      media("debinha"),
      media("voz", { kind: "audio" }),
      media("musica", { kind: "audio" }),
      media("apresentador"),
    ],
    [on("tela2"), on("quadro"), on("desenho"), on("voz")],
    {
      background: { kind: "image", assetId: "fundo" },
      kids: {
        videos: ["debinha"],
        pieces: [
          {
            id: "K1",
            character: "Debinha",
            assetId: "debinha",
            in: 0,
            out: 2,
            voice: { assetId: "voz", from: 1, to: 3 },
          },
        ],
      },
      pendingStart: { music: { assetId: "musica", trackId: "a9", volume: 0.35 } },
    },
  );
  const used = usedAssetIds(p, ["apresentador"]);
  assert.deepEqual([...used].sort(), [
    "apresentador",
    "debinha",
    "desenho",
    "fundo",
    "musica",
    "quadro",
    "tela-origem",
    "tela2",
    "tela3",
    "voz",
  ]);
  assert.equal(used.has("tela1"), false);
  // Without the presenter waiting to be placed, it goes too.
  assert.equal(usedAssetIds(p).has("apresentador"), false);
});

test("o que aponta para a mídia que ficou de fora sai junto", () => {
  const p = lesson(
    [media("tela2"), media("tela1"), media("voz", { kind: "audio" })],
    [on("tela2"), on("voz")],
    {
      protected: [
        { id: "r1", assetId: "tela1", start: 0, end: 1, label: "antigo" },
        { id: "r2", assetId: "voz", start: 0, end: 1, label: "fala" },
      ],
      proposals: [
        {
          id: "x1",
          projectId: "p",
          title: "Cortes do take antigo",
          revision: 1,
          createdAt: 0,
          by: "gravacao",
          items: [
            {
              id: "i",
              start: 0,
              end: 1,
              reason: "",
              anchors: [{ clipId: "c", assetId: "tela1", start: 0, end: 1 }],
              status: "pending",
            },
          ],
        },
        {
          id: "x2",
          projectId: "p",
          title: "Cortes da voz",
          revision: 1,
          createdAt: 0,
          by: "gravacao",
          items: [
            {
              id: "j",
              start: 0,
              end: 1,
              reason: "",
              anchors: [{ clipId: "c-voz", assetId: "voz", start: 0, end: 1 }],
              status: "pending",
            },
          ],
        },
      ],
      voiceMasters: [
        {
          id: "m",
          hash: "h",
          createdAt: 0,
          scope: "lesson",
          pieces: [
            {
              file: "C:/v.wav",
              label: "Aula",
              start: 0,
              end: 2,
              sourceMap: [
                { start: 0, duration: 1, assetId: "voz", in: 0 },
                { start: 1, duration: 1, assetId: "tela1", in: 0 },
              ],
            },
          ],
        },
      ],
    } as Partial<Project>,
  );
  const out = onlyUsedAssets(p, usedAssetIds(p));
  assert.deepEqual(
    out.assets.map((a) => a.id),
    ["tela2", "voz"],
  );
  assert.deepEqual(
    out.protected?.map((r) => r.id),
    ["r2"],
  );
  assert.deepEqual(
    out.proposals?.map((x) => x.id),
    ["x2"],
  );
  assert.deepEqual(
    out.voiceMasters?.[0]?.pieces[0]?.sourceMap.map((s) => s.assetId),
    ["voz"],
  );
  // Nothing to leave out: the same lesson.
  assert.equal(onlyUsedAssets(out, usedAssetIds(out)), out);
});

test("o pacote com só o que a aula usa deixa de fora o take regravado e o diz", () => {
  const p = lesson(
    [
      media("tela2"),
      media("tela1", { transcript: "C:/aulas/tela1.json" }),
      media("voz", { kind: "audio" }),
    ],
    [on("tela2"), on("voz")],
  );
  const all = packPlan(p);
  assert.equal(all.files.length, 4);
  assert.deepEqual(all.leftOut, []);
  const only = packPlan(
    p,
    () => true,
    () => [],
    { onlyUsed: true },
  );
  assert.deepEqual(
    only.project.assets.map((a) => a.id),
    ["tela2", "voz"],
  );
  assert.deepEqual(
    only.leftOut.map((a) => a.id),
    ["tela1"],
  );
  assert.equal(only.files.length, 2);
  // A presenter's video waiting to be placed goes along.
  const kept = packPlan(
    p,
    () => true,
    () => [],
    { onlyUsed: true, keep: ["tela1"] },
  );
  assert.equal(kept.files.length, 4);
});
