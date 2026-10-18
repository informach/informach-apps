import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  choosePiece,
  crossCorrelate,
  LOW_CONFIDENCE,
  locate,
  locateInPieces,
  rankPieces,
  SYNC_RATE,
} from "../src/shared/audioSync.ts";
import { lessonVoice, mixInto, pink, prng, readWav, stretch, writeWav } from "./helpers/voice.ts";

const R = SYNC_RATE;
const master = lessonVoice(90, R, 7);
const at = (seconds: number): number => Math.round(seconds * R);
const segment = (from: number, to: number): Float32Array => master.slice(at(from), at(to));
const tmp = mkdtempSync(join(tmpdir(), "ediaula-sync-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

test("a correlação pela FFT confere com a soma direta", () => {
  const a = [1, 2, 3, 4, 0, -1];
  const b = [2, -1, 1];
  const fast = crossCorrelate(a, b);
  for (let k = -(b.length - 1); k < a.length; k++) {
    let sum = 0;
    for (let i = 0; i < b.length; i++) if (i + k >= 0 && i + k < a.length) sum += a[i + k] * b[i];
    assert.ok(Math.abs(fast[k + b.length - 1] - sum) < 1e-9, `lag ${k}`);
  }
});

test("deslocamentos sintéticos são achados com precisão de 10 ms", (t) => {
  let worst = 0;
  for (const offset of [0, 3.217, 12.5, 41.003, 59.75]) {
    const r = locate(master, segment(offset, offset + 30));
    worst = Math.max(worst, Math.abs(r.offset - offset));
    assert.ok(Math.abs(r.offset - offset) < 0.01, `${offset}: ${r.offset}`);
    assert.ok(r.confidence >= 0.8, `confiança ${r.confidence}`);
    assert.equal(r.scale, 1);
  }
  t.diagnostic(`maior erro: ${(worst * 1000).toFixed(2)} ms`);
});

test("trecho parcial dentro do mestre, com silêncio antes, encaixa no lugar certo", (t) => {
  const clip = new Float32Array(at(0.7 + 15));
  mixInto(clip, segment(20, 35), at(0.7));
  const r = locate(master, clip);
  t.diagnostic(
    `erro: ${(Math.abs(r.offset - 19.3) * 1000).toFixed(2)} ms, confiança ${r.confidence}`,
  );
  assert.ok(Math.abs(r.offset - (20 - 0.7)) < 0.01, String(r.offset));
  assert.ok(r.confidence >= LOW_CONFIDENCE);
});

test("ruído e ganho diferentes não tiram o encaixe do lugar", (t) => {
  const clip = segment(33.33, 63.33).map((v) => v * 0.25);
  mixInto(clip, pink(30, R, 99, 0.012));
  const r = locate(master, clip);
  t.diagnostic(
    `erro: ${(Math.abs(r.offset - 33.33) * 1000).toFixed(2)} ms, confiança ${r.confidence}`,
  );
  assert.ok(Math.abs(r.offset - 33.33) < 0.01, String(r.offset));
  assert.ok(r.confidence >= LOW_CONFIDENCE, `confiança ${r.confidence}`);
});

test("recodificação em AAC (como o MP4 do HeyGen) mantém o encaixe", (t) => {
  const ffmpeg = createRequire(import.meta.url)("ffmpeg-static") as string;
  const src = join(tmp, "trecho.wav");
  const aac = join(tmp, "trecho.m4a");
  const back = join(tmp, "volta.wav");
  // At 48 kHz, as the voice goes to HeyGen, then back to the comparison rate.
  writeWav(src, stretch(segment(17.4, 47.4), 6), R * 6);
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", src, "-c:a", "aac", "-b:a", "96k", aac]);
  execFileSync(ffmpeg, ["-y", "-v", "error", "-i", aac, "-ac", "1", "-ar", String(R), back]);
  const r = locate(master, readWav(back).samples);
  t.diagnostic(
    `erro: ${(Math.abs(r.offset - 17.4) * 1000).toFixed(2)} ms, confiança ${r.confidence}`,
  );
  assert.ok(Math.abs(r.offset - 17.4) < 0.01, String(r.offset));
  assert.ok(r.confidence >= LOW_CONFIDENCE, `confiança ${r.confidence}`);
});

test("deriva pequena: o fator é estimado e o fim também encaixa", (t) => {
  const factor = 1.0015;
  const clip = stretch(segment(10, 70), factor);
  const r = locate(master, clip);
  assert.ok(Math.abs(r.scale - 1 / factor) < 2e-4, `fator ${r.scale}`);
  assert.ok(Math.abs(r.offset - 10) < 0.01, String(r.offset));
  // The clip's last second lines up with the master's 69 s within 10 ms.
  const end = r.offset + (clip.length / R - 1) * r.scale;
  t.diagnostic(
    `fator ${r.scale} (real ${(1 / factor).toFixed(6)}), erro no começo ${(Math.abs(r.offset - 10) * 1000).toFixed(2)} ms, no fim ${(Math.abs(end - (10 + (clip.length / R - 1) / factor)) * 1000).toFixed(2)} ms`,
  );
  assert.ok(Math.abs(end - (10 + (clip.length / R - 1) / factor)) < 0.01, String(end));
});

test("outra fala tem confiança baixa; entre pedaços, o certo ganha", (t) => {
  const other = lessonVoice(20, R, 1234);
  const r = locate(master, other);
  t.diagnostic(`confiança de outra fala: ${r.confidence}`);
  assert.ok(r.confidence < LOW_CONFIDENCE, `confiança ${r.confidence}`);
  const pieces = [master.slice(0, at(30)), master.slice(at(30), at(60)), master.slice(at(60))];
  const best = locateInPieces(pieces, segment(42, 52));
  assert.equal(best?.piece, 1);
  assert.ok(Math.abs((best?.result.offset ?? 0) - 12) < 0.01);
});

test("o mesmo contorno com outro som não passa: sem a forma de onda, confiança zero", () => {
  // Every sample's sign flipped at random: the loudness over time is the same, the sound is not.
  const random = prng(99);
  const scrambled = segment(30, 45).map((v) => (random() < 0.5 ? -v : v));
  const r = locate(master, scrambled);
  assert.ok(r.fine < 0.2, `forma de onda ${r.fine}`);
  assert.equal(r.confidence, 0);
});

test("dois pedaços iguais deixam a escolha em dúvida, a não ser que deem no mesmo lugar", () => {
  const piece = master.slice(at(10), at(40));
  const clip = segment(20, 30);
  const ranked = rankPieces([piece, piece.slice()], clip);
  assert.equal(ranked[0].result.confidence, ranked[1].result.confidence);
  assert.equal(choosePiece(ranked)?.ambiguous, true);
  // The same voice exported twice: the video goes to the same place either way.
  const same = choosePiece(ranked, () => true);
  assert.equal(same?.ambiguous, false);
  assert.equal(same?.piece, 0, "no empate, o primeiro da lista (o mais novo)");
  // A clear winner is not a doubt.
  const clear = locateInPieces(
    [master.slice(0, at(30)), master.slice(at(30), at(60))],
    segment(42, 52),
  );
  assert.equal(clear?.piece, 1);
  assert.equal(clear?.ambiguous, false);
});
