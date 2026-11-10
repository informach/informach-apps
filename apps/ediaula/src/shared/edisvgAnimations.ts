import { z } from "zod";
import { makeClip, placeClips } from "./timeline.ts";
import { addTrackBeside } from "./trackOps.ts";
import type { Asset, Project, Track } from "./types.ts";

/**
 * The animations EdiSVG sends back to a lesson (apps/edisvg/src/main/lessonDelivery.ts): videos
 * in EdiAula's profile, `recebidos/<lesson id>/`, listed by `envio.json`, each with the lesson
 * second it starts at. A full-screen scene comes as an MP4, a demonstration as a WebM with
 * transparency. They go on a video track of their own, right above the screen recording, so a
 * demonstration's arrows and balloons are drawn over the screen and a scene covers it. EdiSVG
 * never writes the lesson: putting them in is an edit of the lesson, undone by one Ctrl+Z.
 */

export const RECEIVED_FOLDER = "recebidos";
export const RECEIVED_MANIFEST = "envio.json";
export const PLACED_FILE = "colocado.json";
export const ANIMATION_TRACK = "Animações do EdiSVG";

const lessonId = z.string().regex(/^[\w-]{1,100}$/);
export const receivedManifestSchema = z.looseObject({
  version: z.literal(1),
  lessonId,
  sentAt: z.number().int().positive(),
  items: z
    .array(
      z.looseObject({
        clipId: z.string().regex(/^animation-[\w-]{1,100}$/),
        kind: z.enum(["game-scene", "screen-demo"]),
        file: z.string().regex(/^animation-[\w-]{1,100}-\d{13}\.(mp4|webm)$/),
        name: z.string().min(1).max(200),
        start: z.number().min(0).max(360_000),
        duration: z.number().positive().max(36_000),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * The other way, "Animar no EdiSVG" (main/edisvgHandoff.ts): the lesson packed for EdiSVG's
 * pipelines in this profile's `para-o-edisvg/`, with `pedido.json` written last. EdiSVG reads it
 * (apps/edisvg/src/main/lessonRequest.ts) and opens the pipelines with the lesson chosen.
 */
export const HANDOFF_FOLDER = "para-o-edisvg";
export const HANDOFF_REQUEST = "pedido.json";
export const handoffRequestSchema = z.strictObject({
  version: z.literal(1),
  lessonId,
  /** The lesson's name, for EdiSVG to say which lesson came. */
  name: z.string().min(1).max(200),
  /** The package, a file of the folder. */
  file: z.string().regex(/^aula-[\w-]{1,100}-\d{13}\.zip$/),
  /** When it was sent (ms): EdiSVG opens a request once. */
  sentAt: z.number().int().positive(),
});
export type HandoffRequest = z.infer<typeof handoffRequestSchema>;

/** An animation sent for the open lesson, with the full path of its video. */
export interface ReceivedAnimation {
  clipId: string;
  kind: "game-scene" | "screen-demo";
  path: string;
  name: string;
  start: number;
  duration: number;
}

export interface ReceivedAnimations {
  lessonId: string;
  sentAt: number;
  items: ReceivedAnimation[];
}

/** The lesson ids whose sends belong to `p`: its own, and the one of the package it came from. */
export const receivingIds = (p: Pick<Project, "id" | "origin">): string[] => [
  ...new Set([p.id, p.origin].filter((id): id is string => !!id && lessonId.safeParse(id).success)),
];

/**
 * Whether `asset` is a video EdiSVG sent of the animation `clipId` (an earlier send of it). The
 * animation is the whole name before the send's time: "animation-a" is not "animation-a-b".
 */
export const isSentAnimation = (asset: Pick<Asset, "path">, clipId: string): boolean =>
  /[\\/]recebidos[\\/][\w-]+[\\/](animation-[\w-]+)-\d{13}\.(mp4|webm)$/i.exec(asset.path)?.[1] ===
  clipId;

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
 * Puts the sent animations in the lesson: each video on the animations' track at its second
 * (whatever was under it on that track gives way). An earlier send of the same animation leaves
 * the lesson, clips and media. `assets` are the videos as media of the lesson (already in it or
 * new), in the order of `items`.
 */
export function placeAnimations(
  p: Project,
  items: readonly ReceivedAnimation[],
  assets: readonly Asset[],
): Project {
  const { project, track } = animationTrack(p);
  const fresh = new Set(assets.map((a) => a.id));
  const earlier = new Set(
    project.assets
      .filter((a) => !fresh.has(a.id) && items.some((item) => isSentAnimation(a, item.clipId)))
      .map((a) => a.id),
  );
  const kept = project.clips.filter((c) => !earlier.has(c.assetId));
  const placed = items.flatMap((item, i) => {
    const asset = assets[i];
    if (!asset) return [];
    const clip = makeClip(asset, track.id, item.start);
    return [{ ...clip, duration: Math.min(clip.duration, item.duration) || clip.duration }];
  });
  const have = new Set(project.assets.map((a) => a.id));
  return {
    ...project,
    assets: [
      ...project.assets.filter((a) => !earlier.has(a.id)),
      ...assets.filter((a) => !have.has(a.id)),
    ],
    clips: placeClips(kept, placed),
  };
}
