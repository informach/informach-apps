import { avatarMedia, cutTargets } from "./cleanup.ts";
import { openGap } from "./inserts.ts";
import { piece } from "./pieces.ts";
import { CUT_TOUCH, clipEnd, clipSpeed, sourceEnd, sourceRoom } from "./timeline.ts";
import type { Asset, Clip, Project } from "./types.ts";

/**
 * The seams of an edit: where two pieces of the same recording meet on a track with something
 * of the source taken out between them (a cut). "Revisar cortes" plays 1.5 s on each side of each
 * one; the person approves it (Project.reviewedSeams) or brings the stretch back.
 */

/** One track's side of a seam. */
export interface SeamPart {
  trackId: string;
  /** The pieces before and after the cut. */
  left: string;
  right: string;
  assetId: string;
  /** Source seconds where the left piece ends and the right one starts. */
  from: number;
  to: number;
  /** Anchored in the media ("<asset>:<from>-<to>"), so it stays the same through other edits. */
  id: string;
}

export interface Seam {
  /** Timeline second where the pieces meet. */
  at: number;
  /** One part per track: the screen and its microphone were cut together. */
  parts: SeamPart[];
  /** Timeline seconds a restore brings back (0 when the right piece goes back in the source). */
  removed: number;
  ids: string[];
  /**
   * A presenter's clip plays across the seam (a video placed by the voice, a script insert):
   * restoring would split it, so the stretch is not brought back here.
   */
  presenter?: boolean;
}

/** Seconds played before and after a seam while reviewing it. */
export const SEAM_CONTEXT = 1.5;
/** Most approved seams a lesson remembers; the oldest go first. */
export const REVIEWED_LIMIT = 20000;

const timed = (c: Clip, assets: Map<string, Asset>): boolean => {
  const kind = assets.get(c.assetId)?.kind;
  return (kind === "video" || kind === "audio") && !c.annotation && !c.zoomLayer;
};

const seamId = (assetId: string, from: number, to: number): string =>
  `${assetId}:${from.toFixed(3)}-${to.toFixed(3)}`;

/**
 * Every seam of the project, in timeline order: neighbouring pieces of the same media on a track
 * the cuts apply to (`targets`, cleanup.ts cutTargets) whose source jumps by more than a frame.
 * Seams at the same moment on several tracks are one.
 */
export function deriveSeams(
  project: Project,
  targets: ReadonlySet<string> = cutTargets(project),
): Seam[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const frame = 1 / (project.settings.fps || 30);
  const byTrack = new Map<string, Clip[]>();
  for (const c of project.clips) {
    if (!timed(c, assets) || !targets.has(c.trackId)) continue;
    const list = byTrack.get(c.trackId);
    if (list) list.push(c);
    else byTrack.set(c.trackId, [c]);
  }
  const parts: (SeamPart & { at: number; gap: number })[] = [];
  for (const [trackId, clips] of byTrack) {
    clips.sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) {
      const left = clips[i - 1];
      const right = clips[i];
      if (right.assetId !== left.assetId) continue;
      if (Math.abs(right.start - clipEnd(left)) > CUT_TOUCH) continue;
      const from = sourceEnd(left);
      const to = right.in;
      if (Math.abs(to - from) <= frame * 0.75) continue;
      parts.push({
        trackId,
        left: left.id,
        right: right.id,
        assetId: left.assetId,
        from,
        to,
        id: seamId(left.assetId, from, to),
        at: right.start,
        gap: to > from ? (to - from) / clipSpeed(left) : 0,
      });
    }
  }
  parts.sort((a, b) => a.at - b.at);
  const out: Seam[] = [];
  for (const p of parts) {
    const { at, gap, ...part } = p;
    const last = out[out.length - 1];
    if (last && Math.abs(last.at - at) <= CUT_TOUCH) {
      last.parts.push(part);
      last.ids.push(part.id);
      last.removed = Math.max(last.removed, gap);
    } else out.push({ at, parts: [part], removed: gap, ids: [part.id] });
  }
  return out;
}

/** Whether a presenter's clip plays across `at` (it would be split by opening the timeline). */
function presenterAcross(project: Project, at: number): boolean {
  const presenters = avatarMedia(project);
  return project.clips.some(
    (c) =>
      (c.insertId || presenters.has(c.assetId)) &&
      !c.annotation &&
      c.start < at - CUT_TOUCH &&
      clipEnd(c) > at + CUT_TOUCH,
  );
}

/** The seams of the project with what a restore would split marked (Seam.presenter). */
export function reviewSeams(project: Project, targets?: ReadonlySet<string>): Seam[] {
  return deriveSeams(project, targets).map((s) =>
    presenterAcross(project, s.at) ? { ...s, presenter: true } : s,
  );
}

/**
 * The seam `ids` points at, as it is in the project now (its place may have moved with other
 * edits, an undo may have brought it back somewhere else); null when it is not there any more.
 */
export function findSeam(
  project: Project,
  ids: readonly string[],
  targets?: ReadonlySet<string>,
): Seam | null {
  return reviewSeams(project, targets).find((s) => s.ids.some((id) => ids.includes(id))) ?? null;
}

/** Whether the person approved this seam already. */
export const isReviewed = (project: Pick<Project, "reviewedSeams">, seam: Seam): boolean => {
  const list = project.reviewedSeams;
  return !!list?.length && seam.ids.some((id) => list.includes(id));
};

/** The project with `seam` approved (kept with the lesson, outside the undo history). */
export function approveSeam(project: Project, seam: Seam): Project {
  const list = project.reviewedSeams ?? [];
  const next = [...list, ...seam.ids.filter((id) => !list.includes(id))].slice(-REVIEWED_LIMIT);
  return { ...project, reviewedSeams: next };
}

/**
 * Brings back what a cut took out at `seam`: the timeline opens there on `targets` (the tracks
 * cuts apply to, openGap) and each left piece grows into the opened space with its own source
 * (pieces.ts), so it plays on into the right piece as before the cut. Refused when nothing was
 * taken out there, or when a locked track goes on past the seam (it would fall out of sync).
 */
export function restoreSeam(
  project: Project,
  seam: Seam,
  targets: ReadonlySet<string>,
  locked: ReadonlySet<string> = new Set(),
): { clips: Clip[] } | { refused: string } {
  if (seam.removed <= 0)
    return { refused: "Aqui o corte não tirou nada da gravação: não há trecho para restaurar." };
  if (seam.presenter || presenterAcross(project, seam.at))
    return {
      refused:
        "O apresentador fala por cima deste corte: o vídeo dele foi feito sobre a voz já limpa, e trazer o trecho de volta o dividiria ao meio. Aprove o corte ou ajuste o apresentador à mão.",
    };
  const opened = openGap(project.clips, seam.at, seam.removed, new Set(targets), new Set(locked));
  if (opened.blocked.length)
    return {
      refused:
        "Uma faixa travada passa por este corte: abrir espaço aqui a tiraria de sincronia. Destrave a faixa para restaurar o trecho.",
    };
  const grow = new Map(
    seam.parts
      .filter((p) => p.to > p.from)
      .map((p) => [p.left, p] as const)
      .filter(([, p]) => targets.has(p.trackId)),
  );
  // A bed the cut trimmed at the end of the lesson (cleanup.ts applyCuts) grows back with it.
  const end = Math.max(0, ...project.clips.filter((c) => targets.has(c.trackId)).map(clipEnd));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const clips = opened.clips.map((c) => {
    const part = grow.get(c.id);
    if (part) {
      const own = (part.to - part.from) / clipSpeed(c);
      return piece(c, c.start, clipEnd(c) + Math.min(seam.removed, own), { tail: true });
    }
    if (
      targets.has(c.trackId) ||
      locked.has(c.trackId) ||
      c.start >= seam.at ||
      Math.abs(clipEnd(c) - end) > 0.05
    )
      return c;
    const room = (sourceRoom(c, assets.get(c.assetId))[1] - sourceEnd(c)) / clipSpeed(c);
    return room > 0
      ? piece(c, c.start, clipEnd(c) + Math.min(seam.removed, room), { tail: true })
      : c;
  });
  return { clips };
}
