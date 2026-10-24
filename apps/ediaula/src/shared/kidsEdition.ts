import { applyCuts } from "./cleanup.ts";
import { clipEnd, newId, sourceEnd, timelineAt } from "./clipTime.ts";
import { presenterTransform } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { PRESENTER_TRACK } from "./recordingImport.ts";
import { insertClips } from "./ripple.ts";
import type { Substitution } from "./script.ts";
import { heldClips } from "./speechSwap.ts";
import type { Asset, Clip, KidsPiece, Project, Track } from "./types.ts";
import { voiceClips } from "./voiceMaster.ts";

/**
 * The kids edition of a lesson. The script's kids table ("Substituições na edição kids") names
 * lines the teacher says that, in the kids edition, a character says instead: the character's
 * video (one per character, every line of theirs one after another) is transcribed, each line is
 * found in it and in the lesson's voice, and the export of the kids edition cuts the teacher's
 * line on every track and puts the character's stretch there, with its own sound, where the
 * presenter was. The adult edition is the lesson as it is: one edit, two exports.
 */

/** A word of a transcript, in its media's seconds. */
export interface SourceWord {
  text: string;
  start: number;
  end: number;
}

/** A word as compared: lower case, no accents, letters and digits only. */
const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

const tokens = (s: string): string[] => s.split(/\s+/).map(fold).filter(Boolean);

/** The words of the anchors looked at on each side. */
const ANCHOR_WORDS = 6;

export interface PhraseMatch {
  start: number;
  end: number;
  /** Anchor words that matched around it, out of those compared. */
  anchors: number;
}

/**
 * Where `phrase` is said in `words`: every place its words are said in a row, the one whose
 * neighbours match the anchors best (the last words of `before`, the first of `after`), and among
 * equals the `occurrence`-th. Null when it is not said.
 */
export function findPhrase(
  words: readonly SourceWord[],
  phrase: string,
  opts: { before?: string; after?: string; occurrence?: number } = {},
): PhraseMatch | null {
  const said = words.map((w) => ({ ...w, key: fold(w.text) })).filter((w) => w.key);
  const wanted = tokens(phrase);
  if (!wanted.length) return null;
  const before = tokens(opts.before ?? "").slice(-ANCHOR_WORDS);
  const after = tokens(opts.after ?? "").slice(0, ANCHOR_WORDS);
  const found: PhraseMatch[] = [];
  for (let i = 0; i + wanted.length <= said.length; i++) {
    if (!wanted.every((key, k) => said[i + k].key === key)) continue;
    let anchors = 0;
    for (let k = 1; k <= before.length; k++)
      if (said[i - k]?.key === before[before.length - k]) anchors++;
    const last = i + wanted.length - 1;
    for (let k = 0; k < after.length; k++) if (said[last + 1 + k]?.key === after[k]) anchors++;
    found.push({ start: said[i].start, end: said[last].end, anchors });
  }
  if (!found.length) return null;
  const best = Math.max(...found.map((f) => f.anchors));
  const top = found.filter((f) => f.anchors === best);
  return top[Math.min(top.length, Math.max(1, opts.occurrence ?? 1)) - 1];
}

/** Silence kept around a character's line, at most half the gap to the next word. */
const PAD = 0.15;

/** The character's stretch: the line's words with a little air, never into the next line. */
function padded(words: readonly SourceWord[], m: PhraseMatch, duration: number): [number, number] {
  const prev = [...words].reverse().find((w) => w.end <= m.start + 1e-6);
  const next = words.find((w) => w.start >= m.end - 1e-6);
  const from = Math.max(0, prev ? Math.max(prev.end, m.start - PAD) : m.start - PAD);
  const to = Math.min(duration, next ? Math.min(next.start, m.end + PAD) : m.end + PAD);
  return [from, to];
}

export interface KidsLocate {
  pieces: KidsPiece[];
  /** The lines that could not be placed, each with why. */
  problems: { id: string; why: string }[];
}

/**
 * Each line of the kids table found in the characters' videos and in the lesson's voice:
 * `voices` and `videos` are the transcripts of the voice media and of the characters' videos, by
 * media id. A video whose name has the character's name is looked at first.
 */
export function locateKids(
  substitutions: readonly Substitution[],
  voices: ReadonlyMap<string, readonly SourceWord[]>,
  videos: ReadonlyMap<string, { name: string; duration: number; words: readonly SourceWord[] }>,
): KidsLocate {
  const pieces: KidsPiece[] = [];
  const problems: KidsLocate["problems"] = [];
  for (const s of substitutions) {
    let voice: KidsPiece["voice"] | null = null;
    let anchors = -1;
    for (const [assetId, words] of voices) {
      const m = findPhrase(words, s.text, {
        before: s.before,
        after: s.after,
        occurrence: s.occurrence,
      });
      if (m && m.anchors > anchors) {
        voice = { assetId, from: m.start, to: m.end };
        anchors = m.anchors;
      }
    }
    if (!voice) {
      problems.push({ id: s.id, why: "a fala não foi achada na voz da aula" });
      continue;
    }
    const named = fold(s.character);
    const order = [...videos].sort(
      ([, a], [, b]) => Number(fold(b.name).includes(named)) - Number(fold(a.name).includes(named)),
    );
    let piece: KidsPiece | null = null;
    for (const [assetId, video] of order) {
      const m = findPhrase(video.words, s.text);
      if (!m) continue;
      const [from, to] = padded(video.words, m, video.duration);
      piece = { id: s.id, character: s.character, assetId, in: from, out: to, voice };
      break;
    }
    if (piece) pieces.push(piece);
    else problems.push({ id: s.id, why: `a fala não foi achada no vídeo de ${s.character}` });
  }
  return { pieces, problems };
}

type Lesson = Pick<Project, "tracks" | "clips" | "assets" | "settings">;

/** Where a piece's teacher line is on the timeline now, or null when it was cut away. */
export function kidsSpan(p: Pick<Project, "clips">, piece: KidsPiece): [number, number] | null {
  for (const c of p.clips) {
    if (c.assetId !== piece.voice.assetId) continue;
    if (piece.voice.from < c.in - 1e-3 || piece.voice.to > sourceEnd(c) + 1e-3) continue;
    return [timelineAt(c, piece.voice.from), timelineAt(c, piece.voice.to)];
  }
  return null;
}

/** The presenter's clips: videos marked as the presenter. */
const presenterAt = (p: Lesson, t: number): Clip | undefined => {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  return p.clips.find((c) => {
    const a = assets.get(c.assetId);
    return a?.kind === "video" && a.origin === "presenter" && c.start <= t + 1e-3 && clipEnd(c) > t;
  });
};

/**
 * The lesson as the kids edition: each piece whose teacher line is still on the timeline replaces
 * it on every track (latest first, so the earlier times hold), the character's stretch with its
 * own sound where the presenter was, the screen holding the frame before it (`stills`: for each
 * piece, the still of each held clip, as speechSwap.ts heldClips lists them). Returns the lesson
 * and the pieces left out (their line was cut, or their video is gone).
 */
export function kidsEdition(
  project: Lesson,
  targets: ReadonlySet<string>,
  pieces: readonly KidsPiece[],
  stills: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(),
): { tracks: Track[]; clips: Clip[]; skipped: string[] } {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const skipped: string[] = [];
  const placed = pieces
    .map((piece) => ({ piece, span: kidsSpan(project, piece) }))
    .filter((x): x is { piece: KidsPiece; span: [number, number] } => {
      const ok = !!x.span && assets.get(x.piece.assetId)?.kind === "video";
      if (!ok) skipped.push(x.piece.id);
      return ok;
    })
    .sort((a, b) => b.span[0] - a.span[0]);
  let p: Lesson = project;
  for (const { piece, span } of placed) {
    const [a, b] = span;
    const video = assets.get(piece.assetId) as Asset;
    const length = Math.max(1 / 30, piece.out - piece.in);
    let tracks = p.tracks;
    const teacher = presenterAt(p, a);
    let track = teacher ? tracks.find((t) => t.id === teacher.trackId) : undefined;
    if (!track) {
      track = {
        id: newId("t"),
        kind: "video",
        name: PRESENTER_TRACK,
        muted: false,
        hidden: false,
        locked: false,
      };
      tracks = [track, ...tracks];
    }
    const transform = teacher
      ? transformAt(teacher, Math.max(teacher.start, Math.min(a, clipEnd(teacher) - 1e-6)))
      : presenterTransform(video, p.settings);
    const inserted: Clip[] = [
      {
        id: newId("c"),
        assetId: video.id,
        trackId: track.id,
        start: a,
        in: piece.in,
        duration: length,
        volume: 1,
        ...(transform ? { transform } : {}),
      },
    ];
    const own = stills.get(piece.id);
    for (const c of heldClips(p, targets, a)) {
      const still = own?.get(c.trackId);
      if (still)
        inserted.push({
          id: newId("c"),
          assetId: still,
          trackId: c.trackId,
          start: a,
          in: 0,
          duration: length,
          volume: 0,
          transform: transformAt(c, Math.min(a, clipEnd(c))),
        });
    }
    // The teacher's line leaves every track, the voice and the presenter's included.
    const all = new Set([...targets, track.id, ...voiceClips(p).map((c) => c.trackId)]);
    for (const id of locked) all.delete(id);
    const cut = applyCuts(p.clips, [[a, b]], all, locked);
    p = { ...p, tracks, clips: insertClips({ ...p, tracks, clips: cut }, all, inserted, a) };
  }
  return { tracks: p.tracks, clips: p.clips, skipped };
}
