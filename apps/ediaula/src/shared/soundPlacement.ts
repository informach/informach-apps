import { clipEnd, newId } from "./clipTime.ts";
import { isSfxTrack, SOUND_TRACK } from "./sfxTrack.ts";
import { MIN_CLIP, makeClip } from "./timeline.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";

/**
 * Putting one clip in the lesson at a given time without ripple (add_clip, add_sound_effects,
 * import_media with \`at\`): it never covers nor pushes another clip. When the place is taken on
 * the track asked, it goes to another track of the same kind that is free there, or to a new one.
 */

const EPS = 1e-6;

export type Placement =
  | { ok: true; project: Project; clipId: string; trackId: string; note: string }
  | { ok: false; error: string };

export interface PlaceOptions {
  /** The track asked for; without it, sound goes to "Efeitos sonoros" and pictures on top. */
  trackId?: string;
  /** Source seconds to play (default: the whole media). */
  in?: number;
  out?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * Whether a clip can go on `trackId` at exactly [start, end]: nothing there, and the track is not
 * magnetic (a magnetic track packs its clips from 0:00 at every commit, so the clip would not stay
 * at the time asked).
 */
const free = (
  p: Pick<Project, "clips" | "tracks">,
  trackId: string,
  start: number,
  end: number,
): boolean =>
  !p.tracks.find((t) => t.id === trackId)?.magnetic &&
  !p.clips.some((c) => c.trackId === trackId && c.start < end - EPS && clipEnd(c) > start + EPS);

/** The first name of `base`, `base 2`, `base 3`… not used by a track yet. */
function freeName(p: Pick<Project, "tracks">, base: string): string {
  const names = new Set(p.tracks.map((t) => t.name));
  let name = base;
  for (let k = 2; names.has(name); k++) name = `${base} ${k}`;
  return name;
}

const newTrack = (kind: Track["kind"], name: string, extra: Partial<Track> = {}): Track => ({
  id: newId("t"),
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});

/** `asset` (a media of the lesson) placed at timeline second `at` without ripple. */
export function placeWithoutRipple(
  p: Project,
  asset: Asset,
  at: number,
  options: PlaceOptions = {},
): Placement {
  if (asset.missing)
    return { ok: false, error: `O arquivo de ${asset.name} não foi encontrado. Nada foi feito.` };
  const base = makeClip(asset, "", Math.max(0, at), p.settings);
  const sourceIn = Math.max(0, options.in ?? base.in);
  const room =
    asset.kind === "image"
      ? base.duration
      : Math.max(0, (asset.duration || base.duration) - sourceIn);
  const length = options.out !== undefined ? options.out - sourceIn : Math.min(base.duration, room);
  if (!(length >= MIN_CLIP))
    return {
      ok: false,
      error: "O trecho pedido é vazio (out precisa ser maior que in). Nada foi feito.",
    };
  const clip: Clip = {
    ...base,
    in: asset.kind === "image" ? base.in : sourceIn,
    duration: length,
    ...(options.volume !== undefined ? { volume: options.volume } : {}),
    ...(options.fadeIn ? { fadeIn: options.fadeIn } : {}),
    ...(options.fadeOut ? { fadeOut: options.fadeOut } : {}),
  };
  const start = clip.start;
  const end = start + clip.duration;
  const kind: Track["kind"] = asset.kind === "audio" ? "audio" : "video";
  let tracks = p.tracks;
  let target: Track | undefined;
  let note = "";
  if (options.trackId) {
    const asked = p.tracks.find((t) => t.id === options.trackId);
    if (!asked)
      return {
        ok: false,
        error: `Faixa não encontrada: ${options.trackId}. Nada foi feito. Use os ids de get_overview.`,
      };
    if (asked.locked)
      return {
        ok: false,
        error: `A faixa ${asked.name} está travada: nada foi feito. Peça para a pessoa destravar a faixa.`,
      };
    if (free(p, asked.id, start, end)) target = asked;
    else {
      // Another free track of the same kind, the sound effects' ones first for a sound effect.
      target = p.tracks.find(
        (t) => t.kind === asked.kind && !t.locked && !t.clicks && free(p, t.id, start, end),
      );
      if (!target) {
        target = newTrack(
          asked.kind,
          freeName(p, asked.name),
          isSfxTrack(asked) ? { sfx: true } : {},
        );
        const i = p.tracks.indexOf(asked);
        tracks = [...p.tracks.slice(0, i + 1), target, ...p.tracks.slice(i + 1)];
      }
      note = asked.magnetic
        ? ` A faixa ${asked.name} é magnética (juntaria o clipe aos outros, fora do tempo pedido), por isso ele foi para a faixa ${target.name}.`
        : ` A faixa ${asked.name} estava ocupada nesse tempo, por isso ele foi para a faixa ${target.name}.`;
    }
  } else if (kind === "audio") {
    target = p.tracks.find(
      (t) => t.kind === "audio" && isSfxTrack(t) && !t.locked && free(p, t.id, start, end),
    );
    if (!target) {
      target = newTrack("audio", freeName(p, SOUND_TRACK), { sfx: true });
      tracks = [...p.tracks, target];
    }
  } else {
    // A picture goes on a new track on top, in front of the lesson.
    target = newTrack("video", freeName(p, "Faixa"));
    tracks = [target, ...p.tracks];
  }
  const placed = { ...clip, trackId: target.id };
  return {
    ok: true,
    project: { ...p, tracks, clips: [...p.clips, placed] },
    clipId: placed.id,
    trackId: target.id,
    note,
  };
}

/** Above this volume a sound effect over speech is lowered to it. */
export const SPEECH_SAFE_VOLUME = 0.3;
/** A sound effect may cover speech this long (seconds) before it is lowered. */
export const SPEECH_OVERLAP = 0.3;

/** Seconds of [start, end) that fall in `speech` (merged timeline ranges). */
export function speechOverlap(
  speech: readonly [number, number][],
  start: number,
  end: number,
): number {
  let total = 0;
  for (const [a, b] of speech) total += Math.max(0, Math.min(b, end) - Math.max(a, start));
  return total;
}

/**
 * The volume a sound effect plays at so it never covers speech for more than SPEECH_OVERLAP at a
 * volume above SPEECH_SAFE_VOLUME, and whether it had to be lowered.
 */
export function safeOverSpeech(
  speech: readonly [number, number][],
  start: number,
  end: number,
  volume: number,
): { volume: number; lowered: boolean } {
  if (volume <= SPEECH_SAFE_VOLUME || speechOverlap(speech, start, end) <= SPEECH_OVERLAP)
    return { volume, lowered: false };
  return { volume: SPEECH_SAFE_VOLUME, lowered: true };
}

/** The lesson with the track "Cliques" (shared/clickEvents.ts), added at the bottom when missing. */
export function withClicksTrack(p: Project): Project {
  if (p.tracks.some((t) => t.clicks)) return p;
  return {
    ...p,
    tracks: [...p.tracks, newTrack("audio", freeName(p, "Cliques"), { clicks: true })],
  };
}

/** More than this many sound effects starting within CROWD_WINDOW seconds is a crowd. */
export const CROWD_COUNT = 3;
export const CROWD_WINDOW = 2;

/**
 * Stretches where the sound effects (clips on the sound effect tracks; the automatic clicks are
 * not counted) are crowded: more than CROWD_COUNT starting within CROWD_WINDOW seconds.
 */
export function crowdedEffects(
  p: Pick<Project, "clips" | "tracks">,
): { start: number; count: number }[] {
  const sfx = new Set(p.tracks.filter((t) => isSfxTrack(t)).map((t) => t.id));
  const starts = p.clips
    .filter((c) => sfx.has(c.trackId))
    .map((c) => c.start)
    .sort((a, b) => a - b);
  const out: { start: number; count: number }[] = [];
  let i = 0;
  while (i < starts.length) {
    let j = i;
    while (j + 1 < starts.length && starts[j + 1] - starts[i] <= CROWD_WINDOW + EPS) j++;
    const count = j - i + 1;
    if (count > CROWD_COUNT) {
      out.push({ start: starts[i], count });
      i = j + 1;
    } else i++;
  }
  return out;
}

export type SoundPlacement =
  | { ok: true; project: Project; clipId: string; trackId: string; note: string; lowered: boolean }
  | { ok: false; error: string };

/**
 * placeWithoutRipple, then, for a sound effect (`effect`, or a clip that landed on a sound effect
 * track), the rule of the voice: it never covers `speech` for more than SPEECH_OVERLAP at a volume
 * above SPEECH_SAFE_VOLUME; it is lowered to it and `lowered` says so.
 */
export function placeOverSpeech(
  p: Project,
  asset: Asset,
  at: number,
  options: PlaceOptions,
  speech: readonly [number, number][],
  effect = false,
): SoundPlacement {
  const r = placeWithoutRipple(p, asset, at, options);
  if (!r.ok) return r;
  const track = r.project.tracks.find((t) => t.id === r.trackId);
  const clip = r.project.clips.find((c) => c.id === r.clipId);
  if (!clip || asset.kind !== "audio" || !(effect || (track && isSfxTrack(track))))
    return { ...r, lowered: false };
  const safe = safeOverSpeech(speech, clip.start, clipEnd(clip), clip.volume);
  if (!safe.lowered) return { ...r, lowered: false };
  return {
    ...r,
    lowered: true,
    project: {
      ...r.project,
      clips: r.project.clips.map((c) => (c.id === clip.id ? { ...c, volume: safe.volume } : c)),
    },
  };
}
