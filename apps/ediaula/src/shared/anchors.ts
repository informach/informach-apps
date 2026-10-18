import { findQuote, type TimelineWord, wordsRange } from "./cleanup.ts";
import { clipEnd, sourceAt, sourceEnd, timelineAt } from "./timeline.ts";
import type { Asset, Clip, Project } from "./types.ts";

/**
 * AI proposals point at the media, not at timeline seconds: a stretch of a recording stays the
 * same stretch however the lesson is cut around it. An item keeps where it is in the media
 * (anchors), which transcript words it covers (keys "asset:index", as in TimelineWord.key) and
 * the quoted text, and is placed again in that order before it is shown or applied.
 */

/** A stretch of a media file, in its own seconds, as seen through one clip. */
export interface SourceSpan {
  clipId: string;
  assetId: string;
  trackId?: string;
  /** Source seconds. */
  start: number;
  end: number;
  /** Where it was on the timeline when anchored, to tell a gap that was there from a new one. */
  at?: number;
  until?: number;
}

export type ProposalItemStatus = "pending" | "rejected";

export interface ProposalItem {
  id: string;
  /** Timeline range when the proposal was made: the last known place, used as a hint. */
  start: number;
  end: number;
  reason: string;
  /** Quoted words, the last way to find the item again. */
  text?: string;
  near?: number;
  anchors: SourceSpan[];
  /** Transcript words the item covers ("asset:index"). */
  wordKeys?: string[];
  /** The person can leave an item out before applying. */
  status: ProposalItemStatus;
}

export interface Proposal {
  id: string;
  /** The project it was made for: it is never applied to another one. */
  projectId: string;
  title: string;
  /** Project revision it was made at (informative). */
  revision: number;
  createdAt: number;
  items: ProposalItem[];
}

/** What a project keeps of its pending proposals. */
export type StoredProposal = Proposal;

/** Items kept per project, so the project always fits in one save. */
export const PROPOSAL_ITEM_LIMIT = 2000;

/** Source-time tolerance when checking that a clip still holds a stretch. */
const EPS = 1e-3;
/** Timeline tolerance for clips that should still line up. */
const SAME = 0.02;
/** A gap between the pieces of an item that did not exist before is more than this. */
const GAP = 0.05;

const timed = (c: Clip, assets: Map<string, Asset>): boolean => {
  const kind = assets.get(c.assetId)?.kind;
  return (kind === "video" || kind === "audio") && !c.annotation && !c.zoomLayer;
};

/**
 * The stretches of media under the timeline range [s, e], on one track: the one that covers
 * most of the range among `prefer` (the tracks cuts apply to, or the track the quoted words
 * are on), transcribed media first, then the lowest in the stack (the main recording).
 */
export function toSource(
  project: Project,
  range: [number, number],
  prefer?: Set<string>,
): SourceSpan[] {
  const [s, e] = range;
  if (!(e > s)) return [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const under = project.clips.filter(
    (c) => timed(c, assets) && c.start < e - 1e-6 && clipEnd(c) > s + 1e-6,
  );
  const preferred = prefer?.size ? under.filter((c) => prefer.has(c.trackId)) : [];
  const pool = preferred.length ? preferred : under;
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  const byTrack = new Map<string, Clip[]>();
  for (const c of pool) byTrack.set(c.trackId, [...(byTrack.get(c.trackId) ?? []), c]);
  let best: { track: string; cover: number; spoken: boolean; rank: number } | null = null;
  for (const [track, clips] of byTrack) {
    const cover =
      Math.round(
        clips.reduce((sum, c) => sum + Math.min(e, clipEnd(c)) - Math.max(s, c.start), 0) * 1000,
      ) / 1000;
    const spoken = clips.some((c) => !!assets.get(c.assetId)?.transcript);
    const rank = order.get(track) ?? -1;
    if (
      !best ||
      cover > best.cover ||
      (cover === best.cover && spoken && !best.spoken) ||
      (cover === best.cover && spoken === best.spoken && rank > best.rank)
    )
      best = { track, cover, spoken, rank };
  }
  if (!best) return [];
  return (byTrack.get(best.track) ?? [])
    .sort((a, b) => a.start - b.start)
    .map((c) => {
      const from = Math.max(s, c.start);
      const to = Math.min(e, clipEnd(c));
      return {
        clipId: c.id,
        assetId: c.assetId,
        trackId: c.trackId,
        start: sourceAt(c, from),
        end: sourceAt(c, to),
        at: from,
        until: to,
      };
    });
}

const covers = (c: Clip, span: SourceSpan): boolean =>
  c.assetId === span.assetId && c.in <= span.start + EPS && sourceEnd(c) >= span.end - EPS;

const place = (c: Clip, span: SourceSpan): [number, number] => [
  Math.max(c.start, timelineAt(c, span.start)),
  Math.min(clipEnd(c), timelineAt(c, span.end)),
];

/**
 * The one place among `ranges` (the same stretch through several clips): they all agree (the
 * same media on a video and an audio track), or one is clearly the nearest to the last known
 * place. Copies of a take at different places with no clear choice give null.
 */
function onePlace(ranges: [number, number][], hint?: number): [number, number] | null {
  if (!ranges.length) return null;
  if (ranges.every((r) => Math.abs(r[0] - ranges[0][0]) <= SAME)) return ranges[0];
  if (hint === undefined) return null;
  const sorted = [...ranges].sort((a, b) => Math.abs(a[0] - hint) - Math.abs(b[0] - hint));
  const nearest = Math.abs(sorted[0][0] - hint);
  const next = Math.abs(sorted[1][0] - hint);
  return next - nearest > 1 && next > 2 * nearest ? sorted[0] : null;
}

/** The pieces in order, joined into one range when they still sit as they did. */
function joined(spans: SourceSpan[], ranges: [number, number][]): [number, number] | null {
  for (let i = 1; i < ranges.length; i++) {
    const before = spans[i - 1];
    const after = spans[i];
    const then = before.until !== undefined && after.at !== undefined ? after.at - before.until : 0;
    const now = ranges[i][0] - ranges[i - 1][1];
    if (now < -SAME || Math.abs(now - then) > GAP) return null;
  }
  return [ranges[0][0], ranges[ranges.length - 1][1]];
}

/**
 * Where the anchored stretches are on the timeline now. Each stretch is looked for in its own
 * clip first; when that clip was cut or replaced, in a copy of the media that holds every
 * stretch, then in a copy that holds it alone, on the same track first. Null when no clip holds
 * them any more, or when copies of the take at different places leave the choice open.
 */
export function toTimeline(
  project: Project,
  spans: SourceSpan[],
  hint?: number,
): [number, number] | null {
  if (!spans.length) return null;
  const byId = new Map(project.clips.map((c) => [c.id, c]));
  const own = spans.map((span) => {
    const c = byId.get(span.clipId);
    return c && covers(c, span) ? place(c, span) : null;
  });
  if (own.every((r) => r)) return joined(spans, own as [number, number][]);

  const onTrack = (clips: Clip[], span: SourceSpan): Clip[] => {
    const same = clips.filter((c) => c.trackId === span.trackId);
    return same.length ? same : clips;
  };
  // One copy of the media holding every stretch.
  if (new Set(spans.map((span) => span.assetId)).size === 1) {
    const copies = onTrack(
      project.clips.filter((c) => spans.every((span) => covers(c, span))),
      spans[0],
    );
    const ranges = copies
      .map((c) =>
        joined(
          spans,
          spans.map((span) => place(c, span)),
        ),
      )
      .filter((r): r is [number, number] => !!r);
    const found = onePlace(ranges, hint);
    if (found) return found;
  }

  // Each stretch in a copy of its own (the pieces of a clip cut in two).
  const pieces: [number, number][] = [];
  for (const [i, span] of spans.entries()) {
    const known = own[i];
    if (known) {
      pieces.push(known);
      continue;
    }
    const copies = onTrack(
      project.clips.filter((c) => covers(c, span)),
      span,
    );
    const found = onePlace(
      copies.map((c) => place(c, span)),
      span.at ?? hint,
    );
    if (!found) return null;
    pieces.push(found);
  }
  return joined(spans, pieces);
}

/**
 * The timeline range of the words with these keys, in order and next to each other. A take
 * copied twice holds the same keys twice: the copy in the item's own clips wins, otherwise
 * the choice is left open (null).
 */
export function fromWordKeys(
  words: TimelineWord[],
  keys: string[],
  ownClips: Set<string> = new Set(),
): [number, number] | null {
  if (!keys.length) return null;
  const runs: number[] = [];
  words.forEach((w, i) => {
    if (w.key === keys[0] && keys.every((k, j) => words[i + j]?.key === k)) runs.push(i);
  });
  const pick =
    runs.length === 1
      ? runs[0]
      : runs.filter((i) => ownClips.has(words[i].clipId)).length === 1
        ? runs.find((i) => ownClips.has(words[i].clipId))
        : undefined;
  return pick === undefined ? null : wordsRange(words, pick, pick + keys.length - 1);
}

/** Word indexes of a quoted passage: the only occurrence, or the one nearest to `near`. */
export function quoteIndexes(
  words: TimelineWord[],
  text: string,
  near?: number,
): [number, number] | null {
  const found = findQuote(words, text);
  if (!found.length || (found.length > 1 && near === undefined)) return null;
  return near === undefined
    ? found[0]
    : found.reduce((b, c) =>
        Math.abs(words[c[0]].start - near) < Math.abs(words[b[0]].start - near) ? c : b,
      );
}

/** Timeline range of a quoted passage, extended into the pauses around it. */
export function locateQuote(
  words: TimelineWord[],
  text: string,
  near?: number,
): [number, number] | null {
  const idx = quoteIndexes(words, text, near);
  return idx ? wordsRange(words, idx[0], idx[1]) : null;
}

/**
 * Where an item is now: by its anchors in the media, then by its word keys, then by its text.
 * Without `words` (nothing loaded yet) only the anchors are tried.
 */
export function locateItem(
  project: Project,
  item: ProposalItem,
  words?: TimelineWord[],
): [number, number] | null {
  const anchored = toTimeline(project, item.anchors, item.start);
  if (anchored) return anchored;
  if (!words) return null;
  if (item.wordKeys?.length) {
    const byKeys = fromWordKeys(words, item.wordKeys, new Set(item.anchors.map((a) => a.clipId)));
    if (byKeys) return byKeys;
  }
  return item.text ? locateQuote(words, item.text, item.near) : null;
}

/** A proposal applies only to the project it was made for, and only with something left in it. */
export const canApply = (proposal: Proposal | null | undefined, project: Project | null): boolean =>
  !!proposal &&
  !!project &&
  proposal.projectId === project.id &&
  proposal.items.some((item) => item.status === "pending");

/** The proposal waiting for the person in a project (the latest one). */
export const activeProposal = (project: Project | null): Proposal | null =>
  project?.proposals?.length ? project.proposals[project.proposals.length - 1] : null;
