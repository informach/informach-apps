import { clipEnd, newId, sourceEnd, timelineAt } from "./clipTime.ts";
import { overwriteRange } from "./timeline.ts";
import type { Asset, Clip, Project, Retry } from "./types.ts";

/**
 * "Errei, voltar": the lesson comes in with the last attempt; the earlier one stays in the screen
 * recording's media (Asset.retries) and goes back in place of the later one, or the other way
 * round, on the same stretch of the timeline. The voice does not change: both attempts were
 * recorded over the same seconds of it.
 */

const EPS = 1e-3;

/** The clip that shows `point` of the media, on a track that is not locked. */
function showing(p: Project, assetId: string, point: number): Clip | undefined {
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  return p.clips.find(
    (c) =>
      c.assetId === assetId &&
      !locked.has(c.trackId) &&
      point >= c.in - EPS &&
      point < sourceEnd(c) - EPS,
  );
}

/** Where the stretch of retry `r` is on the timeline now, or null when it is no longer there. */
export function retryAt(p: Project, assetId: string, r: Retry): number | null {
  const point = r.using === "earlier" ? r.earlier[0] : r.later;
  const clip = showing(p, assetId, point);
  return clip ? timelineAt(clip, point) : null;
}

/**
 * The lesson with the other attempt of retry `index` of the media in that stretch: the earlier
 * one in place of the later, or the later back. Null when the stretch is not in the lesson any
 * more (cut, or on a locked track).
 */
export function swapAttempt(
  p: Project,
  assetId: string,
  index: number,
): { clips: Clip[]; assets: Asset[] } | null {
  const asset = p.assets.find((a) => a.id === assetId);
  const r = asset?.retries?.[index];
  if (!asset || !r) return null;
  const usingEarlier = r.using === "earlier";
  const point = usingEarlier ? r.earlier[0] : r.later;
  const clip = showing(p, assetId, point);
  if (!clip) return null;
  const at = timelineAt(clip, point);
  // Only what both attempts can show, and never past the clip showing the one in the lesson:
  // what comes after it (the next part, a cut) is not touched.
  const length = Math.min(
    r.length ?? (r.earlier[1] - r.earlier[0]) / (r.speed ?? 1),
    clipEnd(clip) - at,
  );
  if (length < 1 / 30) return null;
  const {
    id: _id,
    start: _start,
    in: _in,
    duration: _duration,
    speed: _speed,
    timelapse: _lapse,
    ...look
  } = clip;
  const next: Clip = {
    ...look,
    id: newId("c"),
    start: at,
    in: usingEarlier ? r.later : r.earlier[0],
    duration: length,
    ...(!usingEarlier && r.speed ? { speed: r.speed } : {}),
  };
  const clips = [...overwriteRange(p.clips, clip.trackId, at, at + length), next];
  const retries = asset.retries?.map((x, i) => {
    if (i !== index) return x;
    const { using: _using, ...rest } = x;
    return usingEarlier ? rest : { ...rest, using: "earlier" as const };
  });
  return {
    clips,
    assets: p.assets.map((a) => (a.id === assetId ? { ...a, retries } : a)),
  };
}

/**
 * The retries of a take's screen media from the layout's earlier attempts (take seconds), for the
 * files the screen was recorded in (whole, or in parts at `at` of the take from `in` of the file).
 * An attempt that crosses two parts of the screen stays out. `kept` lists the attempts that
 * became retries (the others have nothing to put back).
 */
export function retriesFromAttempts<
  A extends { from: number; to: number; speed?: number; later: number; length?: number },
>(
  attempts: readonly A[],
  files: readonly { assetId: string; at: number; in?: number; duration: number }[],
): { byAsset: Map<string, Retry[]>; kept: A[] } {
  const out = new Map<string, Retry[]>();
  const kept: A[] = [];
  const fileOf = (t: number) => files.find((f) => t >= f.at - EPS && t < f.at + f.duration + EPS);
  for (const a of attempts) {
    const f = fileOf(a.from);
    if (!f || fileOf(a.later) !== f || a.to > f.at + f.duration + EPS) continue;
    const src = (t: number): number => Math.round((t - f.at + (f.in ?? 0)) * 1000) / 1000;
    out.set(f.assetId, [
      ...(out.get(f.assetId) ?? []),
      {
        earlier: [src(a.from), src(a.to)],
        later: src(a.later),
        ...(a.speed ? { speed: a.speed } : {}),
        ...(a.length !== undefined ? { length: a.length } : {}),
      },
    ]);
    kept.push(a);
  }
  return { byAsset: out, kept };
}
