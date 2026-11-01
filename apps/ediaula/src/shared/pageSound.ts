/**
 * The page's sound of a guided take in the lesson window ("Som da página"), on a track of its
 * own. It is recorded on the wall clock (main/pageSound.ts), while the video's time stands still
 * when the take holds (shared/frameClock.ts): a page still loading, a check on the server, a
 * pause. The take writes a sample of both clocks every half second ("sync" in guided-log.jsonl),
 * and the sound is cut to the video's time from them: where the video held, the sound heard
 * meanwhile is left out, so what the page plays stays on what it shows.
 */

/** Both clocks at one moment: `w` wall seconds since the video's clock started, `t` video. */
export interface ClockSample {
  w: number;
  t: number;
}

/** A stretch of the recorded sound (`from` to `to`, seconds of the file) at video second `at`. */
export interface SoundPiece {
  from: number;
  to: number;
  at: number;
}

/** A change of the clocks' difference smaller than this is the clock's own jitter, not a hold. */
export const SYNC_TOLERANCE = 0.04;

/**
 * Where the recorded sound goes in the video. `start`: wall second the recording started;
 * `end`: the video's length. Between two samples the video held for the growth of the clocks'
 * difference; the sound of a hold is left out at the start of the stretch where it happened.
 */
export function soundPieces(
  samples: readonly ClockSample[],
  start: number,
  end: number,
): SoundPiece[] {
  const sorted = [...samples].filter((s) => s.t <= end).sort((a, b) => a.t - b.t || a.w - b.w);
  // Each stretch of the video keeps one difference between the clocks (wall = video + d).
  const stretches: { t: number; d: number }[] = [{ t: 0, d: 0 }];
  for (const [i, s] of sorted.entries()) {
    const d = s.w - s.t;
    const last = stretches[stretches.length - 1];
    if (Math.abs(d - last.d) <= SYNC_TOLERANCE) continue;
    stretches.push({ t: i > 0 ? sorted[i - 1].t : 0, d });
  }
  const pieces: SoundPiece[] = [];
  for (const [i, s] of stretches.entries()) {
    const t1 = i + 1 < stretches.length ? stretches[i + 1].t : end;
    // Seconds of the file: the wall second less where the recording started.
    const a = s.t + s.d - start;
    const b = t1 + s.d - start;
    const from = Math.max(0, a);
    if (b - from <= 1e-3) continue;
    pieces.push({ from: round(from), to: round(b), at: round(s.t + (from - a)) });
  }
  return pieces;
}

/**
 * FFmpeg's filter that makes the sound of the video's time from `pieces`: silence where nothing
 * was recorded, each piece cut from the input and laid end to end, `[out]` of `end` seconds.
 */
export function soundAlignFilter(pieces: readonly SoundPiece[], end: number, rate = 48000): string {
  const parts: string[] = [];
  const labels: string[] = [];
  const silence = (seconds: number) => {
    const label = `[g${labels.length}]`;
    parts.push(`anullsrc=r=${rate}:cl=stereo,atrim=duration=${seconds.toFixed(3)}${label}`);
    labels.push(label);
  };
  let cursor = 0;
  for (const p of pieces) {
    const length = Math.min(p.to - p.from, end - p.at);
    if (length <= 1e-3) continue;
    if (p.at - cursor > 1e-3) silence(p.at - cursor);
    const label = `[p${labels.length}]`;
    parts.push(
      `[0:a]atrim=start=${p.from.toFixed(3)}:end=${(p.from + length).toFixed(3)},asetpts=PTS-STARTPTS,aresample=${rate},aformat=channel_layouts=stereo${label}`,
    );
    labels.push(label);
    cursor = Math.max(cursor, p.at + length);
  }
  if (end - cursor > 1e-3) silence(end - cursor);
  if (!labels.length) silence(Math.max(end, 0.001));
  parts.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`);
  return parts.join(";\n");
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
