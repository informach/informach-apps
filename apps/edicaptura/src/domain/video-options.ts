import { z } from "zod";

/**
 * What the quick video records besides the picture (phase 5c): an optional microphone and the
 * computer's sound, each with its own volume and mute, and the countdown before the first frame.
 * Both sources go into the same WebM as one mixed track; there is no track editing here.
 */
const sourceSchema = z
  .object({
    enabled: z.boolean().default(false),
    volume: z.number().int().min(0).max(200).default(100),
    muted: z.boolean().default(false),
  })
  .strict();
export const videoOptionsSchema = z
  .object({
    version: z.literal(1).default(1),
    microphone: sourceSchema
      .extend({
        /** A MediaDeviceInfo.deviceId; empty is the system default microphone. */
        deviceId: z.string().max(512).default(""),
      })
      .strict()
      .default(() => ({ enabled: false, volume: 100, muted: false, deviceId: "" })),
    system: sourceSchema.default(() => ({ enabled: false, volume: 100, muted: false })),
    /** Seconds shown before recording starts; 0 starts at once. */
    countdown: z.number().int().min(0).max(10).default(3),
  })
  .strict();
export type VideoOptions = z.infer<typeof videoOptionsSchema>;
export const defaultVideoOptions = (): VideoOptions => videoOptionsSchema.parse({});

/** Recording phases the controller may report. `held` is a pause the person asked for. */
export const RECORDING_PHASES = ["recording", "paused", "held", "finalizing", "failed"] as const;
