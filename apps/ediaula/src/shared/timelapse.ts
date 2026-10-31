import { applyCuts, cutTargets } from "./cleanup.ts";
import { followEnd, lockedOf, openSpace } from "./ripple.ts";
import type { Clip, Project, TimeLapse } from "./types.ts";

/**
 * "Tela sem voz": a screen recorded while the voice was held (shared/overNarration.ts) comes in
 * sped up under the line it was held in. The edit decides what it becomes, each in one step:
 * - under the line (the default): `source` seconds in `under`, the lesson as long as before;
 * - room in the voice: the voice waits `space` seconds after the line while it plays, slower;
 * - the extra time cut: only what was recorded while the line played, at normal speed.
 */
export type LapseChoice = { kind: "under" } | { kind: "space"; seconds: number } | { kind: "cut" };

/** What the stretch is now. */
export function lapseChoice(t: TimeLapse): LapseChoice {
  if (t.cut) return { kind: "cut" };
  if (t.space) return { kind: "space", seconds: t.space };
  return { kind: "under" };
}

/** The most room the voice can make: past it the screen would go slower than recorded. */
export const maxSpace = (t: TimeLapse): number => Math.max(0, t.source - t.under);

/** The room offered at first: 8 s, or less when the screen would go slower than recorded. */
export const defaultSpace = (t: TimeLapse): number => Math.min(8, Math.floor(maxSpace(t)));

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * The lesson with the stretch `clipId` as `choice`: the room opened before is closed first (on
 * every track the cuts reach, as Excluir o intervalo does), the new room opened at the end of the
 * line (the voice waits there, music to the end follows), and the clip put back at its new speed.
 * Null when the clip is not such a stretch.
 */
export function setLapse(p: Project, clipId: string, choice: LapseChoice): Clip[] | null {
  const block = p.clips.find((c) => c.id === clipId);
  const t = block?.timelapse;
  if (!block || !t) return null;
  const index = p.clips.indexOf(block);
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const locked = lockedOf(p);
  // A locked track keeps everything on it as it is, this stretch included.
  if (locked.has(block.trackId)) return null;
  const targets = cutTargets(p);
  targets.add(block.trackId);
  for (const id of locked) targets.delete(id);
  const lineEnd = block.start + t.under;
  let clips = p.clips.filter((c) => c.id !== block.id);
  // The room opened before goes away first: the line ends where it did when recorded.
  if (t.space) clips = applyCuts(clips, [[lineEnd, lineEnd + t.space]], targets, locked);
  const space =
    choice.kind === "space" ? round(Math.min(maxSpace(t), Math.max(0, choice.seconds))) : 0;
  if (space > 0) {
    const before = clips;
    clips = followEnd(before, openSpace(before, lineEnd, space, targets), targets, locked, assets);
  }
  const duration = round(t.under + space);
  const { speed: _speed, timelapse: _lapse, ...rest } = block;
  const lapse: TimeLapse = {
    under: t.under,
    source: t.source,
    ...(space > 0 ? { space } : {}),
    ...(choice.kind === "cut" ? { cut: true } : {}),
  };
  const speed = choice.kind === "cut" ? 1 : t.source / duration;
  const next: Clip = {
    ...rest,
    duration,
    ...(Math.abs(speed - 1) > 1e-4 ? { speed: Math.round(speed * 10000) / 10000 } : {}),
    timelapse: lapse,
  };
  // Back where it was in the list: the order of the other clips does not change.
  clips.splice(Math.min(index, clips.length), 0, next);
  return clips;
}
