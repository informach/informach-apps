import type { Asset, Project } from "./types.ts";

/**
 * Undo history rules (state/project.ts). A snapshot keeps the user's edits; what the app learns
 * about the media later (thumbnails, proxies, transcripts, the cut-out video, a file gone
 * missing) is not an edit, so stepping through the history never takes it away. Everything
 * else, including the background removal settings themselves (`key`), goes back and forth.
 */
export const ASSET_RUNTIME_FIELDS = [
  "thumb",
  "waveform",
  "proxy",
  "proxyStatus",
  "transcript",
  "transcriptStatus",
  "keyed",
  "keyedId",
  "keyStatus",
  // The treated voice is a cache of the chosen preset (voicePreset is the edit).
  "treated",
  "treatStatus",
  "missing",
  "cursorMissing",
  // Written once by the recorder when a recording comes in.
  "cursor",
  "markers",
  "recording",
  "voiceTakes",
  "origin",
  // Where the screen stands still, learned in the background.
  "motion",
  "motionStatus",
  // The small pictures of the timeline.
  "filmstrip",
] as const satisfies readonly (keyof Asset)[];

type RuntimeField = (typeof ASSET_RUNTIME_FIELDS)[number];

function copyField<K extends RuntimeField>(to: Asset, from: Asset, key: K): void {
  if (from[key] === undefined) Reflect.deleteProperty(to, key);
  else to[key] = from[key];
}

/** `target` with the runtime fields of the media as they are in `live`. Unchanged parts are shared. */
export function withRuntimeOf(target: Project, live: Project): Project {
  const current = new Map(live.assets.map((a) => [a.id, a]));
  let changed = false;
  const assets = target.assets.map((a) => {
    const b = current.get(a.id);
    if (!b || b === a) return a;
    let next: Asset | null = null;
    for (const key of ASSET_RUNTIME_FIELDS) {
      if (a[key] === b[key]) continue;
      next ??= { ...a };
      copyField(next, b, key);
    }
    if (next) changed = true;
    return next ?? a;
  });
  return changed ? { ...target, assets } : target;
}

/**
 * The project an undo or redo shows: the snapshot's edits with the media as they are now, and
 * the measured editing time, last export, pending AI proposals and the voices sent to HeyGen of
 * the current state (an undo is not time travel for them). It changes the project, so it is
 * touched like any edit.
 */
export function restoreSnapshot(snapshot: Project, current: Project, now: number): Project {
  const out: Project = { ...withRuntimeOf(snapshot, current), updatedAt: now };
  if (current.stats) out.stats = current.stats;
  else delete out.stats;
  if (current.exportedAt !== undefined) out.exportedAt = current.exportedAt;
  else delete out.exportedAt;
  if (current.proposals) out.proposals = current.proposals;
  else delete out.proposals;
  // The files went to HeyGen: undoing an edit does not unsend them.
  if (current.voiceMasters) out.voiceMasters = current.voiceMasters;
  else delete out.voiceMasters;
  // Where "Preparar aula" stands and the seams approved are the review, not edits.
  if (current.prepare) out.prepare = current.prepare;
  else delete out.prepare;
  if (current.reviewedSeams) out.reviewedSeams = current.reviewedSeams;
  else delete out.reviewedSeams;
  if (current.templateOffer) out.templateOffer = current.templateOffer;
  else delete out.templateOffer;
  return out;
}

/* ----- Who made each step: the person or the AI ----- */

/**
 * Metadata of one undo step, parallel to `past`: `pastMeta[i]` describes the edit that turned
 * `past[i]` into the state after it.
 */
export interface HistoryEntry {
  origin: "user" | "ai";
  /** Commits carrying the same key while it is on top of the history make one step. */
  key?: string;
  /** Turn of the chat inside EdiAula; one Ctrl+Z takes back the turn's consecutive steps. */
  turn?: string;
  /** Conversation (the project's chat) the AI step belongs to. */
  conversation?: string;
  /** MCP grant of an AI app connected from outside. */
  client?: string;
}

export interface History {
  past: Project[];
  pastMeta: HistoryEntry[];
  future: Project[];
  futureMeta: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], pastMeta: [], future: [], futureMeta: [] });

/**
 * Records a commit made over `previous`. It joins the step on top only when both carry the
 * same key (one AI tool call, one manual group): an edit by someone else in between is a step
 * of its own and breaks the joining.
 */
export function pushCommit(
  history: History,
  previous: Project,
  entry: HistoryEntry,
  limit: number,
): History {
  const top = history.pastMeta[history.pastMeta.length - 1];
  if (entry.key !== undefined && top?.key === entry.key && history.past.length)
    return { ...history, future: [], futureMeta: [] };
  return {
    past: [...history.past, previous].slice(-limit),
    pastMeta: [...history.pastMeta, entry].slice(-limit),
    future: [],
    futureMeta: [],
  };
}

const sameTurn = (a: HistoryEntry | undefined, b: HistoryEntry | undefined): boolean =>
  !!a?.turn && a.origin === "ai" && b?.origin === "ai" && a.turn === b.turn;

/** Steps one Ctrl+Z takes back: the whole AI turn on top, or a single step. */
export function undoSpan(history: History): number {
  const meta = history.pastMeta;
  let n = meta.length ? 1 : 0;
  while (n < meta.length && sameTurn(meta[meta.length - 1], meta[meta.length - 1 - n])) n++;
  return Math.min(n, history.past.length);
}

/** Steps one redo brings back, the same way. */
export function redoSpan(history: History): number {
  const meta = history.futureMeta;
  let n = meta.length ? 1 : 0;
  while (n < meta.length && sameTurn(meta[0], meta[n])) n++;
  return Math.min(n, history.future.length);
}

/** Takes back the `n` steps on top: shows the oldest snapshot, the rest can be redone in order. */
export function undoSteps(
  history: History,
  current: Project,
  n: number,
  now: number,
): { history: History; project: Project } | null {
  const k = history.past.length;
  const count = Math.min(n, k);
  if (count <= 0) return null;
  const states = [...history.past.slice(k - count), current];
  return {
    project: restoreSnapshot(states[0], current, now),
    history: {
      past: history.past.slice(0, k - count),
      pastMeta: history.pastMeta.slice(0, k - count),
      future: [...states.slice(1), ...history.future],
      futureMeta: [...history.pastMeta.slice(k - count), ...history.futureMeta],
    },
  };
}

export function redoSteps(
  history: History,
  current: Project,
  n: number,
  now: number,
): { history: History; project: Project } | null {
  const count = Math.min(n, history.future.length);
  if (count <= 0) return null;
  const states = history.future.slice(0, count);
  return {
    project: restoreSnapshot(states[count - 1], current, now),
    history: {
      past: [...history.past, current, ...states.slice(0, count - 1)],
      pastMeta: [...history.pastMeta, ...history.futureMeta.slice(0, count)],
      future: history.future.slice(count),
      futureMeta: history.futureMeta.slice(count),
    },
  };
}

/**
 * How many steps on top the AI may take back with its undo tool: only its own (`mine`), up to
 * `steps`. Zero when the latest edit is the person's.
 */
export function aiUndoCount(
  history: History,
  mine: (entry: HistoryEntry) => boolean,
  steps: number,
): number {
  let n = 0;
  const meta = history.pastMeta;
  while (n < steps && n < history.past.length) {
    const entry = meta[meta.length - 1 - n];
    if (entry?.origin !== "ai" || !mine(entry)) break;
    n++;
  }
  return n;
}

/** A turn of the chat inside EdiAula, tied to the project it started in. */
export interface AiTurn {
  id: string;
  projectId: string;
}

/** Ends `turn` if it is the one open; ending it twice, or after a newer one began, does nothing. */
export const closeTurn = (open: AiTurn | null, turn: AiTurn | null): AiTurn | null =>
  open && turn && open.id === turn.id ? null : open;

/** A redrawn picture can come out another size (drawn for the lesson's format of now). */
export type RelinkChanges = Partial<Pick<Asset, "path" | "size" | "cursor" | "width" | "height">>;

/**
 * A media file (or the cursor data next to it) found again somewhere else: every snapshot that
 * still points at the old place gets the new one, so undoing never brings the broken link back.
 */
export function relinkIn(p: Project, before: Asset, changes: RelinkChanges): Project {
  const { path, size, cursor, width, height } = changes;
  let changed = false;
  const assets = p.assets.map((a) => {
    if (a.id !== before.id) return a;
    const movesPath = path !== undefined && a.path === before.path;
    const movesCursor = cursor !== undefined && a.cursor === before.cursor;
    if (!movesPath && !movesCursor) return a;
    changed = true;
    const next: Asset = { ...a };
    if (movesPath) {
      next.path = path;
      if (size !== undefined) next.size = size;
      if (width !== undefined && height !== undefined) {
        next.width = width;
        next.height = height;
      }
      delete next.missing;
    }
    if (movesCursor) {
      next.cursor = cursor;
      delete next.cursorMissing;
    }
    return next;
  });
  return changed ? { ...p, assets } : p;
}
