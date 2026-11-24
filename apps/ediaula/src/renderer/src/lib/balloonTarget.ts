import { type Annotation, editedAnnotation } from "@shared/annotation";
import { aimBalloon, targetDrift, targetOnFrame } from "@shared/balloonAim";
import { clipLayout } from "@shared/compose";
import { clipEnd } from "@shared/timeline";
import type { Asset, Clip, Project } from "@shared/types";
import { type Commit, personCommit, useProject } from "@/state/project";
import { type BodyPlace, OVERSAMPLE, renderAnnotation, updateAnnotation } from "./annotations";
import { clickTargets } from "./courseTemplate";

/**
 * A balloon whose tail points at something on the screen (shared/balloonAim.ts): the item's
 * place as the screen shows it without zoom layers, carried through the zoom layers under the
 * balloon, and the body slid inside the frame on the side facing it.
 */

type Point = { x: number; y: number };

/** How far a placed body stays from what it points at, and from the frame's edges (1080p px). */
const GAP = 70;
const MARGIN = 24;

/** A balloon's body now: its center (frame pixels) and frame pixels per picture pixel. */
export function bodyNow(
  p: Pick<Project, "settings">,
  clip: Pick<Clip, "transform" | "annotation">,
  asset: Pick<Asset, "width" | "height">,
): { center: Point; density: number } {
  const lay = clipLayout(clip, asset, p.settings);
  const density = lay.full.w / (asset.width || 1);
  const g = clip.annotation?.balloonGeometry ?? { x: 0, y: 0, w: asset.width, h: asset.height };
  return {
    center: {
      x: lay.full.x + (g.x + g.w / 2) * density,
      y: lay.full.y + (g.y + g.h / 2) * density,
    },
    density,
  };
}

/**
 * The recorded click closest in time to [from, to] (inside it counts as 0 s away), where the
 * screen shows it in the middle of that stretch (the recording's own zoom included), in
 * fractions of the frame. Null when the lesson has no recorded clicks.
 */
export async function nearestClick(
  p: Project,
  from: number,
  to: number,
): Promise<{ point: Point; t: number } | null> {
  const clicks = await clickTargets(p);
  let best: (typeof clicks)[number] | null = null;
  let bestAway = Number.POSITIVE_INFINITY;
  for (const c of clicks) {
    const away = c.t < from ? from - c.t : c.t > to ? c.t - to : 0;
    if (away < bestAway) {
      best = c;
      bestAway = away;
    }
  }
  if (!best) return null;
  const [x, y] = best.seenAt?.((from + to) / 2) ?? [best.x, best.y];
  return { point: { x, y }, t: best.t };
}

export interface AimedBalloon {
  /** What changes in the annotation: the tail, its tip and the target kept. */
  changes: Pick<Annotation, "tail" | "tailPoint" | "target">;
  /** Where the body goes (AddOptions.body / updateAnnotation's `body`). */
  body: BodyPlace;
  /** How far the target moves on the frame while the balloon is up (frame pixels). */
  drift: number;
}

/**
 * Aims balloon `spec` at `target` (fractions of the frame without zoom layers). The body is
 * centered at `center` (frame pixels) and drawn `density` frame pixels per picture pixel; with
 * `place`, or when the target falls on it, it goes next to the target. `trackId` is the track it
 * is on (null: above every track), `from`/`to` when it shows.
 */
export async function aimBalloonAt(
  p: Project,
  spec: Annotation,
  where: {
    target: Point;
    center: Point;
    density: number;
    place: boolean;
    trackId: string | null;
    from: number;
    to: number;
  },
): Promise<AimedBalloon> {
  const W = p.settings.width;
  const H = p.settings.height;
  // The body's size does not depend on the tail: drawn once without it.
  const dry = await renderAnnotation({ ...spec, tailPoint: undefined, tail: "bottom" }, H, W);
  const g = dry.balloon ?? { w: dry.width, h: dry.height };
  const size = { w: g.w * where.density, h: g.h * where.density };
  const mid = (where.from + where.to) / 2;
  const onFrame = targetOnFrame(p, where.trackId, where.target, mid);
  const k = H / 1080;
  const aim = aimBalloon(
    {
      x: where.center.x - size.w / 2,
      y: where.center.y - size.h / 2,
      w: size.w,
      h: size.h,
    },
    size,
    onFrame,
    { width: W, height: H },
    { place: where.place, gap: GAP * k, margin: MARGIN * k },
  );
  return {
    changes: { tail: aim.tail, tailPoint: aim.tailPoint, target: where.target },
    body: {
      x: (aim.body.x + aim.body.w / 2) / W,
      y: (aim.body.y + aim.body.h / 2) / H,
      density: where.density,
    },
    drift: targetDrift(p, where.trackId, where.target, where.from, where.to),
  };
}

/** Frame pixels per picture pixel of an annotation shown at `scale` times its natural size. */
export const naturalDensity = (scale = 1): number => scale / OVERSAMPLE;

/**
 * A balloon of the lesson aimed at `target` (absent: the one it keeps), with `changes` made in
 * the same step: its body stays where it is unless the target falls on it. False when the clip
 * is not a balloon of the open lesson or has nothing to aim at.
 */
export async function aimClip(
  clipId: string,
  target?: Point,
  changes: Partial<Annotation> = {},
  commit: Commit = personCommit,
): Promise<boolean> {
  const p = useProject.getState().project;
  const clip = p?.clips.find((c) => c.id === clipId);
  const asset = clip && p?.assets.find((a) => a.id === clip.assetId);
  const a = clip?.annotation;
  const point = target ?? a?.target;
  if (!p || !clip || !asset || a?.kind !== "balloon" || !point) return false;
  const now = bodyNow(p, clip, asset);
  const aimed = await aimBalloonAt(p, editedAnnotation(a, changes), {
    target: point,
    center: now.center,
    density: now.density,
    place: false,
    trackId: clip.trackId,
    from: clip.start,
    to: clipEnd(clip),
  });
  await updateAnnotation(clipId, { ...changes, ...aimed.changes }, commit, undefined, aimed.body);
  return true;
}

/** Changes to a balloon that change its body, after which a balloon aimed at an item aims again. */
export const changesBody = (c: Partial<Annotation>): boolean =>
  ["text", "fontSize", "fontFamily", "maxCharsPerLine", "width", "layout"].some((k) => k in c);
