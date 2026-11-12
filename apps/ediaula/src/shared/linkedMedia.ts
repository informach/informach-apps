import type { AssetLink, LinkedAnimation } from "@informach/edi-link/contract";
import { clipSpeed } from "./clipTime.ts";
import { makeClip, placeClips } from "./timeline.ts";
import { addTrackBeside } from "./trackOps.ts";
import type { Asset, Clip, Project, Track } from "./types.ts";

/**
 * Media linked to another Edi tool's file (packages/edi-link), as Premiere links an After Effects
 * composition: an EdiSVG animation is a clip of the lesson whose picture is the render EdiSVG
 * makes at every save, beside its project (`<project> · renders`). EdiAula never draws the
 * animation: the asset is a plain video (a WebM with transparency) plus `link`, which says which
 * project and animation it is and which render it shows. A newer render in the project's
 * manifest updates the asset in place; the edit of the lesson around it stays.
 */

export const ANIMATION_TRACK = "Animações do EdiSVG";

/**
 * The track the animations go on: the lesson's own, or a new one right above the screen
 * recording (the track of the first clip of a screen recording), or above the lesson's first
 * picture track when there is none.
 */
export function animationTrack(p: Project): { project: Project; track: Track } {
  const own = p.tracks.find((t) => t.kind === "video" && t.name === ANIMATION_TRACK);
  if (own) return { project: p, track: own };
  const roles = new Map(p.assets.map((a) => [a.id, a.recording?.role]));
  const screen = p.clips.find((c) => roles.get(c.assetId) === "screen")?.trackId;
  const ref = screen ?? p.tracks.find((t) => t.kind === "video")?.id;
  if (ref) {
    const added = addTrackBeside(p, ref, "above", "video", ANIMATION_TRACK);
    if (added.ok) return { project: added.project, track: added.track };
  }
  const track: Track = {
    id: `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
    kind: "video",
    name: ANIMATION_TRACK,
    muted: false,
    hidden: false,
    locked: false,
  };
  return { project: { ...p, tracks: [track, ...p.tracks] }, track };
}

/**
 * A linked animation placed in the lesson: its asset (the render, or a placeholder picture
 * until the first render comes) on the animations' track from `start`, `duration` long. What was
 * under it on that track gives way.
 */
export function placeLinked(p: Project, asset: Asset, start: number, duration: number): Project {
  const { project, track } = animationTrack(p);
  const clip: Clip = { ...makeClip(asset, track.id, start), duration };
  return {
    ...project,
    assets: [...project.assets, asset],
    clips: placeClips(project.clips, [clip]),
  };
}

/** The projects the lesson's linked media come from. */
export const linkedProjects = (p: Pick<Project, "assets">): string[] => [
  ...new Set(p.assets.flatMap((a) => (a.link ? [a.link.project] : []))),
];

/** The manifest entry a linked asset shows: its animation, or the request that made it. */
export function linkedEntry<T extends LinkedAnimation>(
  link: AssetLink,
  items: readonly T[],
): T | undefined {
  return items.find((i) =>
    link.animationId
      ? i.animationId === link.animationId
      : !!link.requestId && i.requestId === link.requestId,
  );
}

/**
 * The asset knows its animation as soon as the project's manifest lists it, before any render
 * (a first render that failed still leaves "Editar no EdiSVG" working).
 */
export function adoptAnimation(p: Project, assetId: string, entry: LinkedAnimation): Project {
  return {
    ...p,
    assets: p.assets.map((a) =>
      a.id === assetId && a.link && !a.link.animationId
        ? {
            ...a,
            link: { ...a.link, animationId: entry.animationId, artboardId: entry.artboardId },
          }
        : a,
    ),
  };
}

/** A render as media of the lesson: what probing it says. */
export interface RenderFacts {
  path: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

/** Seconds a clip may differ from its media's length and still count as the whole media. */
const WHOLE = 0.05;

/**
 * The asset `assetId` showing a new render of its animation: the video and its facts in place
 * of the old (the caches of the old picture go), and `link` pointing at the animation and its
 * render. Its clips keep their edit; one that showed the whole animation (or the placeholder,
 * which is as long as asked) follows its new length, and one that now runs past the end of the
 * animation stops there.
 */
export function applyRender(
  p: Project,
  assetId: string,
  entry: LinkedAnimation,
  facts: RenderFacts,
): Project {
  const before = p.assets.find((a) => a.id === assetId);
  if (!before?.link || !entry.render) return p;
  const placeholder = before.kind === "image";
  const {
    thumb: _thumb,
    waveform: _waveform,
    proxy: _proxy,
    filmstrip: _filmstrip,
    missing: _missing,
    // The date of the old render's file (shared/mediaChange.ts): the new one is another file.
    mtime: _mtime,
    ...rest
  } = before;
  const asset: Asset = {
    ...rest,
    kind: "video",
    name: entry.name,
    path: facts.path,
    size: facts.size,
    duration: facts.duration,
    width: facts.width,
    height: facts.height,
    fps: facts.fps,
    hasVideo: true,
    hasAudio: false,
    alpha: true,
    proxyStatus: "none",
    link: {
      app: before.link.app,
      project: before.link.project,
      animationId: entry.animationId,
      artboardId: entry.artboardId,
      hash: entry.render.hash,
      ...(entry.start !== undefined ? { start: entry.start } : {}),
    },
  };
  // A pipeline placed the animation on the lesson's words: a clip showing all of it goes there
  // (once: a clip moved afterwards by the person stays where they put it).
  const moveTo =
    entry.start !== undefined && entry.start !== before.link.start ? entry.start : undefined;
  const clips = p.clips.map((c) => {
    if (c.assetId !== assetId) return c;
    const speed = clipSpeed(c);
    const whole =
      placeholder || (c.in < WHOLE && Math.abs(c.duration * speed - before.duration) < WHOLE);
    if (whole)
      return {
        ...c,
        in: 0,
        duration: facts.duration / speed,
        ...(moveTo !== undefined ? { start: moveTo } : {}),
      };
    const room = Math.max(0, facts.duration - c.in) / speed;
    return c.duration > room ? { ...c, duration: Math.max(room, 0.1) } : c;
  });
  return { ...p, assets: p.assets.map((a) => (a.id === assetId ? asset : a)), clips };
}

/** Whether the asset's render is behind the manifest's (a newer save in the other tool). */
export function renderBehind(
  asset: Pick<Asset, "link">,
  entry: LinkedAnimation | undefined,
): boolean {
  return !!asset.link && !!entry?.render && entry.render.hash !== asset.link.hash;
}
