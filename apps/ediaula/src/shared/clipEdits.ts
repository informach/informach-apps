import { clipEnd, newId } from "./clipTime.ts";
import { withGroups } from "./groups.ts";
import { piece } from "./pieces.ts";
import { trimClip } from "./timeline.ts";
import type { Transition } from "./transitions.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";

/**
 * Edits of the AI tools remove_clips, trim_clip, keep_ranges, place_cutaway and spread_music: the
 * steps of an automatic edit that used to be done on the project file with the editor closed.
 * Every function works out the whole result first and returns an error instead of a partial
 * change, so a refused call leaves the lesson as it was. None of them pushes other clips (no ripple).
 */

const EPS = 1e-6;

const clock = (s: number): string => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
};

export type Refusal = { ok: false; error: string };
type Lesson = Pick<Project, "clips" | "tracks">;

const lockedTracks = (p: Lesson): Set<string> =>
  new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));

/** remove_clips: the clips (and the rest of their groups) out of the lesson; nothing else moves. */
export function removeClips(
  p: Lesson,
  ids: readonly string[],
): { ok: true; clips: Clip[]; removed: string[]; locked: string[] } | Refusal {
  const unknown = ids.filter((id) => !p.clips.some((c) => c.id === id));
  if (unknown.length)
    return {
      ok: false,
      error: `Clipes não encontrados: ${unknown.join(", ")}. Nada foi feito. Use os ids de get_overview.`,
    };
  const locked = lockedTracks(p);
  const all = withGroups(p.clips, ids);
  const blocked = all.filter((id) => locked.has(p.clips.find((c) => c.id === id)?.trackId ?? ""));
  const removed = all.filter((id) => !blocked.includes(id));
  if (!removed.length)
    return {
      ok: false,
      error:
        "Nada foi tirado: todos esses clipes estão em faixas travadas. Peça para a pessoa destravar.",
    };
  const out = new Set(removed);
  return { ok: true, clips: p.clips.filter((c) => !out.has(c.id)), removed, locked: blocked };
}

/** Whether `c` would overlap another clip of its track (the ones in `ignore` do not count). */
function overlaps(clips: readonly Clip[], c: Clip, ignore: ReadonlySet<string>): Clip | undefined {
  return clips.find(
    (x) =>
      x.trackId === c.trackId &&
      x.id !== c.id &&
      !ignore.has(x.id) &&
      x.start < clipEnd(c) - EPS &&
      c.start < clipEnd(x) - EPS,
  );
}

/**
 * trim_clip: one clip's edges moved to `start` and/or `end` (timeline seconds), as dragging its
 * edges: the footage stays where it is on the timeline and only the visible stretch changes. It can
 * grow back up to where its media allows, never over another clip of its track.
 */
export function trimOne(
  p: Lesson & Pick<Project, "assets">,
  id: string,
  edges: { start?: number; end?: number },
): { ok: true; clips: Clip[]; clip: Clip } | Refusal {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return { ok: false, error: `Clipe não encontrado: ${id}. Nada foi feito.` };
  if (lockedTracks(p).has(c.trackId))
    return { ok: false, error: `O clipe ${id} está numa faixa travada: nada foi feito.` };
  if (edges.start === undefined && edges.end === undefined)
    return { ok: false, error: "Informe start, end ou os dois. Nada foi feito." };
  if (edges.start !== undefined && edges.end !== undefined && edges.end - edges.start < 0.1)
    return { ok: false, error: "O clipe ficaria com menos de 0,1 s. Nada foi feito." };
  const asset = p.assets.find((a) => a.id === c.assetId);
  let next = c;
  if (edges.start !== undefined) next = trimClip(next, "start", edges.start, asset);
  if (edges.end !== undefined) next = trimClip(next, "end", edges.end, asset);
  const hit = overlaps(p.clips, next, new Set());
  if (hit)
    return {
      ok: false,
      error: `O clipe ${id} cobriria o clipe ${hit.id} (${clock(hit.start)}–${clock(clipEnd(hit))}) na mesma faixa. Nada foi feito.`,
    };
  return { ok: true, clips: p.clips.map((x) => (x.id === id ? next : x)), clip: next };
}

/**
 * keep_ranges: one clip kept only in the given stretches (timeline seconds), the rest of it removed,
 * each piece in its own place (the footage does not move). Each piece comes in and goes out with a
 * dissolve of `fade` seconds; the clip's own entrance stays on a piece that starts where the clip
 * starts, and its exit on a piece that ends where it ends. Stretches outside the clip are clipped;
 * overlapping or touching ones join; pieces shorter than `minimum` are dropped.
 */
export function keepRanges(
  p: Lesson,
  id: string,
  ranges: readonly [number, number][],
  fade = 0.25,
  minimum = 0.5,
): { ok: true; clips: Clip[]; kept: { id: string; from: number; to: number }[] } | Refusal {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return { ok: false, error: `Clipe não encontrado: ${id}. Nada foi feito.` };
  if (lockedTracks(p).has(c.trackId))
    return { ok: false, error: `O clipe ${id} está numa faixa travada: nada foi feito.` };
  if (c.groupId)
    return {
      ok: false,
      error: `O clipe ${id} está num grupo: desagrupe antes (os pedaços sairiam do lugar dos outros). Nada foi feito.`,
    };
  const s0 = c.start;
  const e0 = clipEnd(c);
  const joined: [number, number][] = [];
  for (const [a, b] of [...ranges]
    .map(([a, b]) => [Math.max(a, s0), Math.min(b, e0)] as [number, number])
    .filter(([a, b]) => b - a > EPS)
    .sort((x, y) => x[0] - y[0])) {
    const last = joined[joined.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else joined.push([a, b]);
  }
  const kept = joined.filter(([a, b]) => b - a >= minimum);
  if (!kept.length)
    return {
      ok: false,
      error: `Nenhum trecho cai dentro do clipe ${id} (${clock(s0)}–${clock(e0)}) com pelo menos ${minimum} s. Nada foi feito.`,
    };
  const pieces = kept.map(([a, b]) => {
    const head = Math.abs(a - s0) <= EPS;
    const tail = Math.abs(b - e0) <= EPS;
    const out = piece(c, a, b, { head, tail });
    if (!head) Object.assign(out, { fadeIn: fade, enter: "fade" as const });
    if (!tail) Object.assign(out, { fadeOut: fade, exit: "fade" as const });
    return out;
  });
  // The first piece keeps the clip's id (it is the one that "is" the clip from now on).
  if (!pieces.some((x) => x.id === c.id)) pieces[0] = { ...pieces[0], id: c.id };
  const clips = p.clips.flatMap((x) => (x.id === id ? pieces : [x]));
  return {
    ok: true,
    clips,
    kept: pieces.map((x) => ({ id: x.id, from: x.start, to: clipEnd(x) })),
  };
}

/**
 * place_cutaway: `cut` (a clip already built, at its start and duration) put on `trackId` in place
 * of the stretch it covers: the clips of that track, and of `alsoTrackIds` (the sound of the same
 * recording, for instance), lose that stretch, split around it when they cross it. With a
 * transition, it goes into the cutaway and into the clip that comes back after it.
 */
export function placeCutaway(
  p: Lesson,
  cut: Clip,
  trackId: string,
  alsoTrackIds: readonly string[] = [],
  transition?: Transition,
): { ok: true; clips: Clip[]; cutaway: Clip; trimmed: number; removed: number } | Refusal {
  const tracks = [trackId, ...alsoTrackIds];
  const unknown = tracks.filter((id) => !p.tracks.some((t) => t.id === id));
  if (unknown.length)
    return { ok: false, error: `Faixas não encontradas: ${unknown.join(", ")}. Nada foi feito.` };
  const locked = lockedTracks(p);
  const lockedHit = tracks.filter((id) => locked.has(id));
  if (lockedHit.length)
    return { ok: false, error: `Faixa travada: ${lockedHit.join(", ")}. Nada foi feito.` };
  const from = cut.start;
  const to = clipEnd(cut);
  const affected = new Set(tracks);
  const clips: Clip[] = [];
  let trimmed = 0;
  let removed = 0;
  let after: Clip | undefined;
  for (const c of p.clips) {
    if (c.id === cut.id) continue; // a clip moved into the cutaway leaves its old place
    const s = c.start;
    const e = clipEnd(c);
    if (!affected.has(c.trackId) || e <= from + EPS || s >= to - EPS) {
      clips.push(c);
      continue;
    }
    if (c.groupId)
      return {
        ok: false,
        error: `O clipe ${c.id} (${clock(s)}–${clock(e)}) está num grupo e seria cortado: desagrupe antes. Nada foi feito.`,
      };
    if (s < from - EPS) clips.push(piece(c, s, from));
    if (e > to + EPS) {
      const rest = piece(c, to, e);
      clips.push(rest);
      if (c.trackId === trackId) after = rest;
    }
    if (s < from - EPS || e > to + EPS) trimmed++;
    else removed++;
  }
  const cutaway: Clip = {
    ...cut,
    trackId,
    ...(transition ? { transition } : {}),
  };
  if (!transition) delete cutaway.transition;
  if (after && transition) {
    const i = clips.indexOf(after);
    clips[i] = { ...after, transition };
  }
  const hit = overlaps(clips, cutaway, new Set());
  if (hit)
    return {
      ok: false,
      error: `Sobrou o clipe ${hit.id} no lugar. Nada foi feito.`,
    };
  clips.push(cutaway);
  return { ok: true, clips, cutaway, trimmed, removed };
}

/** A new clip of `asset` at `start` (the whole media, or `duration` seconds of it). */
export function clipOf(asset: Asset, trackId: string, start: number, duration?: number): Clip {
  const length = asset.kind === "image" || asset.duration <= 0 ? (duration ?? 5) : asset.duration;
  return {
    id: newId("c"),
    assetId: asset.id,
    trackId,
    start,
    in: 0,
    duration: Math.min(duration ?? length, length),
    volume: 1,
  };
}

export interface SpreadOptions {
  start: number;
  end: number;
  /** Seconds each copy overlaps the next (the next one comes in while this one fades out). */
  overlap: number;
  /** Fade in and out of each copy, seconds. */
  fade: number;
  volume: number;
}

/**
 * spread_music: copies of a music from `start` to `end`, each one starting `overlap` seconds before
 * the previous one ends, alternating between two tracks so they can overlap, with a fade in and out
 * on each; the last copy is cut at `end` and fades out there.
 */
export function spreadMusic(
  asset: Asset,
  trackIds: readonly [string, string],
  o: SpreadOptions,
): { ok: true; clips: Clip[] } | Refusal {
  if (asset.duration <= 0 || !asset.hasAudio)
    return { ok: false, error: `${asset.name} não tem som para usar como música. Nada foi feito.` };
  if (o.end - o.start < 1)
    return { ok: false, error: "O trecho tem menos de 1 s. Nada foi feito." };
  const step = asset.duration - o.overlap;
  if (step < 1)
    return {
      ok: false,
      error: `A sobreposição (${o.overlap} s) é maior que a música (${asset.duration.toFixed(1)} s). Nada foi feito.`,
    };
  const clips: Clip[] = [];
  for (let k = 0, t = o.start; t < o.end - 0.5; k++, t += step) {
    const duration = Math.min(asset.duration, o.end - t);
    clips.push({
      id: newId("c"),
      assetId: asset.id,
      trackId: trackIds[k % 2],
      start: t,
      in: 0,
      duration,
      volume: o.volume,
      fadeIn: k === 0 ? Math.min(o.fade, 1) : o.fade,
      fadeOut: o.fade,
    });
  }
  return { ok: true, clips };
}

/** Two empty sound tracks marked as music, for spread_music. */
export function musicTracks(tracks: readonly Track[]): [Track, Track] {
  const name = (base: string): string => {
    let n = base;
    for (let i = 2; tracks.some((t) => t.name === n); i++) n = `${base} ${i}`;
    return n;
  };
  const a: Track = {
    id: newId("t"),
    kind: "audio",
    name: name("Música"),
    muted: false,
    hidden: false,
    locked: false,
    music: true,
  };
  const b: Track = {
    id: newId("t"),
    kind: "audio",
    name: name(`${a.name} (b)`),
    muted: false,
    hidden: false,
    locked: false,
    music: true,
  };
  return [a, b];
}
