import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clockOffset,
  layoutOverNarration,
  overAnchor,
  overPieces,
} from "../src/shared/overNarration.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { momentInTake } from "../src/shared/recordingJournal.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

/**
 * A take whose first frame came at QPC 1000 ms. The voice was asked to play from 12 s of the
 * timeline at QPC 1800, but the sound card puts it in the headphones 40 ms later; the window's
 * clock runs 5000 ms behind the main process's.
 */
const FIRST_FRAME = 1000;
const LATENCY = 0.04;
const WINDOW_BEHIND = 5000;

/** The anchors the recorder window would send every half second of playback. */
function anchors(from: number, playAt: number, pauses: [number, number][], until: number) {
  const out: { qpc: number; at: number }[] = [];
  for (let qpc = playAt + 100; qpc < until; qpc += 500) {
    if (pauses.some(([a, b]) => qpc >= a && qpc < b)) continue;
    // Seconds of voice played so far (it stops during the pauses).
    const paused = pauses.reduce(
      (s, [a, b]) => s + Math.max(0, Math.min(qpc, b) - a) * (qpc > a ? 1 : 0),
      0,
    );
    // Where the audio element is; what reaches the ears is LATENCY behind it.
    const currentTime = (qpc - playAt - paused) / 1000;
    out.push(
      overAnchor({
        now: qpc - WINDOW_BEHIND,
        currentTime,
        fileStart: from,
        latency: LATENCY,
        offset: WINDOW_BEHIND,
      }),
    );
  }
  return out;
}

test("o relógio da janela é medido pela ida e volta mais curta", () => {
  const offset = clockOffset([
    { sent: 0, got: 30, qpc: 5020 },
    { sent: 100, got: 104, qpc: 5102 },
    { sent: 200, got: 260, qpc: 5250 },
  ]);
  assert.equal(offset, 5000);
});

test("o take entra no tempo certo da narração, compensando a latência e as pausas", () => {
  const segments = [{ start: FIRST_FRAME, duration: 20 }];
  // Paused from 6 s to 9 s of the take (QPC 7000–10000): the voice paused with it.
  const pauseQpc: [number, number] = [7000, 10000];
  const journal = anchors(12, 1800, [pauseQpc], FIRST_FRAME + 20000);
  const result: Pick<RecordingResult, "duration" | "pauses" | "over"> = {
    duration: 20,
    pauses: [[6, 9]],
    over: {
      from: 12,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const pieces = overPieces(result);
  // The first 0.84 s of the take came before the voice was heard (0.8 s until it played, 40 ms
  // in the sound card): they are left out, and second 0.84 of the take is second 12.
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0].from - 0.84) < 0.002, String(pieces[0].from));
  assert.ok(Math.abs(pieces[0].start - 12) < 0.002, String(pieces[0].start));
  assert.equal(pieces[0].to, 6);
  // After the pause the screen goes on where the voice went on: no gap, no overlap.
  assert.ok(Math.abs(pieces[1].start - (12 + 6 - 0.84)) < 0.002, String(pieces[1].start));
  assert.equal(pieces[1].from, 9);
});

test("regravar a tela num intervalo troca só aquele trecho da faixa da tela", () => {
  const track: Track = {
    id: "tv",
    kind: "video",
    name: "F1",
    muted: false,
    hidden: false,
    locked: false,
  };
  const screen = (id: string): Asset => ({
    id,
    name: id,
    path: `C:/${id}.mp4`,
    kind: "video",
    duration: 60,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  });
  const old: Clip = {
    id: "old",
    assetId: "antiga",
    trackId: "tv",
    start: 0,
    in: 0,
    duration: 40,
    volume: 1,
  };
  const project: Pick<Project, "tracks" | "clips"> = { tracks: [track], clips: [old] };
  const segments = [{ start: FIRST_FRAME, duration: 15 }];
  // Redo 12–20 s: the voice plays from 10 s (two seconds of lead-in) and the take is trimmed.
  const journal = anchors(10, 1800, [], FIRST_FRAME + 15000);
  const result: RecordingResult = {
    version: 2,
    dir: "C:/take",
    screen: "C:/nova.mp4",
    duration: 15,
    pauses: [],
    markers: [],
    mode: "over",
    over: {
      from: 12,
      to: 20,
      replace: true,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const layout = layoutOverNarration(project, [screen("antiga"), screen("nova")], result);
  const onTrack = layout.clips
    .filter((c) => c.trackId === "tv")
    .sort((a, b) => a.start - b.start)
    .map((c) => [
      c.assetId,
      Math.round(c.start * 1000) / 1000,
      Math.round(c.duration * 1000) / 1000,
    ]);
  assert.deepEqual(onTrack, [
    ["antiga", 0, 12],
    ["nova", 12, 8],
    ["antiga", 20, 20],
  ]);
  const placed = layout.clips.find((c) => c.assetId === "nova");
  // Timeline 12 s was heard 2 s into the voice, 0.84 + 2 s into the take.
  assert.ok(placed && Math.abs(placed.in - 2.84) < 0.002, String(placed?.in));
});
