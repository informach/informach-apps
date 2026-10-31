import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionJournal } from "../src/main/recording/journal.ts";
import {
  type JournalLine,
  keptRanges,
  momentInTake,
  rangesInTake,
  referenceSource,
  replayJournal,
  segmentOffsets,
  takeSegments,
} from "../src/shared/recordingJournal.ts";

const begin: JournalLine = {
  k: "begin",
  v: 1,
  at: 1_700_000_000_000,
  qpc: 1000,
  fps: 30,
  monitor: { x: 0, y: 0, width: 1920, height: 1080 },
  region: null,
  encoder: "GPU (NVENC)",
  sources: { screen: true, microphone: "Mic", camera: null, system: false, keys: false },
};
const text = (...lines: JournalLine[]): string => lines.map((l) => JSON.stringify(l)).join("\n");

test("a take replays from its journal, and a last line cut off by a crash is skipped", () => {
  const replay = replayJournal(
    `${text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
      { k: "first", src: "mic", part: 0, qpc: 2030, file: "microfone-0.m4a" },
      { k: "pause", qpc: 5000 },
      { k: "resume", qpc: 7000 },
      { k: "marker", qpc: 8000, kind: "retake" },
      { k: "line", qpc: 8100, index: 3 },
      { k: "narration", file: "narracao.wav", offset: 1.5, origin: 2000 },
    )}\n{"k":"pause","qp`,
  );
  assert.equal(replay.skipped, 1);
  assert.equal(replay.begin?.fps, 30);
  assert.deepEqual(replay.parts.screen, [{ part: 0, qpc: 2000, file: "tela-0.mp4" }]);
  assert.deepEqual(replay.parts.mic, [{ part: 0, qpc: 2030, file: "microfone-0.m4a" }]);
  assert.deepEqual(replay.pauses, [[5000, 7000]]);
  assert.deepEqual(replay.markers, [{ qpc: 8000, kind: "retake" }]);
  assert.deepEqual(replay.lines, [{ qpc: 8100, index: 3 }]);
  assert.deepEqual(replay.narration, { file: "narracao.wav", offset: 1.5, origin: 2000 });
  assert.equal(replay.imported, false);
  assert.equal(replay.finalized, false);
  assert.equal(replay.stop, null);
  assert.equal(replay.lastQpc, 8100);
});

test("a pause that never resumed runs to the end, and the stop cuts what came after it", () => {
  const paused = replayJournal(text(begin, { k: "pause", qpc: 5000 }));
  assert.deepEqual(paused.pauses, [[5000, Number.POSITIVE_INFINITY]]);
  const stopped = replayJournal(
    text(begin, { k: "stop", qpc: 9000 }, { k: "finalized", qpc: 9500 }, { k: "imported", at: 1 }),
  );
  assert.deepEqual(stopped.pauses, [[9000, Number.POSITIVE_INFINITY]]);
  assert.equal(stopped.stop, 9000);
  assert.equal(stopped.finalized, true);
  assert.equal(stopped.imported, true);
  // Stopped while paused: one cut from the pause on.
  const both = replayJournal(text(begin, { k: "pause", qpc: 5000 }, { k: "stop", qpc: 9000 }));
  assert.deepEqual(both.pauses, [[5000, Number.POSITIVE_INFINITY]]);
});

test("a failure of the screen or the microphone counts as a pause; the camera's does not", () => {
  const handled = replayJournal(
    text(
      begin,
      { k: "fail", src: "screen", qpc: 4000, message: "disco cheio" },
      { k: "pause", qpc: 4000 },
      { k: "resume", qpc: 6000 },
    ),
  );
  assert.deepEqual(handled.pauses, [[4000, 6000]]);
  assert.deepEqual(handled.failures, [{ src: "screen", qpc: 4000, message: "disco cheio" }]);
  // The app went down right after the failure: only the fail line made it.
  const crashed = replayJournal(text(begin, { k: "fail", src: "mic", qpc: 4000, message: "x" }));
  assert.deepEqual(crashed.pauses, [[4000, Number.POSITIVE_INFINITY]]);
  const camera = replayJournal(text(begin, { k: "fail", src: "camera", qpc: 4000, message: "x" }));
  assert.deepEqual(camera.pauses, []);
});

test("the first-sample estimate of a part only gets earlier", () => {
  const replay = replayJournal(
    text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2040, file: "tela-0.mp4" },
      { k: "first", src: "screen", part: 0, qpc: 2010, file: "tela-0.mp4" },
      { k: "first", src: "screen", part: 0, qpc: 2025, file: "tela-0.mp4" },
      { k: "first", src: "screen", part: 1, qpc: 9000, file: "tela-1.mp4" },
      { k: "first", src: "system", part: 0, qpc: 2100, file: "sistema.webm" },
      { k: "end", src: "system", part: 0, qpc: 8100 },
    ),
  );
  assert.deepEqual(
    replay.parts.screen.map((p) => [p.part, p.qpc]),
    [
      [0, 2010],
      [1, 9000],
    ],
  );
  assert.equal(replay.parts.system[0].end, 8100);
});

test("several parts: QPC times map to seconds of the take, and pauses split across the gap", () => {
  // A pause longer than five minutes closed the first part; resuming opened the second.
  const parts = [
    { part: 0, qpc: 10000, file: "tela-0.mp4" },
    { part: 1, qpc: 330000, file: "tela-1.mp4" },
  ];
  const durations = new Map([
    ["tela-0.mp4", 4],
    ["tela-1.mp4", 3],
  ]);
  const segments = takeSegments(parts, durations);
  assert.deepEqual(segments, [
    { start: 10000, duration: 4 },
    { start: 330000, duration: 3 },
  ]);
  assert.deepEqual(segmentOffsets(segments), [0, 4]);
  // Paused at 2 s of the first part and resumed when the second had its first frame.
  assert.deepEqual(rangesInTake([[12000, 330000]], segments), [[2, 4]]);
  // A pause through the end of the take and a gap of the cursor helper.
  assert.deepEqual(
    rangesInTake(
      [
        [12000, 330500],
        [332000, Number.POSITIVE_INFINITY],
      ],
      segments,
    ),
    [
      [2, 4.5],
      [6, 7],
    ],
  );
  assert.equal(momentInTake(segments, 330500), 4.5);
  // Between parts: where the next one starts.
  assert.equal(momentInTake(segments, 100000), 4);
  assert.deepEqual(keptRanges([[2, 4.5]], 7), [
    [0, 2],
    [4.5, 7],
  ]);
  assert.deepEqual(keptRanges([], 7), [[0, 7]]);
  assert.deepEqual(keptRanges([[0, 7]], 7), []);
  // A part that probed as empty does not count.
  assert.deepEqual(takeSegments(parts, new Map([["tela-0.mp4", 4]])), [
    { start: 10000, duration: 4 },
  ]);
});

test("the screen sets the take's clock; without it, the microphone does", () => {
  const withScreen = replayJournal(
    text(
      begin,
      { k: "first", src: "mic", part: 0, qpc: 1990, file: "microfone-0.m4a" },
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
    ),
  );
  assert.equal(referenceSource(withScreen), "screen");
  const voice = replayJournal(
    text(begin, { k: "first", src: "mic", part: 0, qpc: 1990, file: "microfone-0.m4a" }),
  );
  assert.equal(referenceSource(voice), "mic");
  assert.equal(referenceSource(replayJournal(text(begin))), null);
});

test("the lines a recovery cannot rebuild reach the disk at once; the voice anchors wait", () => {
  const synced: string[] = [];
  let pending = "";
  const journal = new SessionJournal("C:/take", undefined, {
    write: (line) => {
      pending = JSON.parse(line).k;
    },
    sync: () => synced.push(pending),
    close: () => undefined,
  });
  const lines: JournalLine[] = [
    begin,
    { k: "first", src: "screen", part: 0, qpc: 1000, file: "tela.mp4" },
    { k: "over", qpc: 1500, at: 12 },
    { k: "pause", qpc: 2000 },
    { k: "resume", qpc: 3000 },
    { k: "drawMode", qpc: 3500, on: true },
    { k: "end", src: "screen", part: 0, qpc: 4000 },
    { k: "over", qpc: 4500, at: 14 },
  ];
  for (const line of lines) journal.write(line);
  assert.deepEqual(synced, ["begin", "first", "pause", "resume", "drawMode", "end"]);
  journal.close();
  assert.deepEqual(synced.at(-1), "over");
});

test("um recado volta do diário no momento em que foi aberto, e um recado vazio não vale", () => {
  const replay = replayJournal(
    text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
      { k: "note", qpc: 4000, text: "errei o clique no bloco" },
    ) + `\n${JSON.stringify({ k: "note", qpc: 4500, text: "" })}`,
  );
  assert.deepEqual(replay.notes, [{ qpc: 4000, text: "errei o clique no bloco" }]);
  assert.equal(replay.skipped, 1);
});

test("a voz segurada volta do diário com a fala em que segurou, e sem soltar não vale", () => {
  const replay = replayJournal(
    text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
      { k: "lapse", qpc: 4000, edge: "start", at: 20, from: 15 },
      { k: "lapse", qpc: 9000, edge: "end", at: 20 },
      { k: "lapse", qpc: 12000, edge: "start", at: 30 },
    ),
  );
  assert.deepEqual(replay.lapses, [
    { from: 4000, at: 20, line: 15, to: 9000 },
    { from: 12000, at: 30 },
  ]);
});

test("errei, voltar: o conserto vira pausa e a nova tentativa sai com o ponto de volta", () => {
  const replay = replayJournal(
    text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
      { k: "redo", qpc: 5000, edge: "start", at: 22 },
      { k: "redo", qpc: 9000, edge: "end", at: 18 },
    ),
  );
  assert.deepEqual(replay.pauses, [[5000, 9000]]);
  assert.deepEqual(replay.redos, [{ qpc: 9000, at: 18 }]);
});

test("uma fonte que volta durante o errei, voltar não encerra o conserto", () => {
  const replay = replayJournal(
    text(
      begin,
      { k: "first", src: "screen", part: 0, qpc: 2000, file: "tela-0.mp4" },
      { k: "redo", qpc: 5000, edge: "start", at: 22 },
      { k: "fail", src: "screen", qpc: 6000, message: "parou" },
      { k: "resume", qpc: 7000 },
      { k: "redo", qpc: 9000, edge: "end", at: 18 },
    ),
  );
  assert.deepEqual(replay.pauses, [[5000, 9000]]);
  assert.deepEqual(replay.redos, [{ qpc: 9000, at: 18 }]);
});
