/**
 * What an animation sent to EdiAula can be (src/main/lessonDelivery.ts checks it again): the
 * window checks every animation of a lesson against it before encoding the first, so a send never
 * stops half way with videos no manifest lists.
 */
export const DELIVERY_LIMITS = {
  minSide: 16,
  maxSide: 3840,
  maxFps: 60,
  /** 20 minutes at 60 fps. */
  maxFrames: 72_000,
} as const;
