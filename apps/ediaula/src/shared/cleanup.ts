import { clipEnd, overwriteRange, sourceAt, sourceEnd, timelineAt } from "./timeline.ts";
import type { Asset, Clip, Project, Transcript } from "./types.ts";

/**
 * Who speaks: the teacher (the narration and the microphone), an avatar (a render with the
 * background removed, its extracted voice or a script insert) or something else (the computer's
 * own sound, a music bed). The avatar's lines are acted: never cleaned as hesitations.
 */
export type SpeakerRole = "teacher" | "avatar" | "other";

/** A transcribed word placed on the timeline. */
export interface TimelineWord {
  /** Stable key: asset + index in that asset's transcript. */
  key: string;
  clipId: string;
  text: string;
  start: number;
  end: number;
  p: number;
  /** Media it was said in (asset id); absent counts as one source. Repeats are looked for within one. */
  source?: string;
  /** Absent counts as the teacher. */
  role?: SpeakerRole;
}

export type IssueKind = "filler" | "silence" | "repeat";

export interface Issue {
  id: string;
  kind: IssueKind;
  /** Timeline range to remove. */
  start: number;
  end: number;
  /** Keys of the words involved (empty for silences). */
  words: string[];
}

export interface CleanupOptions {
  /** Silences at least this long (seconds) are shortened. */
  minSilence: number;
  /** Pause left in place of a removed silence (seconds). */
  keepPause: number;
  /**
   * Timeline stretches where something happens on screen (activity.ts): a pause is only cut
   * around them, and the same words said before and after one are a demonstration.
   */
  activity?: readonly { start: number; end: number }[];
  /** Phrases repeated on purpose, as said ("muito, muito"); DEFAULT_INTENTIONAL when absent. */
  intentional?: readonly string[];
}

export const DEFAULT_CLEANUP: CleanupOptions = { minSilence: 1, keepPause: 0.4 };

/** Repetitions that are emphasis, not a restart. */
export const DEFAULT_INTENTIONAL: readonly string[] = [
  "muito, muito",
  "vamos, vamos",
  "não, não",
  "sim, sim",
  "isso, isso",
  "olha, olha",
  "pronto, pronto",
  "calma, calma",
  "bem, bem",
  "devagar, devagar",
];

/**
 * Most seconds between the end of a take and the start of the next for it to be a repeat: a
 * stutter of one word, a two-word restart, a longer phrase said again.
 */
export const repeatGap = (words: number): number => (words === 1 ? 0.6 : words === 2 ? 1.5 : 3);

/** Gaps shorter than this (rounding left over by earlier edits) are not worth a cut. */
const MIN_GAP = 1e-4;

/** A stretch where nobody is heard, with an id anchored in the media (audibleSilences). */
export interface Silence {
  start: number;
  end: number;
  id?: string;
}

export const strip = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

/** Words that are hesitations in any context ("né" included: it is almost always a verbal tic). */
const ALWAYS_FILLER = new Set([
  "ahn",
  "ah",
  "han",
  "hum",
  "hm",
  "hmm",
  "humm",
  "uhm",
  "uh",
  "eh",
  "ee",
  "eee",
  "aa",
  "aaa",
  "er",
  "ne",
]);

const trailingPause = (text: string): boolean => /(,|…|\.\.\.)$/.test(text.trim());

/** Whether words[i] is a hesitation; `words` are the words of one speaker, in order. */
function isFiller(words: TimelineWord[], i: number): boolean {
  const w = words[i];
  const raw = w.text.trim();
  const n = strip(raw);
  if (!n) return false;
  if (ALWAYS_FILLER.has(n)) return true;
  const prev = words[i - 1];
  const setOffBefore = !prev || /[,.!?…]$/.test(prev.text) || w.start - prev.end > 0.4;
  // "é" is also the verb "to be" and "e" means "and": only an accented "é" trailing off counts.
  if (n === "e") return /^é/i.test(raw) && trailingPause(raw) && setOffBefore;
  // "tipo" is a filler when set off by commas ("..., tipo, ..."), a noun otherwise.
  if (n === "tipo") return trailingPause(raw) && setOffBefore;
  return false;
}

const fileStem = (path: string): string =>
  (path.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.[^.]+$/, "");

/**
 * Media of an avatar: a video with its background removed (key) and the voice extracted from one
 * ("<video>-voz.wav", made when a HeyGen MP4 is imported).
 */
export function avatarMedia(project: Pick<Project, "assets">): Set<string> {
  const keyed = project.assets.filter((a) => a.kind === "video" && a.key);
  const out = new Set(keyed.map((a) => a.id));
  const stems = new Set(keyed.map((a) => fileStem(a.path)));
  for (const a of project.assets) {
    const m = /^(.*)-voz$/.exec(fileStem(a.path));
    if (a.kind === "audio" && m && stems.has(m[1])) out.add(a.id);
  }
  return out;
}

/** Who speaks in each clip, by clip id (SpeakerRole). */
export function clipRoles(
  project: Pick<Project, "assets" | "tracks" | "clips">,
): Map<string, SpeakerRole> {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const music = new Set(project.tracks.filter((t) => t.music).map((t) => t.id));
  const avatar = avatarMedia(project);
  const out = new Map<string, SpeakerRole>();
  for (const c of project.clips)
    out.set(
      c.id,
      c.insertId || avatar.has(c.assetId)
        ? "avatar"
        : music.has(c.trackId) || assets.get(c.assetId)?.recording?.role === "system"
          ? "other"
          : "teacher",
    );
  return out;
}

/** Maps each clip's slice of its source transcript onto the timeline. */
export function timelineWords(
  project: Project,
  transcripts: ReadonlyMap<string, Transcript>,
): TimelineWord[] {
  const out: TimelineWord[] = [];
  const roles = clipRoles(project);
  for (const c of project.clips) {
    const tr = transcripts.get(c.assetId);
    if (!tr) continue;
    const from = c.in;
    const to = sourceEnd(c);
    const role = roles.get(c.id) ?? "teacher";
    tr.words.forEach((w, i) => {
      const mid = (w.start + w.end) / 2;
      if (mid < from || mid >= to) return;
      out.push({
        // The index as recognized: corrections that drop or join words keep the keys stable.
        key: `${c.assetId}:${w.i ?? i}`,
        clipId: c.id,
        text: w.text,
        start: Math.max(c.start, timelineAt(c, w.start)),
        end: Math.min(clipEnd(c), timelineAt(c, w.end)),
        p: w.p,
        source: c.assetId,
        role,
      });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** What the cleanup listens to: transcripts, and the sound envelope of media without one. */
export interface SpeechSources {
  transcripts: ReadonlyMap<string, Transcript>;
  /** Peaks per second (0..1 of the file's loudest), by asset id (the media's waveform file). */
  envelopes?: ReadonlyMap<string, { peaksPerSecond: number; peaks: ArrayLike<number> }>;
}

/** Envelope level of silence: 40 dB below the loudest peak of the file. */
export const QUIET_LEVEL = 0.01;
/** Quiet for at least this long (seconds) is a pause in the envelope. */
export const QUIET_MIN = 0.3;

/**
 * Clips heard in the lesson: on an unmuted track that is not music, volume above 0, media with
 * sound. Sound on a track the cuts leave alone (a bed of music not marked as one) keeps playing
 * through a cut and is not listened to; a locked track is, since it plays on as it is.
 */
export function audibleClips(project: Project): Clip[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const targets = cutTargets(project);
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const sounds = (a: Asset | undefined): boolean =>
    !!a && a.hasAudio && (a.kind === "audio" || a.kind === "video");
  return project.clips.filter((c) => {
    const t = tracks.get(c.trackId);
    return (
      !!t &&
      !t.muted &&
      !t.music &&
      (t.locked || targets.has(t.id)) &&
      c.volume > 0 &&
      !c.annotation &&
      !c.zoomLayer &&
      sounds(assets.get(c.assetId))
    );
  });
}

const quietCache = new WeakMap<object, [number, number][]>();

/** Quiet stretches of an envelope, source seconds. */
function envelopeQuiet(env: {
  peaksPerSecond: number;
  peaks: ArrayLike<number>;
}): [number, number][] {
  const known = quietCache.get(env);
  if (known) return known;
  const pps = env.peaksPerSecond;
  const out: [number, number][] = [];
  let from = -1;
  for (let i = 0; i <= env.peaks.length; i++) {
    const quiet = i < env.peaks.length && env.peaks[i] < QUIET_LEVEL;
    if (quiet && from < 0) from = i;
    else if (!quiet && from >= 0) {
      if ((i - from) / pps >= QUIET_MIN) out.push([from / pps, i / pps]);
      from = -1;
    }
  }
  quietCache.set(env, out);
  return out;
}

/** [a, b] without the (sorted, apart) `holes`. */
function subtract(
  range: readonly [number, number],
  holes: readonly (readonly [number, number])[],
): [number, number][] {
  const out: [number, number][] = [];
  let cur = range[0];
  for (const [s, e] of holes) {
    if (e <= cur) continue;
    if (s >= range[1]) break;
    if (s > cur) out.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (range[1] > cur) out.push([cur, range[1]]);
  return out;
}

/** Speech of one heard clip, timeline seconds: the whole clip when nothing tells its pauses. */
function clipSpeech(c: Clip, sources: SpeechSources): [number, number][] {
  const tr = sources.transcripts.get(c.assetId);
  const env = tr ? undefined : sources.envelopes?.get(c.assetId);
  const quiet = tr ? mergeRanges(tr.silences, 0) : env ? envelopeQuiet(env) : [];
  return subtract([c.in, sourceEnd(c)], quiet).map(([a, b]): [number, number] => [
    timelineAt(c, a),
    timelineAt(c, b),
  ]);
}

/**
 * Where anyone is heard: the speech of every audible clip (audibleClips), joined. With a
 * transcript the speech is what is not silence in it; without one, what is not quiet in the
 * media's envelope; without either, the whole clip.
 */
export function speechIntervals(project: Project, sources: SpeechSources): [number, number][] {
  return mergeRanges(
    audibleClips(project).flatMap((c) => clipSpeech(c, sources)),
    0,
  );
}

/**
 * Pauses of the whole lesson: where something audible plays and nobody speaks in any of it. A
 * stretch with no sound at all (a title, a silent picture) is not a pause. Each pause gets an id
 * anchored in the media it starts in ("s:<asset>:<source seconds>"), the same after other cuts.
 */
export function audibleSilences(project: Project, sources: SpeechSources): Silence[] {
  const clips = audibleClips(project);
  const heard = mergeRanges(
    clips.map((c): [number, number] => [c.start, clipEnd(c)]),
    0,
  );
  const speech = mergeRanges(
    clips.flatMap((c) => clipSpeech(c, sources)),
    0,
  );
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  const kind = new Map(project.assets.map((a) => [a.id, a.kind]));
  const rank = (c: Clip): number =>
    (sources.transcripts.has(c.assetId) ? 0 : 2) +
    (kind.get(c.assetId) === "audio" ? 0 : 1) +
    (order.get(c.trackId) ?? 0) / 1000;
  const out: Silence[] = [];
  for (const range of heard)
    for (const [a, b] of subtract(range, speech)) {
      if (b - a < MIN_GAP) continue;
      // The media the pause is heard in: transcribed first, then audio, then the higher track.
      const ref = clips
        .filter((c) => c.start <= a + 1e-6 && clipEnd(c) > a + 1e-6)
        .sort((x, y) => rank(x) - rank(y))[0];
      out.push({
        start: a,
        end: b,
        ...(ref ? { id: `s:${ref.assetId}:${sourceAt(ref, a).toFixed(3)}` } : {}),
      });
    }
  return out;
}

/** Silences of transcribed sources, clipped to what is actually on the timeline. */
export function timelineSilences(
  project: Project,
  transcripts: Map<string, Transcript>,
): [number, number][] {
  const out: [number, number][] = [];
  for (const c of project.clips) {
    const tr = transcripts.get(c.assetId);
    if (!tr) continue;
    for (const [s, e] of tr.silences) {
      const a = Math.max(s, c.in);
      const b = Math.min(e, sourceEnd(c));
      if (b > a) out.push([timelineAt(c, a), timelineAt(c, b)]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Words of a phrase as compared ("Muito, muito!" → "muito muito"). */
const phraseKey = (text: string): string => text.split(/\s+/).map(strip).filter(Boolean).join(" ");

/**
 * Finds hesitations, repeated phrases and long pauses. Hesitations and repeats are looked for in
 * each speaker's own words (an avatar's never): the teacher saying the avatar's line again is a
 * conversation. A repeat needs the takes close together (repeatGap), nothing happening on screen
 * between them and no other voice under the cut, and is not one of the intentional phrases.
 * A pause is cut only where the screen is still too, and only what is left of it that is still
 * at least `minSilence` long.
 */
export function analyze(
  words: TimelineWord[],
  silences: readonly (readonly [number, number] | Silence)[],
  opts: CleanupOptions = DEFAULT_CLEANUP,
): Issue[] {
  const issues: Issue[] = [];
  const intentional = new Set((opts.intentional ?? DEFAULT_INTENTIONAL).map(phraseKey));
  const activity = mergeRanges(
    (opts.activity ?? []).map((a): [number, number] => [a.start, a.end]),
    0,
  );
  const busy = (a: number, b: number): boolean =>
    activity.some(([s, e]) => Math.min(b, e) - Math.max(a, s) > 0.01);
  // A cut over another source's word would take that voice with it.
  const otherVoice = (source: string, a: number, b: number): boolean =>
    words.some(
      (w) => (w.source ?? "") !== source && Math.min(b, w.end) - Math.max(a, w.start) > 0.02,
    );
  const position = new Map(words.map((w, i) => [w, i]));
  const bySource = new Map<string, TimelineWord[]>();
  for (const w of words) {
    if (w.role === "avatar") continue;
    const source = w.source ?? "";
    const list = bySource.get(source);
    if (list) list.push(w);
    else bySource.set(source, [w]);
  }

  for (const [source, own] of bySource) {
    own.forEach((w, i) => {
      if (!isFiller(own, i)) return;
      // Up to the next word of anyone, so no other voice is clipped.
      const next = words[(position.get(w) ?? -1) + 1];
      const end = Math.max(Math.min(next ? next.start : w.end, w.end + 0.3) - 0.03, w.end);
      if (otherVoice(source, w.start, end)) return;
      issues.push({ id: `f:${w.key}`, kind: "filler", start: w.start, end, words: [w.key] });
    });

    // Repeated phrases: when a run of n words is said again right away, drop the first take.
    // Runs repeatedly over the words that remain so "a b, a b c, a b c" collapses to one "a b c".
    const removed = new Set<number>();
    for (let pass = 0; pass < 4; pass++) {
      const live = own.map((_, i) => i).filter((i) => !removed.has(i));
      let changed = false;
      for (let n = 6; n >= 1 && !changed; n--) {
        for (let k = 0; k + 2 * n <= live.length; k++) {
          const a = live.slice(k, k + n);
          const b = live.slice(k + n, k + 2 * n);
          if (
            !a.every(
              (idx, j) => strip(own[idx].text) && strip(own[idx].text) === strip(own[b[j]].text),
            )
          )
            continue;
          const first = own[a[0]];
          const last = own[a[n - 1]];
          const again = own[b[0]];
          if (again.start - last.end > repeatGap(n)) continue;
          const said = [...a, ...b].map((idx) => own[idx].text).join(" ");
          if (intentional.has(phraseKey(said))) continue;
          const start = first.start;
          const end = Math.max(last.end, again.start - 0.03);
          if (busy(start, again.start) || otherVoice(source, start, end)) continue;
          for (const idx of a) removed.add(idx);
          issues.push({
            id: `r:${first.key}`,
            kind: "repeat",
            start,
            end,
            words: a.map((idx) => own[idx].key),
          });
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
  }

  const half = opts.keepPause / 2;
  for (const sil of silences) {
    const [s, e, given] = "start" in sil ? [sil.start, sil.end, sil.id] : [sil[0], sil[1]];
    if (e - s < opts.minSilence) continue;
    const id = given ?? `s:${s.toFixed(3)}`;
    for (const [a, b] of subtract([s, e], activity)) {
      if (b - a < opts.minSilence) continue;
      issues.push({
        // A pause split by a gesture: each part keeps its offset into the pause.
        id: a === s ? id : `${id}+${(a - s).toFixed(3)}`,
        kind: "silence",
        start: a + half,
        end: b - half,
        words: [],
      });
    }
  }
  return issues.sort((a, b) => a.start - b.start);
}

/** Range to remove for a selection of words, extended into the surrounding gaps. */
export function wordsRange(words: TimelineWord[], from: number, to: number): [number, number] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const prev = words[a - 1];
  const next = words[b + 1];
  const start = prev
    ? Math.max(prev.end, words[a].start - 0.06)
    : Math.max(0, words[a].start - 0.06);
  const end = next ? Math.min(next.start - 0.02, words[b].end + 0.06) : words[b].end + 0.06;
  return [start, Math.max(end, words[b].end)];
}

/** Merges overlapping or touching ranges. */
export function mergeRanges(ranges: [number, number][], gap = 0.02): [number, number][] {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + gap) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Removes [start, end) from every target track and pulls everything after it left,
 * keeping the tracks in sync. Tracks outside `targets` (locked, music) are left alone.
 */
export function rippleDeleteRange(
  clips: Clip[],
  start: number,
  end: number,
  targets: Set<string>,
): Clip[] {
  const len = end - start;
  if (len <= 0) return clips;
  let out = clips;
  for (const t of targets) out = overwriteRange(out, t, start, end);
  return out.map((c) =>
    targets.has(c.trackId) && c.start >= end - 1e-6 ? { ...c, start: c.start - len } : c,
  );
}

const contentEnd = (clips: Clip[], targets: Set<string>): number => {
  let end = 0;
  for (const c of clips) if (targets.has(c.trackId)) end = Math.max(end, clipEnd(c));
  return end;
};

/**
 * Applies many cuts at once, latest first so earlier positions stay valid. Tracks that are not
 * cut (a music bed) and ran to the end of the lesson are trimmed to the new, shorter end, so
 * the export doesn't continue with a black screen.
 */
export function applyCuts(
  clips: Clip[],
  ranges: [number, number][],
  targets: Set<string>,
  keepTrackIds: Set<string> = new Set(),
): Clip[] {
  return cutSorted(clips, mergeRanges(ranges), targets, keepTrackIds);
}

/** applyCuts() over ranges already sorted and apart from each other. */
function cutSorted(
  clips: Clip[],
  ranges: [number, number][],
  targets: Set<string>,
  keepTrackIds: Set<string>,
): Clip[] {
  const oldEnd = contentEnd(clips, targets);
  let out = clips;
  for (const [s, e] of [...ranges].reverse()) out = rippleDeleteRange(out, s, e, targets);
  const newEnd = contentEnd(out, targets);
  if (newEnd >= oldEnd) return out;
  return out
    .filter((c) => targets.has(c.trackId) || keepTrackIds.has(c.trackId) || c.start < newEnd - 1e-6)
    .map((c) =>
      !targets.has(c.trackId) &&
      !keepTrackIds.has(c.trackId) &&
      clipEnd(c) >= oldEnd - 0.05 &&
      clipEnd(c) > newEnd
        ? { ...c, duration: newEnd - c.start }
        : c,
    );
}

/**
 * Closes only the stretches where none of the target tracks has anything, pulling everything
 * after each one left on all of them at once (applyCuts). Balloons, avatar, zoom layers and the
 * voice keep their distance to each other. Tracks outside `targets` are not moved: a music bed
 * ends with the lesson, while `keepTrackIds` (locked tracks) are left exactly as they are.
 */
export function closeCommonGaps(
  project: Pick<Project, "clips">,
  targets: Set<string>,
  keepTrackIds: Set<string> = new Set(),
): Clip[] {
  const busy = mergeRanges(
    project.clips
      .filter((c) => targets.has(c.trackId))
      .map((c): [number, number] => [c.start, clipEnd(c)]),
    0,
  );
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of busy) {
    if (start - cursor > MIN_GAP) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  // Already apart: merging them again (applyCuts) could swallow a very short clip between two gaps.
  return gaps.length ? cutSorted(project.clips, gaps, targets, keepTrackIds) : project.clips;
}

/**
 * Tracks that text-based cuts apply to: every unlocked video track, every unlocked audio track
 * carrying speech, and the microphone and computer sound of a recording (they belong to the
 * screen video even before being transcribed). Music beds keep playing under the edit instead
 * of being chopped.
 */
export function cutTargets(project: Project): Set<string> {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out = new Set<string>();
  for (const t of project.tracks) {
    if (t.locked) continue;
    const onTrack = project.clips
      .filter((c) => c.trackId === t.id)
      .map((c) => assets.get(c.assetId));
    if (t.music) continue;
    if (
      t.kind === "video" ||
      onTrack.some(
        (a) =>
          a &&
          (a.kind !== "audio" ||
            a.transcript ||
            a.recording?.role === "mic" ||
            a.recording?.role === "system"),
      )
    )
      out.add(t.id);
  }
  return out;
}

/** Groups words into paragraphs at long pauses or after long sentences. */
export function paragraphs(words: TimelineWord[]): TimelineWord[][] {
  const out: TimelineWord[][] = [];
  let cur: TimelineWord[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const pause = prev ? w.start - prev.end : 0;
    const sentenceEnd = prev && /[.!?]$/.test(prev.text);
    if (cur.length && (pause > 1.5 || (sentenceEnd && cur.length >= 35))) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  });
  if (cur.length) out.push(cur);
  return out;
}

const srtTime = (t: number): string => {
  const ms = Math.round(Math.max(0, t) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  const p = (v: number, n = 2): string => String(v).padStart(n, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
};

/** Subtitle cues of up to two 42-character lines and 6 seconds, breaking at punctuation and pauses. */
export function buildSrt(words: TimelineWord[], removed: Set<string> = new Set()): string {
  const MAX_CHARS = 84;
  const MAX_DUR = 6;
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: TimelineWord[] = [];
  const flush = (): void => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(" ");
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text });
    cur = [];
  };
  let sentenceStart = true;
  for (const raw of words) {
    if (removed.has(raw.key)) continue;
    // Removing a filler can leave a sentence starting in lowercase ("sala. então").
    const w = sentenceStart
      ? { ...raw, text: raw.text.charAt(0).toUpperCase() + raw.text.slice(1) }
      : raw;
    sentenceStart = /[.!?]$/.test(raw.text);
    const prev = cur[cur.length - 1];
    const len = cur.reduce((s, x) => s + x.text.length + 1, 0) + w.text.length;
    if (prev && (len > MAX_CHARS || w.end - cur[0].start > MAX_DUR || w.start - prev.end > 0.8))
      flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) && cur.length > 3) flush();
  }
  flush();
  const wrap = (t: string): string => {
    if (t.length <= 42) return t;
    const mid = t.lastIndexOf(" ", Math.ceil(t.length / 2) + 4);
    return mid > 0 ? `${t.slice(0, mid)}\n${t.slice(mid + 1)}` : t;
  };
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(c.end, c.start + 0.8))}\n${wrap(c.text)}\n`,
    )
    .join("\n");
}

/**
 * Finds every occurrence of a quoted passage in the timeline words, ignoring case, accents and
 * punctuation. Returns [firstIndex, lastIndex] pairs.
 */
export function findQuote(words: TimelineWord[], quote: string): [number, number][] {
  const q = quote.split(/\s+/).map(strip).filter(Boolean);
  if (!q.length) return [];
  const w = words.map((x) => strip(x.text));
  const out: [number, number][] = [];
  for (let i = 0; i + q.length <= w.length; i++) {
    let ok = true;
    for (let j = 0; j < q.length && ok; j++) ok = w[i + j] === q[j];
    if (ok) out.push([i, i + q.length - 1]);
  }
  return out;
}

/** Protected source ranges mapped onto the current timeline. */
export function timelineProtected(
  project: Project,
): { id: string; start: number; end: number; label: string }[] {
  const out: { id: string; start: number; end: number; label: string }[] = [];
  for (const pr of project.protected ?? []) {
    for (const c of project.clips) {
      if (c.assetId !== pr.assetId) continue;
      const a = Math.max(pr.start, c.in);
      const b = Math.min(pr.end, sourceEnd(c));
      if (b > a)
        out.push({ id: pr.id, start: timelineAt(c, a), end: timelineAt(c, b), label: pr.label });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Cuts that would touch a protected range (overlap of more than a few milliseconds). */
export function protectedConflicts(
  project: Project,
  ranges: [number, number][],
): { range: [number, number]; label: string }[] {
  const prot = timelineProtected(project);
  const out: { range: [number, number]; label: string }[] = [];
  for (const r of ranges) {
    const hit = prot.find((p) => Math.min(r[1], p.end) - Math.max(r[0], p.start) > 0.01);
    if (hit) out.push({ range: r, label: hit.label });
  }
  return out;
}

/** Source ranges covered by a run of timeline words (one entry per clip they span). */
export function wordsToSource(
  project: Project,
  words: TimelineWord[],
): { assetId: string; start: number; end: number }[] {
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const byClip = new Map<string, { assetId: string; start: number; end: number }>();
  for (const w of words) {
    const c = clips.get(w.clipId);
    if (!c) continue;
    const s = sourceAt(c, w.start);
    const e = sourceAt(c, w.end);
    const cur = byClip.get(c.id);
    if (cur) {
      cur.start = Math.min(cur.start, s);
      cur.end = Math.max(cur.end, e);
    } else byClip.set(c.id, { assetId: c.assetId, start: s, end: e });
  }
  return [...byClip.values()];
}
