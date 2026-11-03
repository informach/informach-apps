import type { Track } from "./types.ts";

/**
 * The tracks that hold sound effects: "Efeitos sonoros" (and "Efeitos sonoros 2"…), made by the
 * library's "Aqui", add_clip and add_sound_effects. A sound effect is not someone speaking: these
 * tracks are left out of the speech the music and the clicks step aside for.
 */
export const SOUND_TRACK = "Efeitos sonoros";

/** Whether a track holds sound effects (marked, or named so by an earlier version). */
export const isSfxTrack = (t: Pick<Track, "sfx" | "name">): boolean =>
  !!t.sfx || t.name.startsWith(SOUND_TRACK);
