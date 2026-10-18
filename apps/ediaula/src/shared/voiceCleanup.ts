import { analyze, mergeRanges, pauseIds, timelineSilences, timelineWords } from "./cleanup.ts";
import type { SpeechItem } from "./script.ts";
import { alignSection } from "./scriptAlign.ts";
import { clipEnd, sourceEnd, timelineAt } from "./timeline.ts";
import type { Clip, Project, Transcript, VoiceTake } from "./types.ts";
import { voiceClips } from "./voiceMaster.ts";

/**
 * The cleanup of the voice before it is exported for the presenter, as one proposal (lib/voice.ts
 * shows it with shared/anchors.ts; applying it is one Ctrl+Z):
 *
 * - takes of the same script line said more than once: the last complete take stays (by the
 *   recording's takes, `Asset.voiceTakes`, and the transcript against the script);
 * - takes marked with Ctrl+Shift+R while recording;
 * - filler words and long silences, leaving a natural pause.
 *
 * Only the voice track is looked at; the cut itself, like every proposal, keeps the other tracks
 * in sync. Hesitations and pauses carry the ids the general cleanup (shared/cleanup.ts) gives
 * them: while this proposal waits the general one leaves them out, and what the person leaves
 * out here stays kept there.
 */

export interface VoiceCleanupOptions {
  /** Silences longer than this are shortened… */
  minSilence: number;
  /** …to this pause (0.35 to 0.45 s sounds natural). */
  keepPause: number;
  /** A take is complete when this share of its line's words is heard in it. */
  complete: number;
}

export const VOICE_CLEANUP: VoiceCleanupOptions = {
  minSilence: 0.9,
  keepPause: 0.4,
  complete: 0.75,
};

export type VoiceCleanupKind = "take" | "retake" | "filler" | "silence";

export interface VoiceCleanupItem {
  kind: VoiceCleanupKind;
  /** Timeline range to cut. */
  start: number;
  end: number;
  reason: string;
  /** The general cleanup's id of the same hesitation or pause (Issue.id), when it has one. */
  issueId?: string;
}

export interface VoiceCleanupInput {
  project: Project;
  transcripts: Map<string, Transcript>;
  /** The section's speech items, in order (the takes' `line` indexes into it). */
  lines?: readonly SpeechItem[];
  /** Quiet stretches of voice media without a transcript, in their own seconds. */
  silences?: Map<string, [number, number][]>;
  options?: Partial<VoiceCleanupOptions>;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
const quote = (text: string): string => (text.length > 50 ? `${text.slice(0, 50)}…` : text);

/** A stretch of a media file on the timeline, through every voice clip that plays part of it. */
function onTimeline(
  clips: readonly Clip[],
  assetId: string,
  a: number,
  b: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (const c of clips) {
    if (c.assetId !== assetId) continue;
    const x = Math.max(a, c.in);
    const y = Math.min(b, sourceEnd(c));
    if (y - x > 1e-3) out.push([timelineAt(c, x), timelineAt(c, y)]);
  }
  return out;
}

/** Share of the line's words heard among the transcript words inside [a, b] of the media. */
function heardShare(
  transcript: Transcript | undefined,
  line: SpeechItem,
  a: number,
  b: number,
): number | null {
  if (!transcript) return null;
  const words = transcript.words
    .map((w, i) => ({
      key: String(i),
      clipId: "",
      text: w.text,
      start: w.start,
      end: w.end,
      p: w.p,
    }))
    .filter((w) => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 < b);
  const result = alignSection({ number: "", title: "", items: [line] }, words).lines[0];
  return result?.total ? result.matched / result.total : 0;
}

/** The takes that go: every take of a line but the last complete one, and the marked ones. */
export function discardedTakes(
  takes: readonly VoiceTake[],
  lines: readonly SpeechItem[] | undefined,
  transcript: Transcript | undefined,
  complete = VOICE_CLEANUP.complete,
): { take: VoiceTake; kind: "take" | "retake"; reason: string }[] {
  const out: { take: VoiceTake; kind: "take" | "retake"; reason: string }[] = [];
  const byLine = new Map<number, VoiceTake[]>();
  for (const t of takes) {
    if (t.retake) {
      out.push({
        take: t,
        kind: "retake",
        reason: "tomada marcada para refazer durante a gravação",
      });
      continue;
    }
    byLine.set(t.line, [...(byLine.get(t.line) ?? []), t]);
  }
  for (const [line, list] of byLine) {
    if (list.length < 2) continue;
    const item = lines?.[line];
    const shares = list.map((t) => (item ? heardShare(transcript, item, t.start, t.end) : null));
    // The last complete take; when none is (or there is no transcript), the last one.
    let keep = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      const share = shares[i];
      if (share === null || share >= complete) {
        keep = i;
        break;
      }
    }
    const label = item ? `"${quote(item.text)}"` : `fala ${line + 1}`;
    list.forEach((t, i) => {
      if (i !== keep)
        out.push({
          take: t,
          kind: "take",
          reason: `tomada repetida de ${label}: fica a última completa`,
        });
    });
  }
  return out.sort((a, b) => a.take.start - b.take.start);
}

/** Quiet stretches (source seconds) of a waveform with `pps` peaks a second. */
export function waveSilences(
  peaks: readonly number[],
  pps: number,
  min = VOICE_CLEANUP.minSilence,
  quiet = 0.05,
): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  for (let i = 0; i <= peaks.length; i++) {
    const silent = i < peaks.length && peaks[i] < quiet;
    if (silent && from < 0) from = i;
    else if (!silent && from >= 0) {
      if ((i - from) / pps >= min) out.push([round(from / pps), round(i / pps)]);
      from = -1;
    }
  }
  return out;
}

export function voiceCleanup(input: VoiceCleanupInput): VoiceCleanupItem[] {
  const o = { ...VOICE_CLEANUP, ...input.options };
  const { project } = input;
  const clips = voiceClips(project);
  if (!clips.length) return [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const items: VoiceCleanupItem[] = [];

  // Takes.
  const removed: [number, number][] = [];
  for (const assetId of new Set(clips.map((c) => c.assetId))) {
    const takes = assets.get(assetId)?.voiceTakes ?? [];
    for (const d of discardedTakes(takes, input.lines, input.transcripts.get(assetId), o.complete))
      for (const [start, end] of onTimeline(clips, assetId, d.take.start, d.take.end)) {
        items.push({ kind: d.kind, start: round(start), end: round(end), reason: d.reason });
        removed.push([start, end]);
      }
  }
  const gone = mergeRanges(removed, 0);
  const inside = (a: number, b: number): boolean =>
    gone.some(([x, y]) => a >= x - 1e-3 && b <= y + 1e-3);

  // Fillers and silences, only on the voice track's clips.
  const voiceIds = new Set(clips.map((c) => c.id));
  const voiceOnly: Project = { ...project, clips: project.clips.filter((c) => voiceIds.has(c.id)) };
  const words = timelineWords(voiceOnly, input.transcripts);
  const silences = timelineSilences(voiceOnly, input.transcripts);
  for (const c of clips) {
    if (input.transcripts.has(c.assetId)) continue;
    for (const [a, b] of input.silences?.get(c.assetId) ?? [])
      for (const range of onTimeline([c], c.assetId, a, b)) silences.push(range);
  }
  silences.sort((x, y) => x[0] - y[0]);
  const issues = analyze(words, silences, {
    minSilence: o.minSilence,
    keepPause: o.keepPause,
  }).filter((i) => i.kind !== "repeat");
  const byKey = new Map(words.map((w) => [w.key, w]));
  const pauseId = pauseIds(project, { transcripts: input.transcripts });
  for (const issue of issues) {
    if (issue.end - issue.start < 0.05 || inside(issue.start, issue.end)) continue;
    // A silence at the very edges of the voice is left to the export's own trim.
    const first = clips[0].start;
    const last = Math.max(...clips.map(clipEnd));
    if (
      issue.kind === "silence" &&
      (issue.start <= first + o.keepPause || issue.end >= last - o.keepPause)
    )
      continue;
    const text = issue.words
      .map((k) => byKey.get(k)?.text ?? "")
      .join(" ")
      .trim();
    const issueId =
      issue.kind === "filler" ? issue.id : pauseId(...(issue.span ?? [issue.start, issue.end]));
    items.push({
      kind: issue.kind === "filler" ? "filler" : "silence",
      start: round(issue.start),
      end: round(issue.end),
      ...(issueId ? { issueId } : {}),
      reason:
        issue.kind === "filler"
          ? `vício de fala${text ? `: "${quote(text)}"` : ""}`
          : `silêncio de ${(issue.end - issue.start + o.keepPause).toFixed(1)} s, fica uma pausa de ${o.keepPause.toFixed(2).replace(".", ",")} s`,
    });
  }
  return items.sort((a, b) => a.start - b.start);
}

/** How many items of each kind, and the seconds they would save. */
export function cleanupSummary(items: readonly VoiceCleanupItem[]): Record<
  VoiceCleanupKind,
  number
> & {
  seconds: number;
} {
  const count = { take: 0, retake: 0, filler: 0, silence: 0 };
  for (const i of items) count[i.kind]++;
  const seconds = mergeRanges(items.map((i): [number, number] => [i.start, i.end])).reduce(
    (sum, [a, b]) => sum + b - a,
    0,
  );
  return { ...count, seconds: round(seconds) };
}
