import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clipOf,
  keepRanges,
  musicTracks,
  placeCutaway,
  removeClips,
  spreadMusic,
  trimOne,
} from "../src/shared/clipEdits.ts";
import { clipEnd, sourceAt } from "../src/shared/clipTime.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (id: string, trackId: string, start: number, end: number, extra: Partial<Clip> = {}) =>
  ({ id, assetId: id, trackId, start, in: 0, duration: end - start, volume: 1, ...extra }) as Clip;
const asset = (id: string, duration: number, extra: Partial<Asset> = {}) =>
  ({ id, name: id, path: `C:/${id}`, kind: "video", duration, hasAudio: true, ...extra }) as Asset;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

/** Farol Aula 3 Parte 2: a tela com trechos acelerados, o som da página e a apresentadora inteira. */
function parte2(): Pick<Project, "clips" | "tracks" | "assets"> {
  return {
    tracks: [
      track("apres"),
      track("tela"),
      track("som", { kind: "audio" }),
      track("trava", { locked: true }),
    ],
    assets: [asset("tela", 362), asset("heygen", 323), asset("som", 362), asset("anim", 6.6)],
    clips: [
      clip("t1", "tela", 0, 90, { assetId: "tela" }),
      clip("t2", "tela", 90, 110, { assetId: "tela", in: 95, speed: 1.5 }),
      clip("t3", "tela", 110, 323, { assetId: "tela", in: 125 }),
      clip("s1", "som", 0, 323, { assetId: "som" }),
      clip("ap", "apres", 0, 323, { assetId: "heygen", enter: "fade", fadeIn: 0 }),
      clip("fixo", "trava", 0, 10, { assetId: "som" }),
    ],
  };
}

test("place_cutaway: a animação entra no lugar do trecho da tela e do som, com transição nas duas pontas", () => {
  const p = parte2();
  const anim = clipOf(p.assets[3], "tela", 100);
  const tr = {
    kind: "colorcircles" as const,
    duration: 0.6,
    colors: ["#1B5CF3", "#6D3BF5", "#FFC02E"],
  };
  const r = placeCutaway(p, anim, "tela", ["som"], tr);
  assert.ok(r.ok, r.ok ? "" : r.error);
  const tela = r.clips.filter((c) => c.trackId === "tela").sort((a, b) => a.start - b.start);
  // t2 (90–110) é cortado em volta da animação (100–106,6); t1 e t3 não mudam.
  assert.deepEqual(
    tela.map((c) => [
      c.id === "t2" ? "t2" : c.assetId,
      +c.start.toFixed(2),
      +clipEnd(c).toFixed(2),
    ]),
    [
      ["tela", 0, 90],
      ["t2", 90, 100],
      ["anim", 100, 106.6],
      ["tela", 106.6, 110],
      ["tela", 110, 323],
    ],
  );
  const volta = tela[3];
  near(volta.in, sourceAt(p.clips[1], 106.6)); // a tela volta no ponto certo do vídeo, com a velocidade
  assert.equal(volta.speed, 1.5);
  assert.deepEqual(tela[2].transition, tr);
  assert.deepEqual(volta.transition, tr);
  // O som da página perde o mesmo trecho.
  const som = r.clips
    .filter((c) => c.trackId === "som")
    .map((c) => [c.start, +clipEnd(c).toFixed(2)]);
  assert.deepEqual(som, [
    [0, 100],
    [106.6, 323],
  ]);
  assert.equal(r.trimmed, 2);
  // A apresentadora não muda.
  assert.deepEqual(
    r.clips.find((c) => c.id === "ap"),
    p.clips.find((c) => c.id === "ap"),
  );
});

test("place_cutaway: um clipe já na linha do tempo sai do lugar antigo; faixa travada recusa", () => {
  const p = parte2();
  p.clips.push(clip("a1", "apres", 200, 206.6, { assetId: "anim" }));
  p.clips = p.clips.map((c) => (c.id === "ap" ? { ...c, duration: 190 } : c));
  const moved = p.clips.find((c) => c.id === "a1") as Clip;
  const r = placeCutaway(p, moved, "tela", []);
  assert.ok(r.ok);
  assert.equal(r.clips.filter((c) => c.id === "a1").length, 1);
  assert.equal(r.clips.find((c) => c.id === "a1")?.trackId, "tela");
  assert.equal(r.clips.find((c) => c.id === "a1")?.transition, undefined);
  const recusa = placeCutaway(p, moved, "tela", ["trava"]);
  assert.ok(!recusa.ok);
});

test("keep_ranges: a apresentadora só nos trechos de fala, com esmaecer, e a entrada da capa fica", () => {
  const p = parte2();
  const r = keepRanges(p, "ap", [
    [0, 3],
    [13, 39.8],
    [39.5, 41], // encosta no anterior: junta
    [300, 400], // passa do fim: corta no fim do clipe
    [100, 100.2], // curto demais: sai
  ]);
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.deepEqual(
    r.kept.map((k) => [k.from, +k.to.toFixed(2)]),
    [
      [0, 3],
      [13, 41],
      [300, 323],
    ],
  );
  const pecas = r.clips.filter((c) => c.trackId === "apres").sort((a, b) => a.start - b.start);
  assert.equal(pecas[0].id, "ap");
  assert.equal(pecas[0].fadeIn, 0); // o primeiro quadro, sem esmaecer
  assert.equal(pecas[0].fadeOut, 0.25);
  assert.equal(pecas[1].enter, "fade");
  near(pecas[1].in, 13); // a fala no mesmo lugar: o vídeo não anda
  assert.equal(pecas[2].fadeIn, 0.25);
});

test("keep_ranges recusa trecho fora do clipe, clipe em grupo e faixa travada", () => {
  const p = parte2();
  assert.ok(!keepRanges(p, "ap", [[400, 500]]).ok);
  assert.ok(!keepRanges(p, "fixo", [[0, 5]]).ok);
  p.clips = p.clips.map((c) => (c.id === "ap" ? { ...c, groupId: "g" } : c));
  assert.ok(!keepRanges(p, "ap", [[0, 5]]).ok);
});

test("trim_clip: o vídeo do personagem fica só na fala, sem passar por cima do vizinho", () => {
  const p = parte2();
  p.assets.push(asset("deb", 3.4));
  p.clips.push(clip("deb", "trava2", 173.4, 176.8, { assetId: "deb" }));
  p.tracks.push(track("trava2"));
  const r = trimOne(p, "deb", { start: 173.75, end: 176.2 });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(r.clip.start, 173.75);
  near(r.clip.in, 0.35);
  near(clipEnd(r.clip), 176.2);
  // Não cresce além da mídia.
  const longe = trimOne(p, "deb", { end: 190 });
  assert.ok(longe.ok);
  near(clipEnd(longe.clip), 176.8);
  p.clips.push(clip("vizinho", "trava2", 177, 180, { assetId: "deb" }));
  const t2 = trimOne({ ...p, assets: [...p.assets, asset("longo", 100)] }, "vizinho", {
    start: 170,
  });
  assert.ok(t2.ok); // limitado pela mídia (começa em 0 do arquivo)
  assert.ok(!trimOne(p, "fixo", { end: 5 }).ok);
});

test("remove_clips: tira com o grupo, deixa os travados e recusa id desconhecido", () => {
  const p = parte2();
  p.clips = p.clips.map((c) => (c.id === "t3" || c.id === "s1" ? { ...c, groupId: "g" } : c));
  const r = removeClips(p, ["t3", "fixo"]);
  assert.ok(r.ok);
  assert.deepEqual(r.removed.sort(), ["s1", "t3"]);
  assert.deepEqual(r.locked, ["fixo"]);
  assert.ok(r.clips.some((c) => c.id === "fixo"));
  assert.ok(!removeClips(p, ["nada"]).ok);
  assert.ok(!removeClips(p, ["fixo"]).ok);
});

test("spread_music: cópias sobrepostas em duas faixas, com fade, até o fim da aula", () => {
  const musica = asset("musica", 93.19, { kind: "audio" });
  const [a, b] = musicTracks([track("Música")]);
  assert.equal(a.name, "Música 2");
  assert.ok(a.music && b.music);
  const r = spreadMusic(musica, [a.id, b.id], {
    start: 0,
    end: 323,
    overlap: 3,
    fade: 3,
    volume: 0.15,
  });
  assert.ok(r.ok);
  assert.deepEqual(
    r.clips.map((c) => [
      +c.start.toFixed(2),
      +clipEnd(c).toFixed(2),
      c.trackId === a.id ? "a" : "b",
    ]),
    [
      [0, 93.19, "a"],
      [90.19, 183.38, "b"],
      [180.38, 273.57, "a"],
      [270.57, 323, "b"],
    ],
  );
  assert.ok(r.clips.every((c) => c.volume === 0.15 && c.fadeOut === 3));
  assert.ok(
    !spreadMusic(asset("mudo", 50, { hasAudio: false }), [a.id, b.id], {
      start: 0,
      end: 100,
      overlap: 3,
      fade: 3,
      volume: 0.15,
    }).ok,
  );
});
