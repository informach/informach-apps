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
  "missing",
  // Written once by the recorder when a recording comes in.
  "cursor",
  "markers",
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
 * the measured editing time and last export of the current state (an undo is not time travel
 * for them). It changes the project, so it is touched like any edit.
 */
export function restoreSnapshot(snapshot: Project, current: Project, now: number): Project {
  const out: Project = { ...withRuntimeOf(snapshot, current), updatedAt: now };
  if (current.stats) out.stats = current.stats;
  else delete out.stats;
  if (current.exportedAt !== undefined) out.exportedAt = current.exportedAt;
  else delete out.exportedAt;
  return out;
}

/**
 * A media file found again somewhere else: every snapshot that still points at the old path
 * gets the new one, so undoing never brings the broken link back.
 */
export function relinkIn(
  p: Project,
  id: string,
  oldPath: string,
  changes: Pick<Asset, "path" | "size">,
): Project {
  let changed = false;
  const assets = p.assets.map((a) => {
    if (a.id !== id || a.path !== oldPath) return a;
    changed = true;
    const { missing: _gone, ...rest } = a;
    return { ...rest, ...changes };
  });
  return changed ? { ...p, assets } : p;
}
