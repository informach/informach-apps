import type { TimelineWord } from "./cleanup.ts";
import { AVATAR_FADE, defaultTransformFor, placementTransform } from "./compose.ts";
import type { ScriptSection, SpeechItem } from "./script.ts";
import { type Alignment, alignSection } from "./scriptAlign.ts";
import { clipEnd, newId, newTrackName, sourceEnd, splitClip } from "./timeline.ts";
import type { Asset, Clip, Project, Track, Transcript } from "./types.ts";

/**
 * Avatar inserts from the script (F1P1-D01…): the avatar's line is found in a transcribed media
 * (the HeyGen render) and placed between the narration line before it and the one after it.
 * Rule from the scripts: the avatar enters, speaks and leaves before the next answer, without
 * voices overlapping. When the recorded pause is too short, the timeline is opened there.
 */

/** Silence kept before and after the avatar's line. */
export const INSERT_PAD = 0.25;

export interface InsertSource {
  assetId: string;
  /** Span of the line in the source file, seconds. */
  start: number;
  end: number;
}

/** Finds `line` in the transcripts (source time); at least 60% of its words in order. */
export function findLine(
  line: string,
  transcripts: Map<string, Transcript>,
  exclude: Set<string> = new Set(),
): InsertSource | null {
  const section: ScriptSection = {
    number: "",
    title: "",
    items: [{ kind: "speech", speaker: "", avatar: true, text: line }],
  };
  let best: (InsertSource & { score: number }) | null = null;
  for (const [assetId, tr] of transcripts) {
    if (exclude.has(assetId)) continue;
    const words: TimelineWord[] = tr.words.map((w, i) => ({
      key: `${assetId}:${i}`,
      clipId: "",
      text: w.text,
      start: w.start,
      end: w.end,
      p: w.p,
    }));
    const m = alignSection(section, words).lines[0];
    if (!m || m.start === undefined || m.end === undefined) continue;
    const score = m.matched / Math.max(1, m.total);
    // A line found spread over minutes is a coincidence of common words, not the line.
    if (score >= 0.6 && m.end - m.start < m.total * 1.2 + 2 && (!best || score > best.score))
      best = { assetId, start: m.start, end: m.end, score };
  }
  return best && { assetId: best.assetId, start: best.start, end: best.end };
}

export interface InsertPlan {
  /** Timeline time where the avatar clip starts. */
  at: number;
  /** Length of the avatar clip on the timeline. */
  duration: number;
  /** Seconds to open in the timeline at `cut` (0 when the recorded pause is long enough). */
  gap: number;
  cut: number;
}

/**
 * Where the avatar line `item` of `section` goes, given the current alignment: right after the
 * previous narration line ends, needing `lineSeconds` plus padding before the next line starts.
 */
export function planInsert(
  section: ScriptSection,
  alignment: Alignment,
  item: SpeechItem,
  lineSeconds: number,
): InsertPlan | { error: string } {
  const idx = section.items.indexOf(item);
  const placed = alignment.lines.filter(
    (l) => l.start !== undefined && l.matched / Math.max(1, l.total) >= 0.5,
  );
  const before = [...placed]
    .reverse()
    .find((l) => l.item < idx && !(section.items[l.item] as SpeechItem).avatar);
  const after = placed.find((l) => l.item > idx && !(section.items[l.item] as SpeechItem).avatar);
  if (!before && !after)
    return {
      error:
        "Não achei na gravação as falas em volta desta inserção. Transcreva a narração primeiro.",
    };
  const duration = lineSeconds + 2 * INSERT_PAD;
  if (!before) {
    const at = Math.max(0, after!.start! - duration);
    return { at, duration, gap: Math.max(0, duration - after!.start!), cut: 0 };
  }
  const prevEnd = before.end!;
  const nextStart = after?.start ?? Infinity;
  const pause = nextStart - prevEnd;
  const gap = Math.max(0, duration - pause);
  // Open the timeline in the middle of the existing pause, never inside a word.
  const cut = gap > 0 ? prevEnd + Math.min(0.15, pause / 2) : prevEnd;
  return { at: gap > 0 ? cut : prevEnd, duration, gap, cut };
}

/**
 * Opens `gap` seconds at time `t` on `tracks`: clips crossing `t` are split and everything after
 * moves right. Clips on other tracks only move if they start after `t` (a music bed underneath
 * keeps playing). Clips on `locked` tracks never move nor split; every one still playing after
 * `t` comes back in `blocked`, since opening the timeline there would pull the rest out of sync
 * with it (callers do not apply the result then).
 * Returns the clips and the ids of clips that were split (left parts).
 */
export function openGap(
  clips: Clip[],
  t: number,
  gap: number,
  tracks: Set<string>,
  locked: Set<string> = new Set(),
): { clips: Clip[]; split: Clip[]; blocked: Clip[] } {
  const out: Clip[] = [];
  const split: Clip[] = [];
  const blocked: Clip[] = [];
  for (const c of clips) {
    if (locked.has(c.trackId)) {
      if (clipEnd(c) > t + 1e-6) blocked.push(c);
      out.push(c);
    } else if (c.start >= t - 1e-6) out.push({ ...c, start: c.start + gap });
    else if (tracks.has(c.trackId) && clipEnd(c) > t + 1e-6) {
      const parts = splitClip(c, t);
      if (parts) {
        out.push(parts[0], { ...parts[1], start: parts[1].start + gap });
        split.push(parts[0]);
      } else out.push(c);
    } else out.push(c);
  }
  return { clips: out, split, blocked };
}

/** A clip of the avatar line, to be placed with the avatar's default placement and fades. */
export function insertClip(
  src: InsertSource,
  trackId: string,
  plan: InsertPlan,
  insertId?: string,
): Clip {
  return {
    id: newId("c"),
    assetId: src.assetId,
    trackId,
    start: plan.at,
    in: Math.max(0, src.start - INSERT_PAD),
    duration: plan.duration,
    volume: 1,
    ...(insertId ? { insertId } : {}),
  };
}

/** An avatar line found in a media and planned on the current alignment. */
export interface InsertEntry {
  item: SpeechItem;
  src: InsertSource;
  plan: InsertPlan;
}

/**
 * Plans several avatar lines on one alignment of the recording as it is now. Two lines that
 * would land in the same pause are not planned together: the later one comes back as an error.
 */
export function planInserts(
  section: ScriptSection,
  alignment: Alignment,
  found: { item: SpeechItem; src: InsertSource }[],
): { entries: InsertEntry[]; errors: { item: SpeechItem; error: string }[] } {
  const entries: InsertEntry[] = [];
  const errors: { item: SpeechItem; error: string }[] = [];
  for (const { item, src } of found) {
    const plan = planInsert(section, alignment, item, src.end - src.start);
    if ("error" in plan) errors.push({ item, error: plan.error });
    else entries.push({ item, src, plan });
  }
  entries.sort((a, b) => a.plan.at - b.plan.at);
  const out: InsertEntry[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (prev && e.plan.at < prev.plan.at + prev.plan.duration - 1e-3)
      errors.push({
        item: e.item,
        error: `cairia no mesmo lugar que ${prev.item.insertId ?? `"${prev.item.text}"`}; encaixe uma de cada vez.`,
      });
    else out.push(e);
  }
  return { entries: out, errors };
}

/** Clips on locked tracks that opening the timeline for `plan` would leave out of sync. */
export const lockedAfter = (clips: Clip[], plan: InsertPlan, locked: Set<string>): Clip[] =>
  plan.gap > 0 ? clips.filter((c) => locked.has(c.trackId) && clipEnd(c) > plan.cut + 1e-6) : [];

/** A still frame's key: the media and the second of it the screen holds on while a gap is open. */
export const stillKey = (left: Pick<Clip, "assetId" | "in" | "duration" | "speed">): string =>
  `${left.assetId}@${sourceEnd(left).toFixed(3)}`;

export interface InsertLayout {
  clips: Clip[];
  tracks: Track[];
  /** Still frames put in to hold the screen while a gap is open. */
  assets: Asset[];
  placed: { entry: InsertEntry; clip: Clip }[];
  /** Screen video clips split to open a gap for an entry: each wants a still frame (stillKey). */
  splits: { entry: InsertEntry; left: Clip }[];
}

/**
 * Lays out planned inserts in one go, from the end of the lesson to the start: opening the
 * timeline for a later line never moves the place of an earlier one, and each earlier gap then
 * carries everything after it (inserts already placed too) along. Each split screen video gets
 * the still frame `stills` holds for it (by stillKey); without one the gap shows what is below.
 * Every avatar goes on a free video track above everything on screen while it plays (a new one
 * on top if there is none), beside the content, with a short dissolve. Plans that would move a
 * locked track (lockedAfter) are not to be passed in.
 */
export function layoutInserts(
  project: Project,
  entries: InsertEntry[],
  targets: Set<string>,
  locked: Set<string>,
  stills: ReadonlyMap<string, Asset> = new Map(),
): InsertLayout {
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  let clips = project.clips;
  let tracks = project.tracks;
  const assets: Asset[] = [];
  const placed: InsertLayout["placed"] = [];
  const splits: InsertLayout["splits"] = [];
  const latestFirst = [...entries].sort((a, b) => b.plan.cut - a.plan.cut || b.plan.at - a.plan.at);
  for (const entry of latestFirst) {
    const { plan, src, item } = entry;
    if (plan.gap > 0) {
      const opened = openGap(clips, plan.cut, plan.gap, targets, locked);
      clips = opened.clips;
      for (const left of opened.split) {
        const a = assetById.get(left.assetId);
        const track = tracks.find((t) => t.id === left.trackId);
        if (a?.kind !== "video" || a.key || track?.kind !== "video") continue;
        splits.push({ entry, left });
        const still = stills.get(stillKey(left));
        if (!still) continue;
        if (!assets.includes(still)) assets.push(still);
        clips = [
          ...clips,
          {
            id: newId("c"),
            assetId: still.id,
            trackId: left.trackId,
            start: plan.cut,
            in: 0,
            duration: plan.gap,
            volume: 1,
            ...(left.transform ? { transform: left.transform } : {}),
          },
        ];
      }
    }
    const end = plan.at + plan.duration;
    const during = clips.filter((c) => c.start < end - 1e-3 && clipEnd(c) > plan.at + 1e-3);
    const busyTracks = new Set(during.map((c) => c.trackId));
    const highestBusy = tracks.findIndex((t) => t.kind === "video" && busyTracks.has(t.id));
    let track = tracks
      .slice(0, highestBusy < 0 ? tracks.length : highestBusy)
      .find((t) => t.kind === "video" && !t.locked);
    if (!track) {
      track = {
        id: newId("t"),
        kind: "video",
        name: newTrackName(tracks),
        muted: false,
        hidden: false,
        locked: false,
      } satisfies Track;
      tracks = [track, ...tracks];
    }
    const clip = insertClip(src, track.id, plan, item.insertId);
    const asset = assetById.get(src.assetId);
    // Another avatar already standing on the right (the narrator) pushes this one to the left.
    const rightTaken = during.some(
      (c) => c.transform && c.transform.x > 0.5 && c.transform.scale < 1.5,
    );
    const transform = !asset
      ? undefined
      : asset.height > asset.width || asset.screen
        ? placementTransform(rightTaken ? "left" : "right")
        : defaultTransformFor(asset, project.settings);
    Object.assign(
      clip,
      { fadeIn: AVATAR_FADE, fadeOut: AVATAR_FADE },
      transform ? { transform } : {},
    );
    clips = [...clips, clip];
    placed.push({ entry, clip });
  }
  // Earlier gaps moved the clips placed before them: each is reported where it ended up.
  const final = new Map(clips.map((c) => [c.id, c]));
  return {
    clips,
    tracks,
    assets,
    placed: placed.reverse().map((p) => ({ entry: p.entry, clip: final.get(p.clip.id) ?? p.clip })),
    splits,
  };
}

/**
 * Words of another voice the avatar would talk over once its line is placed: what is said
 * (other than by an avatar) while the avatar speaks, after the timeline opened for it. The
 * script rule is that the avatar enters, speaks and leaves without overlapping anyone.
 */
export function voiceOverlaps(
  words: TimelineWord[],
  entries: InsertEntry[],
): { entry: InsertEntry; words: TimelineWord[] }[] {
  const out: { entry: InsertEntry; words: TimelineWord[] }[] = [];
  for (const entry of entries) {
    const { plan } = entry;
    const from = plan.at + INSERT_PAD;
    const to = plan.at + plan.duration - INSERT_PAD;
    const shift = (t: number): number => (plan.gap > 0 && t >= plan.cut - 1e-6 ? t + plan.gap : t);
    const over = words.filter(
      (w) => w.role !== "avatar" && shift(w.start) < to - 0.02 && shift(w.end) > from + 0.02,
    );
    if (over.length) out.push({ entry, words: over });
  }
  return out;
}
