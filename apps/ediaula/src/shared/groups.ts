import { clipEnd, newId } from "./clipTime.ts";
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

/**
 * A trim of one clip of a group carried to the others: every member whose same edge was at the
 * same moment moves that edge to the same new place (as far as its own media allows), so a
 * video and its sound, or a template's layers, keep ending together.
 */
export function trimGroup(
  clips: Clip[],
  before: Clip,
  after: Clip,
  edge: "start" | "end",
  trim: (c: Clip, edge: "start" | "end", time: number, asset: Asset | undefined) => Clip,
  assets: ReadonlyMap<string, Asset>,
  frame: number,
): Clip[] {
  if (!before.groupId) return clips.map((c) => (c.id === after.id ? after : c));
  const at = edge === "start" ? before.start : clipEnd(before);
  const to = edge === "start" ? after.start : clipEnd(after);
  return clips.map((c) => {
    if (c.id === after.id) return after;
    if (c.groupId !== before.groupId) return c;
    const own = edge === "start" ? c.start : clipEnd(c);
    if (Math.abs(own - at) > frame / 2 + EPS) return c;
    return trim(c, edge, to, assets.get(c.assetId));
  });
}

/**
 * Separar áudio: the sound of a video clip becomes a clip of its own on a sound track (the
 * first free one from the bottom, or a new one), in the same group as the video, which goes
 * silent. Moving or trimming one edge of either alone makes the J and L cuts. Null when the
 * clip has no sound to take out or its track is locked.
 */
export function detachAudio(
  p: Pick<Project, "clips" | "tracks" | "assets">,
  clipId: string,
): { clips: Clip[]; tracks: Track[]; audioId: string } | null {
  const c = p.clips.find((x) => x.id === clipId);
  const asset = c && p.assets.find((a) => a.id === c.assetId);
  const own = c && p.tracks.find((t) => t.id === c.trackId);
  if (!c || !asset || !own || own.locked) return null;
  if (asset.kind !== "video" || !asset.hasAudio || c.volume <= 0 || c.mutedFor) return null;
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
