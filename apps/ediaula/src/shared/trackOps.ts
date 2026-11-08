import { newId } from "./clipTime.ts";
import { withoutClickSound } from "./soundPlacement.ts";
import { moveTrack, newTrackName } from "./timeline.ts";
import type { Project, Track } from "./types.ts";

/**
 * Tracks as the AI tools change them (add_track, move_track, rename_track, remove_track,
 * set_track), the way the timeline does: the list is drawn top first (index 0 is in front), the
 * labels F1…Fn count from the bottom and follow the order by themselves, every track takes every
 * kind of clip (so audio and video tracks can be in any order), a locked track does not move, and
 * no clip changes.
 */

export type TrackResult =
  | { ok: true; project: Project; track: Track; index: number }
  | { ok: false; error: string };

const fail = (error: string): TrackResult => ({ ok: false, error });

function trackOf(p: Project, id: string): Track | undefined {
  return p.tracks.find((t) => t.id === id);
}

const missing = (id: string): TrackResult =>
  fail(`Faixa não encontrada: ${id}. Nada foi feito. Use os ids de get_overview.`);

/** A new empty track right above or below `refId`, of its kind unless `kind` says otherwise. */
export function addTrackBeside(
  p: Project,
  refId: string,
  position: "above" | "below",
  kind?: Track["kind"],
  label?: string,
): TrackResult {
  const ref = trackOf(p, refId);
  if (!ref) return missing(refId);
  const name = label?.trim() || newTrackName(p.tracks);
  const track: Track = {
    id: newId("t"),
    kind: kind ?? ref.kind,
    name,
    muted: false,
    hidden: false,
    locked: false,
  };
  const at = p.tracks.indexOf(ref) + (position === "below" ? 1 : 0);
  const tracks = [...p.tracks.slice(0, at), track, ...p.tracks.slice(at)];
  return { ok: true, project: { ...p, tracks }, track, index: at };
}

/** `id` moved right above or below `refId` (a locked track stays where it is, as in the editor). */
export function moveTrackBeside(
  p: Project,
  id: string,
  position: "above" | "below",
  refId: string,
): TrackResult {
  const track = trackOf(p, id);
  if (!track) return missing(id);
  if (!trackOf(p, refId)) return missing(refId);
  if (id === refId) return fail("A faixa e a referência são a mesma. Nada foi feito.");
  if (track.locked)
    return fail(
      `A faixa ${track.name} está travada e não muda de lugar. Nada foi feito: peça para a pessoa destravar.`,
    );
  const rest = p.tracks.filter((t) => t.id !== id);
  const target = rest.findIndex((t) => t.id === refId) + (position === "below" ? 1 : 0);
  const tracks = moveTrack(p.tracks, id, target);
  return { ok: true, project: { ...p, tracks }, track, index: tracks.indexOf(track) };
}

export function renameTrack(p: Project, id: string, label: string): TrackResult {
  const track = trackOf(p, id);
  if (!track) return missing(id);
  const name = label.trim();
  if (!name) return fail("O nome da faixa não pode ficar vazio. Nada foi feito.");
  const renamed = { ...track, name };
  return {
    ok: true,
    project: { ...p, tracks: p.tracks.map((t) => (t.id === id ? renamed : t)) },
    track: renamed,
    index: p.tracks.indexOf(track),
  };
}

/** Removes an empty track; one with clips is refused, saying how many. */
export function removeEmptyTrack(p: Project, id: string): TrackResult {
  const track = trackOf(p, id);
  if (!track) return missing(id);
  const count = p.clips.filter((c) => c.trackId === id).length;
  if (count)
    return fail(
      `A faixa ${track.name} tem ${count === 1 ? "1 clipe" : `${count} clipes`}: só uma faixa vazia é removida. Nada foi feito.`,
    );
  if (track.locked)
    return fail(
      `A faixa ${track.name} está travada. Nada foi feito: peça para a pessoa destravar.`,
    );
  return {
    ok: true,
    // The track "Cliques" goes with the clicks it shows: the click sound is turned off.
    project: track.clicks
      ? withoutClickSound(p)
      : { ...p, tracks: p.tracks.filter((t) => t.id !== id) },
    track,
    index: p.tracks.indexOf(track),
  };
}

/** Locks, mutes or hides a track (and the reverse). */
export function setTrackFlags(
  p: Project,
  id: string,
  flags: Partial<Pick<Track, "locked" | "muted" | "hidden">>,
): TrackResult {
  const track = trackOf(p, id);
  if (!track) return missing(id);
  const changed = { ...track, ...flags };
  return {
    ok: true,
    project: { ...p, tracks: p.tracks.map((t) => (t.id === id ? changed : t)) },
    track: changed,
    index: p.tracks.indexOf(track),
  };
}
