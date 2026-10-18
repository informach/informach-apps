import { clipEnd, newId, sourceRoom } from "./clipTime.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";

/**
 * Groups of clips (Ctrl+G): clips that share a `groupId` are picked, moved, trimmed, copied and
 * removed together, like a template's layers or a video and the sound taken out of it. A group
 * lives only in its clips: a group of one is no group, and pieces of a grouped clip stay in it.
 */

const EPS = 1e-6;

/** `ids` with every other clip of their groups. */
export function withGroups(clips: readonly Clip[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const groups = new Set<string>();
  for (const c of clips) if (wanted.has(c.id) && c.groupId) groups.add(c.groupId);
  if (!groups.size) return [...wanted];
  for (const c of clips) if (c.groupId && groups.has(c.groupId)) wanted.add(c.id);
  return [...wanted];
}

/** Whether the clips form one group already (all of them in the same one). */
export function isOneGroup(clips: readonly Clip[], ids: readonly string[]): boolean {
  const picked = clips.filter((c) => ids.includes(c.id));
  const first = picked[0]?.groupId;
  return picked.length > 1 && !!first && picked.every((c) => c.groupId === first);
}

/**
 * The clips `ids` in one new group (the groups they were in are taken in whole). Fewer than two
 * clips make no group: the clips come back unchanged.
 */
export function groupClips(clips: Clip[], ids: Iterable<string>, groupId = newId("g")): Clip[] {
  const members = new Set(withGroups(clips, ids));
  if (members.size < 2) return clips;
  return clips.map((c) => (members.has(c.id) ? { ...c, groupId } : c));
}

/** The groups of the clips `ids` undone: each clip is on its own again. */
export function ungroupClips(clips: Clip[], ids: Iterable<string>): Clip[] {
  const wanted = new Set(ids);
  const groups = new Set(clips.filter((c) => wanted.has(c.id) && c.groupId).map((c) => c.groupId));
  if (!groups.size) return clips;
  return clips.map((c) => {
    if (!c.groupId || !groups.has(c.groupId)) return c;
    const { groupId: _gone, ...rest } = c;
    return rest;
  });
}

/** Groups left with a single clip (the others were removed) are dissolved. */
export function pruneGroups(clips: Clip[]): Clip[] {
  const count = new Map<string, number>();
  for (const c of clips) if (c.groupId) count.set(c.groupId, (count.get(c.groupId) ?? 0) + 1);
  if (![...count.values()].some((n) => n < 2)) return clips;
  return clips.map((c) => {
    if (!c.groupId || (count.get(c.groupId) ?? 0) >= 2) return c;
    const { groupId: _alone, ...rest } = c;
    return rest;
  });
}

/** Copies of grouped clips go into groups of their own (a paste never joins the original one). */
export function regroupCopies(copies: Clip[]): Clip[] {
  const fresh = new Map<string, string>();
  return copies.map((c) => {
    if (!c.groupId) return c;
    let id = fresh.get(c.groupId);
    if (!id) {
      id = newId("g");
      fresh.set(c.groupId, id);
    }
    return { ...c, groupId: id };
  });
}

/** Shortest clip a trim leaves (timeline.ts MIN_CLIP; not imported, timeline.ts imports this). */
const MIN_CLIP = 1 / 30;

/**
 * Where the `edge` of `c` may go: not over the clips beside it on its track (other than the
 * ones moving with it) and not past the ends of its media.
 */
function edgeRange(
  c: Clip,
  edge: "start" | "end",
  clips: readonly Clip[],
  moving: ReadonlySet<string>,
  asset: Asset | undefined,
): [number, number] {
  const speed = c.speed ?? 1;
  // The ends of the media, or a take's pause beside the clip.
  const [first, length] = sourceRoom(c, asset);
  const others = clips.filter((x) => x.trackId === c.trackId && !moving.has(x.id));
  if (edge === "end") {
    const next = Math.min(
      Number.POSITIVE_INFINITY,
      ...others.filter((x) => x.start >= clipEnd(c) - EPS).map((x) => x.start),
    );
    return [c.start + MIN_CLIP, Math.min(next, c.start + (length - c.in) / speed)];
  }
  const prev = Math.max(0, ...others.filter((x) => clipEnd(x) <= c.start + EPS).map(clipEnd));
  return [Math.max(prev, c.start - (c.in - first) / speed), clipEnd(c) - MIN_CLIP];
}

/**
 * A trim of one clip of a group carried to the others: every member whose same edge was at the
 * same moment moves that edge to the same new place, so a video and its sound, or a template's
 * layers, keep ending together. Members on locked tracks stay as they are, and the edge goes
 * only as far as every member can go (no member covers its neighbours or runs out of media).
 */
export function trimGroup(
  clips: Clip[],
  before: Clip,
  after: Clip,
  edge: "start" | "end",
  trim: (c: Clip, edge: "start" | "end", time: number, asset: Asset | undefined) => Clip,
  assets: ReadonlyMap<string, Asset>,
  frame: number,
  locked: ReadonlySet<string> = new Set(),
): Clip[] {
  if (!before.groupId) return clips.map((c) => (c.id === after.id ? after : c));
  const at = edge === "start" ? before.start : clipEnd(before);
  const members = clips.filter(
    (c) =>
      c.id !== before.id &&
      c.groupId === before.groupId &&
      !locked.has(c.trackId) &&
      Math.abs((edge === "start" ? c.start : clipEnd(c)) - at) <= frame / 2 + EPS,
  );
  const moving = new Set([before.id, ...members.map((c) => c.id)]);
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (const c of [before, ...members]) {
    const [a, b] = edgeRange(c, edge, clips, moving, assets.get(c.assetId));
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
  }
  const wanted = edge === "start" ? after.start : clipEnd(after);
  const to = lo > hi ? at : Math.min(hi, Math.max(lo, wanted));
  const ids = new Set(members.map((c) => c.id));
  return clips.map((c) => {
    if (c.id === before.id)
      return Math.abs(to - wanted) <= EPS ? after : trim(before, edge, to, assets.get(c.assetId));
    return ids.has(c.id) ? trim(c, edge, to, assets.get(c.assetId)) : c;
  });
}

/**
 * Separar áudio: the sound of a video clip becomes a clip of its own on a sound track (the
 * first free one from the bottom, or a new one), in the same group as the video, which goes
 * silent. Moving or trimming one edge of either alone makes the J and L cuts. Null when the
 * clip has no sound to take out or its track is locked.
 */
/** Why the sound of a clip cannot be separated, or null when it can. */
export function detachProblem(
  p: Pick<Project, "clips" | "tracks" | "assets">,
  clipId: string,
): string | null {
  const c = p.clips.find((x) => x.id === clipId);
  const asset = c && p.assets.find((a) => a.id === c.assetId);
  const own = c && p.tracks.find((t) => t.id === c.trackId);
  if (!c || !asset || !own) return "Selecione um clipe de vídeo para separar o som.";
  if (own.locked) return "A faixa deste clipe está travada: destrave para separar o som.";
  if (asset.kind !== "video") return "Só um clipe de vídeo tem som para separar.";
  if (!asset.hasAudio) return "Este vídeo não tem som.";
  if (c.volume <= 0 || c.mutedFor)
    return "Este clipe está mudo: o som já não toca nele, não há o que separar.";
  return null;
}

export function detachAudio(
  p: Pick<Project, "clips" | "tracks" | "assets">,
  clipId: string,
): { clips: Clip[]; tracks: Track[]; audioId: string } | null {
  const c = p.clips.find((x) => x.id === clipId);
  if (!c || detachProblem(p, clipId)) return null;
  const end = clipEnd(c);
  const free = (t: Track): boolean =>
    !t.locked &&
    t.kind === "audio" &&
    !t.music &&
    !p.clips.some((x) => x.trackId === t.id && x.start < end - EPS && clipEnd(x) > c.start + EPS);
  let tracks = p.tracks;
  let track = [...p.tracks].reverse().find(free);
  if (!track) {
    let n = p.tracks.length + 1;
    while (p.tracks.some((t) => t.name === `Faixa ${n}`)) n++;
    track = {
      id: newId("t"),
      kind: "audio",
      name: `Faixa ${n}`,
      muted: false,
      hidden: false,
      locked: false,
    };
    tracks = [...p.tracks, track];
  }
  const groupId = c.groupId ?? newId("g");
  const audioId = newId("c");
  const sound: Clip = {
    id: audioId,
    assetId: c.assetId,
    trackId: track.id,
    start: c.start,
    in: c.in,
    duration: c.duration,
    volume: c.volume,
    groupId,
    ...(c.speed !== undefined ? { speed: c.speed } : {}),
    ...(c.denoise ? { denoise: true } : {}),
    ...(c.gain?.length ? { gain: c.gain } : {}),
    ...(c.fadeIn ? { fadeIn: c.fadeIn } : {}),
    ...(c.fadeOut ? { fadeOut: c.fadeOut } : {}),
  };
  const { denoise: _d, gain: _g, ...silent } = c;
  return {
    clips: [...p.clips.map((x) => (x.id === c.id ? { ...silent, volume: 0, groupId } : x)), sound],
    tracks,
    audioId,
  };
}
