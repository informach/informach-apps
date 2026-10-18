import assert from "node:assert/strict";
import { test } from "node:test";
import type { PieceMatch } from "../src/shared/audioSync.ts";
import { applyCuts } from "../src/shared/cleanup.ts";
import { masterCandidates, planHeygenVideo } from "../src/shared/heygenImport.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Asset, Clip, Project, Track, VoiceMaster } from "../src/shared/types.ts";
import { VOICE_CHAIN_VERSION } from "../src/shared/voiceChain.ts";
import {
  AVATAR_BRIDGE,
  exportFolderName,
  HEYGEN_MAX_SECONDS,
  heygenPlacements,
  insertLines,
  insertPieces,
  masterIsStale,
  pieceFileName,
  pieceToTimeline,
  renderPlan,
  repeatedLabels,
  sourceMapFor,
  splitLong,
  voiceClips,
  voiceHash,
  voiceTakeStart,
} from "../src/shared/voiceMaster.ts";

const asset: Asset = {
  id: "voz",
  name: "Voz",
  path: "C:/aula/voz.wav",
  kind: "audio",
  duration: 120,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  recording: { id: "take", role: "mic" },
  voicePreset: "teacher",
  treated: { path: "C:/cache/voz-tratada.wav", preset: "teacher", version: VOICE_CHAIN_VERSION },
};
const tracks: Track[] = [
  { id: "tv", kind: "video", name: "F1", muted: false, hidden: false, locked: false },
  { id: "ta", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
];
const base = (clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "Aula 3",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [asset],
  tracks,
  clips,
});
const voice = (id: string, start: number, inPoint: number, duration: number): Clip => ({
  id,
  assetId: "voz",
  trackId: "ta",
  start,
  in: inPoint,
  duration,
  volume: 1,
});

test("o mapa do pedaço leva o tempo do arquivo exportado ao tempo da timeline depois de cortes", () => {
  // The lesson was cut before the export: 0 to 20 s and 35 to 80 s of the recording are left.
  const before = base([voice("a", 0, 0, 20), voice("b", 20, 35, 45)]);
  const map = sourceMapFor(before, 0, 65);
  assert.deepEqual(map, [
    { at: 0, duration: 20, start: 0, assetId: "voz", in: 0 },
    { at: 20, duration: 45, start: 20, assetId: "voz", in: 35 },
  ]);
  // Second 30 of the file is second 45 of the recording, at 30 s on the timeline.
  assert.equal(pieceToTimeline(before, { sourceMap: map }, 30), 30);
  // Cut 10 s more (5 to 15 s of the timeline) after the export: the same moment moved 10 s left,
  // and what was cut is no longer anywhere.
  const after = { ...before, clips: applyCuts(before.clips, [[5, 15]], new Set(["ta"])) };
  assert.equal(pieceToTimeline(after, { sourceMap: map }, 30), 20);
  assert.equal(pieceToTimeline(after, { sourceMap: map }, 10), null);
});

test("o vídeo do HeyGen segue os cortes: cada pedaço da voz recebe o vídeo feito dele", () => {
  const before = base([voice("a", 0, 0, 20), voice("b", 20, 35, 45)]);
  const piece = { sourceMap: sourceMapFor(before, 0, 65) };
  // The MP4 starts 0.7 s before the voice (offset -0.7) and runs at the same pace.
  const whole = heygenPlacements(before, piece, -0.7, 1, 65.7);
  assert.deepEqual(whole, [{ start: 0, in: 0.7, duration: 65, speed: 1 }]);
  const after = { ...before, clips: applyCuts(before.clips, [[5, 15]], new Set(["ta"])) };
  assert.deepEqual(heygenPlacements(after, piece, -0.7, 1, 65.7), [
    { start: 0, in: 0.7, duration: 5, speed: 1 },
    { start: 5, in: 15.7, duration: 50, speed: 1 },
  ]);
  // A render 0.1% slower: the clip plays it a little faster to keep the mouth on the voice.
  const slow = heygenPlacements(before, piece, 0, 1 / 1.001, 65 * 1.001);
  assert.equal(slow.length, 1);
  assert.ok(Math.abs(slow[0].speed - 1.001) < 1e-6);
});

test("a voz exportada sai tratada, cortada e em mono 48 kHz 16 bits; o hash muda com a edição", () => {
  const p = base([voice("a", 2, 0, 20), voice("b", 22, 35, 10)]);
  const plan = renderPlan(p, 0, 32, "C:/saida.wav");
  assert.deepEqual(plan.inputs, ["C:/cache/voz-tratada.wav", "C:/cache/voz-tratada.wav"]);
  const args = plan.args.join(" ");
  assert.match(args, /-ss 0 -t 20 -i C:\/cache\/voz-tratada\.wav/);
  assert.match(args, /-ss 35 -t 10 -i/);
  assert.match(args, /adelay=2000:all=1/);
  assert.match(args, /adelay=22000:all=1/);
  assert.match(args, /-ar 48000 -ac 1 -c:a pcm_s16le -f wav C:\/saida\.wav$/);
  const h = voiceHash(p);
  assert.equal(masterIsStale(p, { hash: h }), false);
  const cut = { ...p, clips: applyCuts(p.clips, [[4, 5]], new Set(["ta"])) };
  assert.equal(masterIsStale(cut, { hash: h }), true);
  assert.equal(voiceClips(cut).length, 3);
  assert.equal(
    pieceFileName("Aula 3: robôs/blocos", "F1P1-D01"),
    "Aula 3 robôsblocos (F1P1-D01).wav",
  );
  assert.equal(exportFolderName(new Date(2026, 9, 18, 14, 5, 9)), "2026-10-18 14h05m09");
  assert.deepEqual(
    repeatedLabels([
      { label: "F1P1-D01", start: 0, end: 1 },
      { label: "f1p1-d01", start: 2, end: 3 },
      { label: "F1P1-D02", start: 4, end: 5 },
    ]),
    ["f1p1-d01"],
  );
});

test("calar a voz para o som do HeyGen não muda a voz nem a tira do mapa", () => {
  const p = base([voice("a", 0, 0, 30)]);
  const h = voiceHash(p);
  // Split at 10 and 20 s with the middle silent for HeyGen's sound, as "Usar o som do HeyGen" does.
  const muted = base([
    voice("a1", 0, 0, 10),
    { ...voice("a2", 10, 10, 10), mutedFor: "heygen" },
    voice("a3", 20, 20, 10),
  ]);
  assert.equal(voiceHash(muted), h, "sem aviso falso de voz mudou");
  assert.equal(voiceClips(muted).length, 3);
  assert.deepEqual(sourceMapFor(muted, 0, 30), sourceMapFor(p, 0, 30));
});

test("o avatar não some numa pausa curta entre clipes da voz", () => {
  // Two clips with 1 s of nothing between them: the avatar runs on over it.
  const p = base([voice("a", 0, 0, 10), voice("b", 11, 10, 10)]);
  const piece = { sourceMap: sourceMapFor(p, 0, 21) };
  const placed = heygenPlacements(p, piece, 0, 1, 21);
  assert.deepEqual(placed, [
    { start: 0, in: 0, duration: 11, speed: 1 },
    { start: 11, in: 11, duration: 10, speed: 1 },
  ]);
  // A pause longer than the bridge stays a gap.
  const far = base([voice("a", 0, 0, 10), voice("b", 13, 10, 10)]);
  const gap = heygenPlacements(far, { sourceMap: sourceMapFor(far, 0, 23) }, 0, 1, 23);
  assert.equal(gap[0].duration, 10);
  assert.ok(AVATAR_BRIDGE < 3);
});

test("a segunda tomada Só voz entra depois da primeira, na mesma faixa Voz", () => {
  const take = (dir: string, duration: number): RecordingResult => ({
    version: 2,
    dir,
    microphone: `${dir}/voz.wav`,
    duration,
    pauses: [],
    markers: [],
    mode: "voice",
  });
  const first: Asset = { ...asset, id: "v1", path: "C:/t1/voz.wav", duration: 12 };
  const second: Asset = { ...asset, id: "v2", path: "C:/t2/voz.wav", duration: 8 };
  const empty: Project = { ...base([]), tracks: [{ ...tracks[0] }], assets: [first, second] };
  const r1 = take("C:/t1", 12);
  const one = layoutRecording(empty, [first], r1, voiceTakeStart(empty, r1));
  const afterFirst: Project = { ...empty, tracks: one.tracks, clips: one.clips };
  const r2 = take("C:/t2", 8);
  const two = layoutRecording(afterFirst, [second], r2, voiceTakeStart(afterFirst, r2));
  const voz = two.tracks.filter((t) => t.name === "Voz");
  assert.equal(voz.length, 1, "uma faixa Voz só");
  const clips = two.clips.filter((c) => c.trackId === voz[0].id).sort((a, b) => a.start - b.start);
  assert.deepEqual(
    clips.map((c) => [c.assetId, c.start, c.duration]),
    [
      ["v1", 0, 12],
      ["v2", 12, 8],
    ],
  );
  // Two "Voz" tracks (a project made by hand) are both the voice.
  const twoTracks: Project = {
    ...base([voice("a", 0, 0, 5), { ...voice("b", 5, 10, 5), trackId: "tb" }]),
    tracks: [
      ...tracks,
      { id: "tb", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    ],
  };
  assert.equal(voiceClips(twoTracks).length, 2);
});

test("a inserção do avatar em dois parágrafos sai inteira", () => {
  const script = [
    "## Seção 1",
    "**Na tela:** **F1P1-D01** · Debinha aparece",
    "**Debinha (avatar):**",
    "> Oi, turma!",
    ">",
    "> Hoje eu vou mostrar o robô.",
    "**Professora:**",
    "> Obrigada, Debinha.",
  ].join("\n");
  const section = parseScript(script).sections[0];
  assert.deepEqual(insertLines(section), [{ insertId: "F1P1-D01", lines: [0, 1] }]);
  const takes: Asset = {
    ...asset,
    voiceTakes: [
      { line: 0, start: 0, end: 2 },
      { line: 1, start: 2, end: 6 },
      { line: 2, start: 6, end: 9 },
    ],
  };
  const p: Project = { ...base([voice("a", 0, 0, 9)]), assets: [takes] };
  assert.deepEqual(insertPieces(p, section, []), [{ label: "F1P1-D01", start: 0, end: 6 }]);
});

test("um trecho maior que o HeyGen aceita é dividido numa pausa", () => {
  assert.equal(HEYGEN_MAX_SECONDS, 300, "28,8 MB em WAV 48 kHz 16 bits mono, abaixo dos 32 MB");
  const long = { label: "Aula", start: 0, end: HEYGEN_MAX_SECONDS + 200 };
  const parts = splitLong([long], [[250, 252]]);
  assert.deepEqual(
    parts.map((p) => [p.label, p.start, p.end]),
    [
      ["Aula, parte 1", 0, 251],
      ["Aula, parte 2", 251, 500],
    ],
  );
  assert.ok(parts.every((p) => p.end - p.start <= HEYGEN_MAX_SECONDS));
});

test("a mesma voz exportada duas vezes não deixa o encaixe em dúvida; dois lugares diferentes, sim", () => {
  const p = base([voice("a", 0, 0, 60)]);
  const master = (id: string, file: string, from: number, to: number): VoiceMaster => ({
    id,
    hash: voiceHash(p),
    createdAt: 0,
    scope: "insert",
    pieces: [{ file, label: id, start: from, end: to, sourceMap: sourceMapFor(p, from, to) }],
  });
  // Exported twice, the same 0 to 30 s; and a different stretch of the same length.
  const older = master("m1", "C:/hg/1/a.wav", 0, 30);
  const newer = master("m2", "C:/hg/2/a.wav", 0, 30);
  const other = master("m3", "C:/hg/3/b.wav", 30, 60);
  const withAll: Project = { ...p, voiceMasters: [older, newer, other] };
  const all = masterCandidates(
    withAll,
    new Set(["C:/hg/1/a.wav", "C:/hg/2/a.wav", "C:/hg/3/b.wav"]),
  );
  assert.deepEqual(
    all.map((c) => c.master?.id),
    ["m3", "m2", "m1"],
    "a mais nova primeiro",
  );
  // A file gone from the disk is not compared.
  assert.equal(masterCandidates(withAll, new Set(["C:/hg/1/a.wav"])).length, 1);
  const match = (piece: number, confidence: number): PieceMatch => ({
    piece,
    result: { offset: 0, confidence, scale: 1, peak: 1, second: 0, fine: 0.9 },
  });
  const twice = planHeygenVideo(withAll, all, [match(1, 0.9), match(2, 0.9)], 20);
  assert.equal(twice?.ambiguous, false);
  assert.equal(twice?.doubtful, false);
  assert.equal(twice?.candidate.master?.id, "m2");
  const elsewhere = planHeygenVideo(withAll, all, [match(1, 0.9), match(0, 0.85)], 20);
  assert.equal(elsewhere?.ambiguous, true);
  assert.equal(elsewhere?.doubtful, true);
  const low = planHeygenVideo(withAll, all, [match(0, 0.3)], 20);
  assert.equal(low?.doubtful, true);
  assert.equal(low?.stale, false);
});
