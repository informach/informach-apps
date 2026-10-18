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
  /** The cleanup suggestion it comes from (Issue.id): left out, it is kept from then on. */
  issueId?: string;
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
  /**
   * Who made it ("assistente", "gravacao", "cliente:<grant>"). A new proposal replaces only an
   * earlier one of the same author, never someone else's.
   */
  by?: string;
  items: ProposalItem[];
}

/** What a project keeps of its pending proposals. */
export type StoredProposal = Proposal;

/** Items kept per project, so the project always fits in one save. */
export const PROPOSAL_ITEM_LIMIT = 2000;
/** Pending proposals kept per project. */
export const PROPOSAL_LIMIT = 20;
/** Media stretches per item; a longer one is split into several items. */
export const MAX_ANCHORS = 256;
/** Word keys per item; a longer quote keeps only its anchors and its text. */
export const MAX_WORD_KEYS = 5000;

/** Source-time tolerance when checking that a clip still holds a stretch. */
const EPS = 1e-3;
/** Timeline tolerance for clips that should still line up. */
const SAME = 0.02;
/** A gap between the pieces of an item that did not exist before is more than this. */
const GAP = 0.05;
/** The quoted text only counts this close (in the media's own seconds) to where it was. */
const TEXT_NEAR = 1.5;

const timed = (c: Clip, assets: Map<string, Asset>): boolean => {
  const kind = assets.get(c.assetId)?.kind;
  return (kind === "video" || kind === "audio") && !c.annotation && !c.zoomLayer;
};

/** Pieces of the same media that still follow each other, in the media and on the timeline. */
const continues = (prev: Clip, next: Clip): boolean =>
  next.assetId === prev.assetId &&
  next.trackId === prev.trackId &&
  Math.abs(next.in - sourceEnd(prev)) <= EPS &&
  Math.abs(next.start - clipEnd(prev)) <= SAME;

/**
 * The stretches of media under the timeline range [s, e], on one track: the one that covers
 * most of the range among `prefer` (the tracks cuts apply to, or the track the quoted words
 * are on), transcribed media first, then the lowest in the stack (the main recording). Pieces
 * of a clip split without removing anything become one stretch.
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
  const spans: SourceSpan[] = [];
  let prev: Clip | null = null;
  for (const c of (byTrack.get(best.track) ?? []).sort((a, b) => a.start - b.start)) {
    const from = Math.max(s, c.start);
    const to = Math.min(e, clipEnd(c));
    const last = spans[spans.length - 1];
    if (last && prev && continues(prev, c)) {
      last.end = sourceAt(c, to);
      last.until = to;
    } else
      spans.push({
        clipId: c.id,
        assetId: c.assetId,
        trackId: c.trackId,
        start: sourceAt(c, from),
        end: sourceAt(c, to),
        at: from,
        until: to,
      });
    prev = c;
  }
  return spans;
}

interface Chain {
  first: Clip;
  last: Clip;
}

/**
 * The clips of a stretch's media that hold it end to end: one clip, or pieces that still follow
 * each other (a clip split with nothing removed in between).
 */
function chains(project: Project, span: SourceSpan): Chain[] {
  const clips = project.clips.filter((c) => c.assetId === span.assetId);
  const out: Chain[] = [];
  for (const first of clips) {
    if (!(first.in <= span.start + EPS && sourceEnd(first) > span.start + EPS)) continue;
    let last = first;
    for (let guard = 0; sourceEnd(last) < span.end - EPS && guard < clips.length; guard++) {
      const next = clips.find((n) => continues(last, n));
      if (!next) break;
      last = next;
    }
    if (sourceEnd(last) >= span.end - EPS) out.push({ first, last });
  }
  return out;
}

const place = (chain: Chain, span: SourceSpan): [number, number] => [
  Math.max(chain.first.start, timelineAt(chain.first, span.start)),
  Math.min(clipEnd(chain.last), timelineAt(chain.last, span.end)),
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
 * Where the anchored stretches are on the timeline now. Each stretch is looked for through its
 * own clip first (and the pieces that follow it, if it was split); when that clip no longer
 * holds it, through another copy of the media, on the same track first. Null when no clip holds
 * a stretch any more, or when copies of the take at different places leave the choice open.
 */
export function toTimeline(
  project: Project,
  spans: SourceSpan[],
  hint?: number,
): [number, number] | null {
  if (!spans.length) return null;
  const pieces: [number, number][] = [];
  for (const span of spans) {
    const all = chains(project, span);
    if (!all.length) return null;
    const own = all.filter((chain) => chain.first.id === span.clipId);
    if (own.length === 1) {
      pieces.push(place(own[0], span));
      continue;
    }
    const same = all.filter((chain) => chain.first.trackId === span.trackId);
    const found = onePlace(
      (same.length ? same : all).map((chain) => place(chain, span)),
      span.at ?? hint,
    );
    if (!found) return null;
    pieces.push(found);
  }
  return joined(spans, pieces);
}

const keyAsset = (key: string): string => key.slice(0, key.lastIndexOf(":"));

/**
 * The timeline range of the words with these keys, in order and next to each other. The keys
 * must belong to the item's media (`assets`). A take copied twice holds the same keys twice:
 * the copy in the item's own clips wins, otherwise the choice is left open (null).
 */
export function fromWordKeys(
  words: TimelineWord[],
  keys: string[],
  ownClips: Set<string> = new Set(),
  assets: Set<string> = new Set(),
): [number, number] | null {
  if (!keys.length) return null;
  if (assets.size && !keys.every((key) => assets.has(keyAsset(key)))) return null;
  const runs: number[] = [];
  words.forEach((w, i) => {
    if (w.key === keys[0] && keys.every((k, j) => words[i + j]?.key === k)) runs.push(i);
  });
  const own = runs.filter((i) => ownClips.has(words[i].clipId));
  const pick = runs.length === 1 ? runs[0] : own.length === 1 ? own[0] : undefined;
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
 * The quoted text found again, but only where the item was: in the same media and within
 * TEXT_NEAR seconds of its anchors, even when the text occurs once. The same words in another
 * take are another passage, never this one.
 */
function quoteNearAnchors(
  project: Project,
  words: TimelineWord[],
  item: ProposalItem,
): [number, number] | null {
  if (!item.text || !item.anchors.length) return null;
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const near = findQuote(words, item.text).filter(([a]) => {
    const clip = clips.get(words[a].clipId);
    if (!clip) return false;
    const at = sourceAt(clip, words[a].start);
    return item.anchors.some(
      (anchor) => anchor.assetId === clip.assetId && Math.abs(at - anchor.start) <= TEXT_NEAR,
    );
  });
  return near.length === 1 ? wordsRange(words, near[0][0], near[0][1]) : null;
}

/**
 * Where an item is now: by its anchors in the media, then by its word keys, then by its text
 * near the anchors. Without `words` (nothing loaded yet) only the anchors are tried. Null when
 * the item cannot be found any more: it is left out, never guessed.
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
    const byKeys = fromWordKeys(
      words,
      item.wordKeys,
      new Set(item.anchors.map((a) => a.clipId)),
      new Set(item.anchors.map((a) => a.assetId)),
    );
    if (byKeys) return byKeys;
  }
  return quoteNearAnchors(project, words, item);
}

/**
 * The items for one suggested cut, anchored in the media. A range over more than MAX_ANCHORS
 * stretches is split into several items (time only); a quote with more than MAX_WORD_KEYS words
 * keeps only its anchors and text. Empty when there is no video or audio under the range.
 */
export function buildItems(
  project: Project,
  range: [number, number],
  prefer: Set<string> | undefined,
  base: { reason: string; text?: string; near?: number; wordKeys?: string[]; issueId?: string },
  newId: () => string,
): ProposalItem[] {
  const anchors = toSource(project, range, prefer);
  if (!anchors.length) return [];
  if (anchors.length <= MAX_ANCHORS) {
    const keys = base.wordKeys && base.wordKeys.length <= MAX_WORD_KEYS ? base.wordKeys : undefined;
    return [
      {
        id: newId(),
        start: range[0],
        end: range[1],
        reason: base.reason,
        anchors,
        status: "pending",
        ...(base.text !== undefined ? { text: base.text } : {}),
        ...(base.near !== undefined ? { near: base.near } : {}),
        ...(keys ? { wordKeys: keys } : {}),
        ...(base.issueId ? { issueId: base.issueId } : {}),
      },
    ];
  }
  const out: ProposalItem[] = [];
  for (let i = 0; i < anchors.length; i += MAX_ANCHORS) {
    const part = anchors.slice(i, i + MAX_ANCHORS);
    const lastPart = i + MAX_ANCHORS >= anchors.length;
    out.push({
      id: newId(),
      start: i === 0 ? range[0] : (part[0].at ?? range[0]),
      end: lastPart ? range[1] : (part[part.length - 1].until ?? range[1]),
      reason: base.reason,
      anchors: part,
      status: "pending",
      ...(base.issueId ? { issueId: base.issueId } : {}),
    });
  }
  return out;
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

/**
 * The pending proposals after `next` arrives: it replaces an earlier one of the same author and
 * keeps the others, the oldest dropped first to stay within PROPOSAL_LIMIT and
 * PROPOSAL_ITEM_LIMIT.
 */
export function withProposal(list: readonly Proposal[], next: Proposal): Proposal[] {
  const out = [...list.filter((p) => p.by !== next.by), next];
  const total = (ps: Proposal[]): number => ps.reduce((n, p) => n + p.items.length, 0);
  while (out.length > 1 && (out.length > PROPOSAL_LIMIT || total(out) > PROPOSAL_ITEM_LIMIT))
    out.shift();
  return out;
}
