import type { SoundEvent } from "./autoSounds.ts";
import { clipEnd, clipSpeed, sourceEnd, timelineAt } from "./clipTime.ts";
import { CURSOR_EFFECT_DEFAULTS, type CursorFx, DEFAULT_CURSOR_FX, fxAt } from "./cursor.ts";
import type { CursorData } from "./cursorData.ts";
import type { SoundEffectId } from "./soundEffects.ts";
import type { Project, Track } from "./types.ts";

/**
 * The automatic click sound of the screen recordings made in EdiAula (set_click_sound, the
 * "Som" of the pointer's clicks), on the lesson's clock. It comes from the clicks saved with the
 * pointer (cursor.json) and is worked out again from the clips each time, so it follows the cuts,
 * the speed changes and the sped-up stretches like the picture. The preview plays this list and
 * the export mixes it as the track "Cliques", lowered while someone speaks like the music.
 */

/** What makes a sound: a click, the second press of a double click, a drag, the typing. */
export const CLICK_KINDS = ["click", "double_click", "drag_start", "drag_end", "typing"] as const;
export type ClickKind = (typeof CLICK_KINDS)[number];
/** Every press sounds by default, as the click always did; drag end and typing are asked for. */
export const DEFAULT_CLICK_KINDS: readonly ClickKind[] = ["click", "double_click", "drag_start"];

/** Two presses this close (seconds and recording pixels) are a double click. */
const DOUBLE_GAP = 0.45;
const DOUBLE_DISTANCE = 12;
/** A press held this long is a drag (its release is the drag's end). */
const DRAG_HELD = 0.25;
/** Above this speed a stretch is sped up: its clicks are thinned to one every FAST_GAP. */
export const FAST_SPEED = 2;
export const FAST_GAP = 0.15;

/** The track the clicks are shown on and silenced with (created by set_click_sound). */
export const clicksTrack = (p: Pick<Project, "tracks">): Track | undefined =>
  p.tracks.find((t) => t.clicks);

/** The kinds a recording sounds: the ones asked, or the default. */
export const clickKindsOf = (fx: Pick<CursorFx, "clickInclude">): readonly ClickKind[] =>
  fx.clickInclude?.length ? fx.clickInclude : DEFAULT_CLICK_KINDS;

/** Two moments this close (source seconds) are the same one: how a removed click is found. */
const SAME_MOMENT = 1e-4;

/** Whether the person removed this moment of the recording (`clickRemoved`, by its source second). */
export const isRemovedClick = (fx: Pick<CursorFx, "clickRemoved">, t: number): boolean =>
  !!fx.clickRemoved?.some((r) => Math.abs(r - t) < SAME_MOMENT);

/** One moment of a recording that can sound, in its own seconds. */
export interface ClickMoment {
  t: number;
  kind: ClickKind;
}

/** Every moment of a recording that sounds with these effects, in source seconds and in order. */
export function clickMoments(
  data: Pick<CursorData, "clicks" | "typing">,
  fx: CursorFx,
): ClickMoment[] {
  const out: ClickMoment[] = [];
  const presses = [...data.clicks].sort((a, b) => a[0] - b[0]);
  let previous: (typeof presses)[number] | undefined;
  for (const press of presses) {
    const [t, x, y, , held] = press;
    const double =
      !!previous &&
      t - previous[0] <= DOUBLE_GAP &&
      Math.hypot(x - previous[1], y - previous[2]) <= DOUBLE_DISTANCE;
    if (held >= DRAG_HELD) {
      out.push({ t, kind: "drag_start" });
      out.push({ t: t + held, kind: "drag_end" });
    } else out.push({ t, kind: double ? "double_click" : "click" });
    previous = press;
  }
  for (const t of data.typing ?? []) out.push({ t, kind: "typing" });
  // Each moment with the effects of its own stretch: the sound on, the pointer shown (a click of
  // a moment the pointer is hidden makes no sound, as it makes no ripple), the kind asked, and
  // not one the person removed from the track "Cliques".
  return out
    .filter((m) => {
      const f = fxAt(fx, m.t);
      return (
        !!f.clickSound && !f.hidden && clickKindsOf(f).includes(m.kind) && !isRemovedClick(fx, m.t)
      );
    })
    .sort((a, b) => a.t - b.t);
}

type ClickProject = Pick<Project, "clips" | "tracks" | "assets">;

/** A click of the lesson and where it comes from: its recording and its second there. */
export interface ClickMark extends SoundEvent {
  assetId: string;
  /** Source seconds of the recording: what `clickRemoved` keeps. */
  source: number;
}

/**
 * Every click sound of the lesson on its clock, from the recordings' saved clicks (`cursors`,
 * by media id). A clip sounds when its track is heard and seen and it shows the picture (not the
 * sound taken out of the video, not a zoom layer). On a stretch faster than FAST_SPEED the clicks
 * are at least FAST_GAP apart. Nothing when the track "Cliques" is muted.
 */
export function clickEvents(
  project: ClickProject,
  cursors: ReadonlyMap<string, Pick<CursorData, "clicks" | "typing">>,
): SoundEvent[] {
  // Only what the export takes (main/soundTrack.ts refuses anything else).
  return clickMarks(project, cursors).map(({ at, sound, volume }) => ({ at, sound, volume }));
}

/** clickEvents with where each click comes from (the ticks of the timeline, to remove one). */
export function clickMarks(
  project: ClickProject,
  cursors: ReadonlyMap<string, Pick<CursorData, "clicks" | "typing">>,
): ClickMark[] {
  const track = clicksTrack(project);
  if (track?.muted) return [];
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const raw: (ClickMark & { fast: boolean })[] = [];
  const moments = new Map<string, ClickMoment[]>();
  for (const c of project.clips) {
    const owner = tracks.get(c.trackId);
    const asset = assets.get(c.assetId);
    const data = asset?.cursor ? cursors.get(asset.id) : undefined;
    if (!owner || owner.muted || owner.hidden || !asset || !data) continue;
    if (c.zoomLayer || c.soundOnly || c.regionFx) continue;
    const fx: CursorFx = { ...DEFAULT_CURSOR_FX, ...asset.cursorFx };
    if (!moments.has(asset.id)) moments.set(asset.id, clickMoments(data, fx));
    const from = c.in;
    const to = sourceEnd(c);
    const fast = clipSpeed(c) > FAST_SPEED;
    for (const m of moments.get(asset.id) ?? []) {
      if (m.t < from || m.t >= to) continue;
      const f = fxAt(fx, m.t);
      const volume = Math.max(0, Math.min(1, f.clickVolume ?? CURSOR_EFFECT_DEFAULTS.clickVolume));
      if (volume <= 0) continue;
      const at = timelineAt(c, m.t);
      if (at < c.start - 1e-6 || at >= clipEnd(c)) continue;
      const sound: SoundEffectId = f.clickSoundKind ?? CURSOR_EFFECT_DEFAULTS.clickSoundKind;
      raw.push({ at, sound, volume, fast, assetId: asset.id, source: m.t });
    }
  }
  raw.sort((a, b) => a.at - b.at);
  const out: ClickMark[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const { fast, ...e } of raw) {
    // A sped-up stretch would turn its clicks into a burst: one every FAST_GAP at most.
    if (fast && e.at - last < FAST_GAP) continue;
    last = e.at;
    out.push(e);
  }
  return out;
}
