import { clipEnd, overwriteRange, sourceAt, sourceEnd, timelineAt } from "./timeline.ts";
import type { Asset, Clip, Project, Transcript } from "./types.ts";

/**
 * Who speaks: the teacher (the narration and the microphone), the presenter (an avatar or a
 * person in a video with the background removed or recorded on a solid screen, a presenter's
 * video placed by the voice, a script insert) or something else (the computer's own sound, a music bed). Only the teacher's words
 * are cleaned of hesitations and repeats: the avatar's lines are acted and the computer's sound
 * is what it is.
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
  /** Not heard in the lesson (muted track, volume 0, under the presenter's own sound). */
  silent?: boolean;
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
  /** Silences: the whole quiet stretch on the timeline (the cut leaves a pause inside it). */
  span?: [number, number];
}

export interface CleanupOptions {
  /** Silences at least this long (seconds) are shortened. */
  minSilence: number;
  /** Pause left in place of a removed silence (seconds). */
  keepPause: number;
  /**
   * Timeline stretches where something happens on screen (activity.ts): a pause is only cut
   * around them, a hesitation over one stays, and the same words said before and after one are
   * a demonstration.
   */
  activity?: readonly { start: number; end: number }[];
  /** Phrases repeated on purpose, as said ("muito, muito"); DEFAULT_INTENTIONAL when absent. */
  intentional?: readonly string[];
  /**
   * Timeline stretches where the script asks for a pause ("pausar para a pessoa testar"):
   * like a pause after a question, they keep THINK_PAUSE.
   */
  thinking?: readonly (readonly [number, number])[];
}

export const DEFAULT_CLEANUP: CleanupOptions = { minSilence: 1, keepPause: 0.4 };

/** What a pause meant for thinking keeps: after a question, or where the script says to wait. */
export const THINK_PAUSE = 2.5;

/** Repetitions that are emphasis or a way of speaking, not a restart. */
export const DEFAULT_INTENTIONAL: readonly string[] = [
  "muito, muito",
  "vamos, vamos",
  "vamos lá, vamos lá",
  "não, não",
  "sim, sim",
  "isso, isso",
  "isso aí, isso aí",
  "é isso, é isso",
  "olha, olha",
  "olha só, olha só",
  "pronto, pronto",
  "calma, calma",
  "bem, bem",
  "devagar, devagar",
  "de novo, de novo",
  "vai, vai",
  "bora, bora",
  "corre, corre",
  "parabéns, parabéns",
  "oi, oi",
  "tchau, tchau",
];

/** Counting is said again on purpose ("um, dois, três... um, dois, três"). */
const COUNTING = new Set(
  "zero um uma dois duas tres quatro cinco seis sete oito nove dez onze doze".split(" "),
);

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
  /** The clip the pause is anchored in: each part of it gets its own id from its media seconds. */
  ref?: Pick<Clip, "assetId" | "start" | "in" | "speed">;
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
const statementEnd = (text: string): boolean => /[.!]["”')\]]*$/.test(text.trim());

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

/**
 * Media of a presenter (an avatar or a person): a video with its background removed (key) or
 * recorded on a solid screen (screen), and what Asset.origin says came from one (the video
 * placed by the voice, the narration of a guided recording taken from such a video).
 */
export function avatarMedia(project: Pick<Project, "assets">): Set<string> {
  return new Set(
    project.assets
      .filter((a) => a.origin === "presenter" || (a.kind === "video" && (a.key || a.screen)))
      .map((a) => a.id),
  );
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
  const heard = new Set(audibleClips(project).map((c) => c.id));
  for (const c of project.clips) {
    const tr = transcripts.get(c.assetId);
    if (!tr) continue;
    const from = c.in;
    const to = sourceEnd(c);
    const role = roles.get(c.id) ?? "teacher";
    const silent = !heard.has(c.id);
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
        ...(silent ? { silent } : {}),
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
/** Around each transcribed word, this much is speech too (seconds). */
export const WORD_MARGIN = 0.15;

/**
 * Clips heard in the lesson: on an unmuted track that is not music, volume above 0, media with
 * sound, not silenced under the presenter's own sound (Clip.mutedFor, whatever its value). Sound on a track the cuts leave
 * alone (a bed of music not marked as one) keeps playing through a cut and is not listened to; a
 * locked track is, since it plays on as it is.
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
      !c.mutedFor &&
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

const transcriptQuiet = new WeakMap<Transcript, [number, number][]>();

/** A word or a VAD stretch reaches this far into a silence (seconds) before it counts as inside. */
const EDGE = 0.05;

/**
 * The silences of a transcript that are really quiet: whatever whisper heard inside a silence of
 * the FFmpeg detector (a word, with a margin around it, or a stretch the VAD kept) is speech, so
 * a child answering softly is never a pause. Words that only touch a silence's edges leave it as
 * it is.
 */
function quietOf(tr: Transcript): [number, number][] {
  const known = transcriptQuiet.get(tr);
  if (known) return known;
  // What was heard, and the stretch it keeps as speech (a word with its margin).
  const heard: { at: [number, number]; keeps: [number, number] }[] = [
    ...tr.words
      .filter((w) => !w.dropped)
      .map((w) => ({
        at: [w.start, w.end] as [number, number],
        keeps: [w.start - WORD_MARGIN, w.end + WORD_MARGIN] as [number, number],
      })),
    ...(tr.speech ?? []).map(([a, b]) => ({
      at: [a, b] as [number, number],
      keeps: [a, b] as [number, number],
    })),
  ];
  const out = mergeRanges(tr.silences, 0).flatMap((s) => {
    const inside = heard.filter(
      ({ at: [a, b] }) => Math.min(b, s[1] - EDGE) - Math.max(a, s[0] + EDGE) > 0,
    );
    return inside.length
      ? subtract(
          s,
          mergeRanges(
            inside.map((h) => h.keeps),
            0,
          ),
        )
      : [s];
  });
  transcriptQuiet.set(tr, out);
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
  const quiet = tr ? quietOf(tr) : env ? envelopeQuiet(env) : [];
  return subtract([c.in, sourceEnd(c)], quiet).map(([a, b]): [number, number] => [
    timelineAt(c, a),
    timelineAt(c, b),
  ]);
}

/**
 * Where anyone is heard: the speech of every audible clip (audibleClips), joined. With a
 * transcript the speech is what is not silence in it, plus every word it heard; without one,
 * what is not quiet in the media's envelope; without either, the whole clip.
 */
export function speechIntervals(project: Project, sources: SpeechSources): [number, number][] {
  return mergeRanges(
    audibleClips(project).flatMap((c) => clipSpeech(c, sources)),
    0,
  );
}

const fixed = (v: number): string => v.toFixed(3);

/** The id of a quiet stretch [a, b] seen through `ref`: "s:<asset>:<from>-<to>" in its seconds. */
const silenceId = (ref: Pick<Clip, "assetId" | "start" | "in" | "speed">, a: number, b: number) =>
  `s:${ref.assetId}:${fixed(sourceAt(ref, a))}-${fixed(sourceAt(ref, b))}`;

/**
 * The clip a pause starting at `a` is anchored in: the one with the last word heard before it
 * (the same whatever else gets transcribed later), else the one with the first word after it,
 * else the clip heard there (transcribed first, then audio, then the higher track).
 */
function pauseAnchor(
  heardWords: readonly { start: number; end: number; clip: Clip }[],
  clips: readonly Clip[],
  rank: (c: Clip) => number,
  a: number,
): Clip | undefined {
  let lo = 0;
  let hi = heardWords.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (heardWords[mid].end <= a + 0.05) lo = mid + 1;
    else hi = mid;
  }
  // heardWords is in order of end: the one before `lo` ended last before the pause.
  const before = heardWords[lo - 1];
  if (before) return before.clip;
  const after = heardWords.find((w) => w.start >= a - 0.05);
  if (after) return after.clip;
  return clips
    .filter((c) => c.start <= a + 1e-6 && clipEnd(c) > a + 1e-6)
    .sort((x, y) => rank(x) - rank(y))[0];
}

/**
 * Pauses of the whole lesson: where something audible plays and nobody speaks in any of it. A
 * stretch with no sound at all (a title, a silent picture) is not a pause. Each pause is
 * anchored in the media of the last word said before it (pauseAnchor), so its id
 * ("s:<asset>:<from>-<to>", media seconds) and what was kept of it follow the media through
 * later cuts and transcriptions.
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
  const heardWords: { start: number; end: number; clip: Clip }[] = [];
  for (const c of clips) {
    const tr = sources.transcripts.get(c.assetId);
    if (!tr) continue;
    for (const w of tr.words) {
      if (w.dropped || w.end <= c.in || w.start >= sourceEnd(c)) continue;
      heardWords.push({ start: timelineAt(c, w.start), end: timelineAt(c, w.end), clip: c });
    }
  }
  heardWords.sort((x, y) => x.end - y.end);
  const out: Silence[] = [];
  for (const range of heard)
    for (const [a, b] of subtract(range, speech)) {
      if (b - a < MIN_GAP) continue;
      const ref = pauseAnchor(heardWords, clips, rank, a);
      out.push({ start: a, end: b, ...(ref ? { id: silenceId(ref, a, b), ref } : {}) });
    }
  return out;
}

/**
 * Anchored ids (as audibleSilences gives them) for pauses found another way (the voice
 * cleanup), so what the person keeps of one there stays kept in the general cleanup.
 */
export function pauseIds(
  project: Project,
  sources: SpeechSources,
): (a: number, b: number) => string | undefined {
  const all = audibleSilences(project, sources);
  return (a, b) => {
    const found = all.find((s) => Math.min(b, s.end) - Math.max(a, s.start) > 0.01);
    return found?.ref
      ? silenceId(found.ref, Math.max(a, found.start), Math.min(b, found.end))
      : undefined;
  };
}

const PAUSE_ID = /^s:(.+):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;

/** Whether the kept entry `entry` covers `issue`: the same id, or a pause overlapping it in the media. */
function keptCovers(project: Pick<Project, "clips">, entry: string, issue: Issue): boolean {
  if (entry === issue.id) return true;
  if (issue.kind !== "silence") return false;
  const m = PAUSE_ID.exec(entry);
  if (!m) return false;
  const [assetId, a, b] = [m[1], Number(m[2]), Number(m[3])];
  const [x, y] = issue.span ?? [issue.start, issue.end];
  // The same stretch of that media, through any of its clips (another source may have become
  // the anchor since, or a cut may have trimmed the pause).
  return project.clips.some((c) => {
    if (c.assetId !== assetId) return false;
    const from = Math.max(x, c.start);
    const to = Math.min(y, clipEnd(c));
    if (to - from <= 0.01) return false;
    const s = sourceAt(c, from);
    const e = sourceAt(c, to);
    return Math.min(e, b) - Math.max(s, a) > 0.05;
  });
}

/** The kept entries that cover an issue (the ones to remove to cut it again). */
export function keptEntries(
  project: Pick<Project, "clips">,
  kept: readonly string[],
  issue: Issue,
): string[] {
  return kept.filter((entry) => keptCovers(project, entry, issue));
}

/**
 * Whether the person kept an issue: by its id, or a pause by where it is in the media (a kept
 * pause stays kept when a cut trims it, a gesture splits it or another source is transcribed).
 */
export function keptMatcher(
  project: Pick<Project, "clips">,
  kept: readonly string[],
): (issue: Issue) => boolean {
  const ids = new Set(kept);
  const pauses = kept.filter((entry) => PAUSE_ID.test(entry));
  return (issue) =>
    ids.has(issue.id) ||
    (issue.kind === "silence" && pauses.some((entry) => keptCovers(project, entry, issue)));
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
 * each teacher source's own words (never an avatar's or the computer's, never a media that is
 * not heard): the teacher saying the avatar's line again is a conversation. A hesitation over
 * something happening on screen stays. A repeat needs the takes close together (repeatGap), a
 * short one within one sentence, nothing happening on screen between them and no other voice
 * under the cut, and is not counting or one of the intentional phrases. A pause is cut only
 * where the screen is still too, and only what is left of it that is still at least
 * `minSilence` long; after a question, or where the script asks for one (`thinking`), it keeps
 * THINK_PAUSE instead of `keepPause`. Each part of a pause split by activity gets its own id,
 * from its own seconds in the media (Silence.ref).
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
  const heard = words.filter((w) => !w.silent);
  // A cut over another source's word would take that voice with it.
  const otherVoice = (source: string, a: number, b: number): boolean =>
    heard.some(
      (w) => (w.source ?? "") !== source && Math.min(b, w.end) - Math.max(a, w.start) > 0.02,
    );
  const position = new Map(heard.map((w, i) => [w, i]));
  const bySource = new Map<string, TimelineWord[]>();
  for (const w of heard) {
    if ((w.role ?? "teacher") !== "teacher") continue;
    const source = w.source ?? "";
    const list = bySource.get(source);
    if (list) list.push(w);
    else bySource.set(source, [w]);
  }

  for (const [source, own] of bySource) {
    own.forEach((w, i) => {
      if (!isFiller(own, i)) return;
      // Up to the next word of anyone, so no other voice is clipped.
      const next = heard[(position.get(w) ?? -1) + 1];
      const end = Math.max(Math.min(next ? next.start : w.end, w.end + 0.3) - 0.03, w.end);
      if (busy(w.start, end) || otherVoice(source, w.start, end)) return;
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
          // "...no verde. Verde é a cor": one or two words again after a full stop start another
          // sentence. A question mark does not count: whisper writes one after a false start
          // ("quem está? Quem está participando?").
          if (n <= 2 && statementEnd(last.text)) continue;
          if (
            a.every(
              (idx) => COUNTING.has(strip(own[idx].text)) || /^\d+$/.test(strip(own[idx].text)),
            )
          )
            continue;
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

  // The word heard last before a time (for the pause after a question).
  const lastBefore = (t: number): TimelineWord | undefined => {
    let lo = 0;
    let hi = heard.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heard[mid].start <= t + 0.05) lo = mid + 1;
      else hi = mid;
    }
    let best: TimelineWord | undefined;
    for (let i = lo - 1; i >= 0 && i >= lo - 20; i--)
      if (heard[i].end <= t + 0.05 && (!best || heard[i].end > best.end)) best = heard[i];
    return best;
  };
  const thinking = mergeRanges(
    (opts.thinking ?? []).map(([a, b]): [number, number] => [a, b]),
    0,
  );
  for (const sil of silences) {
    const [s, e, given, ref] =
      "start" in sil
        ? [sil.start, sil.end, sil.id, sil.ref]
        : [sil[0], sil[1], undefined, undefined];
    if (e - s < opts.minSilence) continue;
    const question = /\?["”')\]]*$/.test(lastBefore(s)?.text.trim() ?? "");
    for (const [a, b] of subtract([s, e], activity)) {
      const think = question || thinking.some(([x, y]) => Math.min(b, y) - Math.max(a, x) > 0.05);
      const pause = think ? Math.max(THINK_PAUSE, opts.keepPause) : opts.keepPause;
      if (b - a < opts.minSilence || b - a <= pause + 0.05) continue;
      const half = pause / 2;
      issues.push({
        id: ref ? silenceId(ref, a, b) : a === s && given ? given : `s:${fixed(a)}`,
        kind: "silence",
        start: a + half,
        end: b - half,
        words: [],
        span: [a, b],
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
