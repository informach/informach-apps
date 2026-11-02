import { type SoundEffectId, soundEffect } from "./soundEffects.ts";
import { adjacency, clipEnd, clipSpeed, sourceEnd } from "./timeline.ts";
import { isCutFx } from "./transitions.ts";
import type { Project } from "./types.ts";
import { ZOOM_EASE, zoomsIn } from "./zoom.ts";
import { entryView, layerCurve, viewOf, zoomTimes } from "./zoomLayer.ts";

/**
 * The automatic whoosh of a lesson ("Efeitos sonoros automáticos"): a whoosh with each zoom that
 * goes in or out (the zooms of a screen recording and the zoom layers) and with each transition,
 * as the click goes with the pointer. Like the click, it belongs to the picture: a zoom or a
 * transition on a hidden track makes no sound. The preview plays these moments and the export
 * mixes them as one track of the lesson (spec.effects), from the same list.
 */

/** "par": the rising swoosh when a zoom goes in and the falling one when it comes back out. */
export type ZoomSoundChoice = "par" | SoundEffectId;

export interface AutoSounds {
  /** A whoosh when a zoom goes in or out. */
  zooms?: boolean;
  /** A whoosh at each transition between two clips. */
  transitions?: boolean;
  /** 0 to 1 (default AUTO_SOUND_DEFAULTS.volume). */
  volume?: number;
  zoomSound?: ZoomSoundChoice;
  transitionSound?: SoundEffectId;
}

export const AUTO_SOUND_DEFAULTS = {
  volume: 0.5,
  zoomSound: "par",
  transitionSound: "woosh-curto",
} as const satisfies Required<Pick<AutoSounds, "volume" | "zoomSound" | "transitionSound">>;

export interface SoundEvent {
  /** Timeline second the sound starts at (its loudest moment falls on the movement's middle). */
  at: number;
  sound: SoundEffectId;
  volume: number;
}

/** Two whooshes closer than this are one (a zoom layer over a recording's own zoom). */
const MERGE = 0.15;
/** A view change smaller than this is no movement to hear. */
const STILL = 1e-3;

type AutoProject = Pick<Project, "clips" | "tracks" | "assets" | "autoSounds">;

export const autoSoundsOn = (p: Pick<Project, "autoSounds">): boolean =>
  !!(p.autoSounds?.zooms || p.autoSounds?.transitions);

/** Every automatic whoosh of the lesson, in order. */
export function autoSoundEvents(project: AutoProject): SoundEvent[] {
  const settings = project.autoSounds;
  if (!settings || !autoSoundsOn(project)) return [];
  const volume = Math.max(0, Math.min(1, settings.volume ?? AUTO_SOUND_DEFAULTS.volume));
  if (volume <= 0) return [];
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const seen = (trackId: string): boolean => {
    const track = tracks.get(trackId);
    return !!track && !track.hidden;
  };
  const raw: { center: number; sound: SoundEffectId }[] = [];

  if (settings.zooms) {
    const choice = settings.zoomSound ?? AUTO_SOUND_DEFAULTS.zoomSound;
    const goingIn: SoundEffectId = choice === "par" ? "swoosh-entrada" : choice;
    const goingOut: SoundEffectId = choice === "par" ? "swoosh-saida" : choice;
    for (const c of project.clips) {
      if (!seen(c.trackId)) continue;
      // A zoom layer: its way in (from the view before it) and its way out (back to normal).
      if (c.zoomLayer) {
        const { inT, outT } = zoomTimes(c);
        const curve = layerCurve(c);
        const target = viewOf(c);
        const from = entryView(project, c);
        const end = clipEnd(c);
        const inside = (t: number): boolean => t >= c.start - 1e-6 && t < end;
        const moves =
          Math.abs(target.scale - from.scale) > STILL ||
          Math.abs(target.cx - from.cx) > STILL ||
          Math.abs(target.cy - from.cy) > STILL;
        if (inT > 0 && moves && inside(curve.start))
          raw.push({ center: curve.start + inT / 2, sound: goingIn });
        const zoomed = target.scale > 1 + STILL;
        if (outT > 0 && zoomed && inside(curve.start + curve.duration - outT))
          raw.push({ center: curve.start + curve.duration - outT / 2, sound: goingOut });
        continue;
      }
      // The zooms of a recording, in its own seconds, on each clip that shows that stretch.
      const asset = assets.get(c.assetId);
      if (!asset?.zooms?.length || c.soundOnly || c.regionFx) continue;
      const speed = clipSpeed(c);
      const from = c.in;
      const to = sourceEnd(c);
      const at = (source: number): number => c.start + (source - from) / speed;
      for (const z of zoomsIn(asset.zooms, from, to)) {
        if (z.scale <= 1 + STILL) continue;
        const ease = Math.min(z.ease ?? ZOOM_EASE, (z.end - z.start) / 2);
        if (z.start >= from && z.start < to)
          raw.push({ center: at(z.start + ease / 2), sound: goingIn });
        const out = z.end - ease;
        if (out >= from && out < to) raw.push({ center: at(z.end - ease / 2), sound: goingOut });
      }
    }
  }

  if (settings.transitions) {
    const sound = settings.transitionSound ?? AUTO_SOUND_DEFAULTS.transitionSound;
    const previous = adjacency(project.clips);
    for (const b of project.clips) {
      if (!b.transition || !seen(b.trackId)) continue;
      const a = previous.get(b.id);
      if (!a) continue;
      const kind = b.transition.kind;
      const d = Math.max(0.1, Math.min(b.transition.duration, b.duration / 2, a.duration / 2));
      // Through black and the effects over the whole frame are centered on the cut; the others
      // are the outgoing picture leaving over the incoming one, after the cut.
      const center = kind === "black" || isCutFx(kind) ? b.start : b.start + d / 2;
      raw.push({ center, sound });
    }
  }

  raw.sort((x, y) => x.center - y.center);
  const out: SoundEvent[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const r of raw) {
    if (r.center - last < MERGE) continue;
    last = r.center;
    out.push({ at: Math.max(0, r.center - soundEffect(r.sound).peak), sound: r.sound, volume });
  }
  return out.sort((x, y) => x.at - y.at);
}

/** Seconds the last automatic sound ends at (0 without any). */
export function autoSoundsEnd(events: readonly SoundEvent[]): number {
  let end = 0;
  for (const e of events) end = Math.max(end, e.at + soundEffect(e.sound).seconds);
  return end;
}
