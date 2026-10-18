import { cutTargets } from "./cleanup.ts";
import { clipEnd, clipSpeed, sourceEnd } from "./clipTime.ts";
import type { CursorPoint } from "./cursor.ts";
import { pruneGroups } from "./groups.ts";
import { rippleTrim } from "./ripple.ts";
import { MIN_CLIP } from "./timeline.ts";
import type { Asset, Clip, Project, Word } from "./types.ts";

/**
 * Substituir mídia: another file takes the place of a media (the presenter's video made again, a
 * screen recorded again) and every clip of it keeps its edits: position, size, movement, fades,
 * transitions, background removal. When both files are transcribed, the words of the old one
 * are found in the new one and each clip plays the same words there (its in-point and length
 * follow the alignment); without transcripts, only a file of the same length takes the place.
 */

/** Seconds of difference in length a file may have to take the place without transcripts. */
export const SAME_LENGTH = 0.5;

const plain = (w: string): string =>
  w
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();

/** Pairs of matching words (old index, new index), in order: the longest common subsequence. */
export function alignWords(
  before: readonly Pick<Word, "text">[],
  after: readonly Pick<Word, "text">[],
): [number, number][] {
  const a = before.map((w) => plain(w.text));
  const b = after.map((w) => plain(w.text));
  // Long lessons: past 16 million cells (32 MB) the words are matched near each other instead.
  if (a.length * b.length > 16_000_000) return greedy(a, b);
  const m = a.length;
  const n = b.length;
  const table = new Uint16Array((m + 1) * (n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      table[i * (n + 1) + j] =
        a[i] && a[i] === b[j]
          ? table[(i + 1) * (n + 1) + j + 1] + 1
          : Math.max(table[(i + 1) * (n + 1) + j], table[i * (n + 1) + j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] && a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * (n + 1) + j] >= table[i * (n + 1) + j + 1]) i++;
    else j++;
  }
  return out;
}

/** For very long lists: each old word matched to the next equal new word within 40 words. */
function greedy(a: string[], b: string[]): [number, number][] {
  const out: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < a.length && j < b.length; i++) {
    if (!a[i]) continue;
    for (let k = j; k < Math.min(b.length, j + 40); k++)
      if (a[i] === b[k]) {
        out.push([i, k]);
        j = k + 1;
        break;
      }
  }
  return out;
}

/**
 * Source seconds of the old file to the new one, through the aligned words: the start of each
 * matched word to its start in the new file, straight lines in between, and the same offset as
 * the nearest pair before the first and after the last.
 */
export function timeMap(
  before: readonly Word[],
  after: readonly Word[],
): ((s: number) => number) | null {
  const pairs = alignWords(before, after);
  // A third of the words must be found, or the files say different things.
  if (pairs.length < Math.max(2, Math.min(before.length, after.length) / 3)) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [i, j] of pairs) {
    const x = before[i].start;
    const y = after[j].start;
    if (xs.length && x <= xs[xs.length - 1]) continue;
    xs.push(x);
    ys.push(y);
    // The end of the word too, so a clip that ends on a word ends on it in the new file.
    const xe = before[i].end;
    const ye = after[j].end;
    if (xe > x) {
      xs.push(xe);
      ys.push(Math.max(y, ye));
    }
  }
  return (s: number): number => {
    if (s <= xs[0]) return Math.max(0, ys[0] + (s - xs[0]));
    const last = xs.length - 1;
    if (s >= xs[last]) return Math.max(0, ys[last] + (s - xs[last]));
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= s) lo = mid;
      else hi = mid;
    }
    const k = (s - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + k * (ys[hi] - ys[lo]);
  };
}

/** Fields of a media that are edits of the person and stay with the new file. */
const KEPT: (keyof Asset)[] = ["key", "voicePreset", "screen", "origin", "recording"];

export interface Replacement {
  project: Project;
  /** Clips whose in-point or length changed with the alignment. */
  remapped: number;
  /** Clips whose words are not in the new file: they were left out. */
  dropped: number;
  /** What did not come along, for the person (locked tracks in the way, the recorded pointer). */
  warnings: string[];
}

/**
 * The project with `next` (a new media, with its own id) in the place of `oldId`: clips, zooms,
 * markers of the media, protected passages, held frames, the background, the voices exported
 * and the pending proposals point to it, through `map` when the timing changed. A clip that
 * now lasts longer or shorter pushes or pulls what comes after it on its track and on the tracks
 * text cuts reach (a ripple trim, shared/ripple.ts), so nothing overlaps and no hole is left;
 * locked tracks stay as they are (and are named in the warnings). The old media leaves the
 * library (Ctrl+Z brings it back with its clips).
 */
export function replaceAsset(
  p: Project,
  oldId: string,
  next: Asset,
  map: ((s: number) => number) | null,
): Replacement {
  const old = p.assets.find((a) => a.id === oldId);
  if (!old) return { project: p, remapped: 0, dropped: 0, warnings: [] };
  const warnings: string[] = [];
  const length = next.kind === "image" || next.duration <= 0 ? Infinity : next.duration;
  const f = map ?? ((s: number) => s);
  const asset: Asset = { ...next };
  for (const key of KEPT) if (old[key] !== undefined) Object.assign(asset, { [key]: old[key] });
  // The recorded pointer belongs to the old file's clock: a new file recorded in EdiAula brings
  // its own; otherwise the old one comes along only when the timing did not change.
  if (!next.cursor && old.cursor && !map) {
    asset.cursor = old.cursor;
    if (old.cursorMissing) asset.cursorMissing = true;
  } else if (!next.cursor && old.cursor)
    warnings.push("O cursor gravado não acompanha o arquivo novo, que fica sem ele.");
  // How the pointer is drawn stays; the hand-drawn paths and the stretches of effects follow
  // the new timing.
  if (old.cursorFx && asset.cursor) {
    const points = (list: CursorPoint[]): CursorPoint[] =>
      list.map((pt) => ({ ...pt, t: f(pt.t) }));
    const ranges = old.cursorFx.ranges
      ?.map((r) => ({ ...r, start: f(r.start), end: f(r.end) }))
      .filter((r) => r.end > r.start && r.start < length);
    asset.cursorFx = {
      ...old.cursorFx,
      ...(old.cursorFx.path ? { path: points(old.cursorFx.path) } : {}),
      ...(ranges ? { ranges } : {}),
      ...(old.cursorFx.pathEdits
        ? {
            pathEdits: old.cursorFx.pathEdits.map((e) => ({
              ...e,
              start: f(e.start),
              end: f(e.end),
              points: points(e.points),
            })),
          }
        : {}),
    };
  }
  if (old.zooms?.length)
    asset.zooms = old.zooms
      .map((z) => ({
        ...z,
        start: f(z.start),
        end: f(z.end),
        focus: z.focus.map((pt) => ({ ...pt, t: f(pt.t) })),
      }))
      .filter((z) => z.end > z.start && z.start < length);
  if (old.markers?.length)
    asset.markers = old.markers.map((m) => ({ ...m, t: f(m.t) })).filter((m) => m.t < length);
  let remapped = 0;
  let dropped = 0;
  /** The length each clip of the new media ends up with. */
  const wanted = new Map<string, number>();
  const clips: Clip[] = [];
  for (const c of p.clips) {
    if (c.assetId !== oldId) {
      clips.push(c);
      continue;
    }
    const speed = clipSpeed(c);
    const from = Math.max(0, f(c.in));
    const to = Math.min(length, f(sourceEnd(c)));
    if (to - from < MIN_CLIP * speed) {
      dropped++;
      continue;
    }
    const duration = map ? (to - from) / speed : Math.min(c.duration, (length - c.in) / speed);
    if (Math.abs(from - c.in) > 1e-6 || Math.abs(duration - c.duration) > 1e-6) remapped++;
    wanted.set(c.id, duration);
    // In place first, with its old length (as far as the new media goes); the ripple below
    // gives it the new one.
    clips.push({
      ...c,
      assetId: asset.id,
      in: from,
      duration: Math.min(c.duration, (length - from) / speed),
    });
  }
  // What was drawn on the screen over the old file: the pen's tip over the boards follows the
  // new one (on its clock) when it has the pointer; the strokes stay where they were drawn.
  const drawnOver = p.assets.filter((a) => a.drawing?.pointer?.assetId === oldId);
  if (drawnOver.length && map)
    warnings.push(
      "O desenho feito na tela durante a gravação não acompanha as falas do arquivo novo: confira se os traços ainda caem no lugar certo da tela.",
    );
  const assets = p.assets
    .filter((a) => a.id !== oldId)
    .map((a) => {
      const pointer = a.drawing?.pointer;
      if (a.drawing && pointer?.assetId === oldId) {
        const { pointer: _old, ...drawing } = a.drawing;
        return {
          ...a,
          drawing: asset.cursor
            ? { ...drawing, pointer: { assetId: asset.id, offset: f(pointer.offset) } }
            : drawing,
        };
      }
      return a.still?.assetId === oldId ? { ...a, still: { ...a.still, assetId: asset.id } } : a;
    });
  let project: Project = {
    ...p,
    assets: [...assets, asset],
    clips,
    ...(p.protected
      ? {
          protected: p.protected.map((r) =>
            r.assetId === oldId ? { ...r, assetId: asset.id, start: f(r.start), end: f(r.end) } : r,
          ),
        }
      : {}),
    ...(p.background?.kind === "image" && p.background.assetId === oldId
      ? { background: { kind: "image" as const, assetId: asset.id } }
      : {}),
    ...(p.voiceMasters
      ? {
          voiceMasters: p.voiceMasters.map((m) => ({
            ...m,
            pieces: m.pieces.map((piece) => ({
              ...piece,
              sourceMap: piece.sourceMap.map((seg) =>
                seg.assetId === oldId ? { ...seg, assetId: asset.id, in: f(seg.in) } : seg,
              ),
            })),
          })),
        }
      : {}),
    ...(p.proposals
      ? {
          proposals: p.proposals.map((proposal) => ({
            ...proposal,
            items: proposal.items.map((item) => {
              if (!item.anchors.some((a) => a.assetId === oldId)) return item;
              // Word keys name the old file's words: the anchors and the text find the item now.
              const wordKeys = item.wordKeys?.filter((k) => !k.startsWith(`${oldId}:`));
              return {
                ...item,
                anchors: item.anchors.map((a) =>
                  a.assetId === oldId
                    ? { ...a, assetId: asset.id, start: f(a.start), end: f(a.end) }
                    : a,
                ),
                ...(item.wordKeys ? { wordKeys } : {}),
              };
            }),
          })),
        }
      : {}),
    ...(p.pendingStart?.music?.assetId === oldId
      ? {
          pendingStart: {
            ...p.pendingStart,
            music: { ...p.pendingStart.music, assetId: asset.id },
          },
        }
      : {}),
  };
  // Each clip to its new length, the latest first, pushing or pulling what comes after it.
  const targets = cutTargets(project);
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  // Clips that sit together (a video and the sound taken out of it) change once, at one point:
  // the first of them ripples, the others just take their new length.
  const together = new Map<string, string[]>();
  for (const c of [...project.clips].sort((a, b) => b.start - a.start)) {
    const target = wanted.get(c.id);
    if (target === undefined || Math.abs(target - c.duration) <= 1e-6) continue;
    const key = [c.start, clipEnd(c), target].map((x) => Math.round(x * 1000)).join(":");
    together.set(key, [...(together.get(key) ?? []), c.id]);
  }
  const lockedAfter = (end: number): boolean =>
    project.tracks.some(
      (t) =>
        t.locked &&
        !t.music &&
        project.clips.some((x) => x.trackId === t.id && x.start >= end - 1e-6),
    );
  let blocked = false;
  for (const ids of together.values()) {
    const free = ids.filter(
      (id) => !locked.has(project.clips.find((x) => x.id === id)?.trackId ?? ""),
    );
    if (free.length < ids.length) blocked = true;
    const [leader, ...rest] = free;
    const c = project.clips.find((x) => x.id === leader);
    const target = wanted.get(leader ?? "");
    if (!c || target === undefined) continue;
    if (lockedAfter(clipEnd(c))) blocked = true;
    const trimmed = rippleTrim(project, targets, c.id, "end", c.start + target);
    if (!trimmed.unchanged) project = { ...project, clips: trimmed.clips };
    const others = new Set(rest);
    project = {
      ...project,
      clips: project.clips.map((x) => {
        const length = wanted.get(x.id);
        return others.has(x.id) && length !== undefined ? { ...x, duration: length } : x;
      }),
    };
  }
  if (blocked)
    warnings.push(
      "Uma faixa travada tem clipes depois dos trechos trocados e não acompanhou: confira a sincronia nela.",
    );
  return {
    project: { ...project, clips: pruneGroups(project.clips) },
    remapped,
    dropped,
    warnings,
  };
}

/** Why a file cannot take the place without transcripts, or null when it can. */
export function lengthMismatch(old: Asset, next: Pick<Asset, "duration" | "kind">): string | null {
  if (old.kind !== next.kind) return "O arquivo novo é de outro tipo de mídia.";
  if (old.kind === "image") return null;
  if (Math.abs(old.duration - next.duration) <= SAME_LENGTH) return null;
  return `O arquivo novo tem ${next.duration.toFixed(1)} s e o atual ${old.duration.toFixed(1)} s. Sem a transcrição dos dois, só um arquivo da mesma duração entra no lugar.`;
}
