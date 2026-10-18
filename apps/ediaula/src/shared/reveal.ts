import type { Annotation } from "./annotation.ts";
import type { Asset, Clip, Project, RevealSprite } from "./types.ts";

/**
 * Annotations that come in (annotation.reveal): text word by word, and arrows and lines drawn
 * like a stroke. The preview and the export draw each state with the same function
 * (lib/annotations.ts renderAnnotation); the export receives them as a transparent video made
 * in the renderer, the same way as the pointer sprite. Word times come from the transcript when
 * the words are said while the annotation shows (an annotation placed by the assistant with
 * near_text sits where its words are said); otherwise the words come one after the other.
 */

/** Seconds an arrow or a line takes to be drawn (at most half of the clip). */
export const DRAW_SECONDS = 0.8;
/** Seconds between words when nobody says them. */
export const WORD_STEP = 0.28;

/** Kinds with text that can come in word by word. */
export const TEXT_REVEAL = new Set(["balloon", "note", "label", "title", "card", "lowerthird"]);
export const DRAW_REVEAL = new Set(["arrow", "line"]);

/** What can come in, for each kind: words, a stroke, or nothing. */
export function revealKind(a: Pick<Annotation, "kind">): "words" | "draw" | null {
  return TEXT_REVEAL.has(a.kind) ? "words" : DRAW_REVEAL.has(a.kind) ? "draw" : null;
}

/** The words of an annotation, in the order they are drawn (main text, then the line below). */
export function revealWords(a: Pick<Annotation, "kind" | "text" | "subtitle">): string[] {
  const split = (t?: string): string[] => (t ?? "").split(/\s+/).filter(Boolean);
  return a.kind === "lowerthird" || a.kind === "card"
    ? [...split(a.text), ...split(a.subtitle)]
    : split(a.text);
}

const plain = (w: string): string =>
  w
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();

/**
 * When each word appears, seconds from the clip's start. Words of the annotation said while it
 * shows (in order, from `spoken`: timeline words) appear when they are said; the others come
 * WORD_STEP after the word before (the first at 0). Times only go forward.
 */
export function revealTimes(
  a: Pick<Annotation, "kind" | "text" | "subtitle">,
  clip: Pick<Clip, "start" | "duration">,
  spoken: readonly { start: number; text: string }[] = [],
): number[] {
  const words = revealWords(a);
  const heard = spoken
    .filter((w) => w.start >= clip.start - 0.5 && w.start < clip.start + clip.duration)
    .map((w) => ({ t: w.start - clip.start, key: plain(w.text) }))
    .sort((x, y) => x.t - y.t);
  const out: number[] = [];
  let from = 0;
  let last = -WORD_STEP;
  for (const word of words) {
    const key = plain(word);
    const hit = key ? heard.findIndex((h, i) => i >= from && h.key === key) : -1;
    let t = last + WORD_STEP;
    if (hit >= 0 && heard[hit].t - last < 4) {
      t = Math.max(0, heard[hit].t);
      from = hit + 1;
    }
    t = Math.max(t, last, 0);
    // Every word shows before the clip ends.
    t = Math.min(t, Math.max(0, clip.duration - 0.2));
    out.push(t);
    last = t;
  }
  return out;
}

/** What shows `local` seconds into the clip: how many words, or how much of the stroke. */
export interface RevealState {
  words?: number;
  draw?: number;
}

/** Steps of a drawn stroke: the state changes at most this often per second of drawing. */
const DRAW_STEPS = 24;

export function revealAt(
  a: Pick<Annotation, "kind" | "reveal">,
  times: readonly number[],
  duration: number,
  local: number,
): RevealState | null {
  if (!a.reveal) return null;
  if (a.reveal === "draw" && revealKind(a) === "draw") {
    const length = Math.min(DRAW_SECONDS, Math.max(0.1, duration / 2));
    const p = Math.min(1, Math.max(0, local / length));
    return { draw: Math.round(p * DRAW_STEPS) / DRAW_STEPS };
  }
  if (a.reveal === "words" && revealKind(a) === "words") {
    let words = 0;
    for (const t of times) if (local + 1e-6 >= t) words++;
    return { words };
  }
  return null;
}

/** A stable key of a state, for caching its picture. */
export const revealKey = (s: RevealState): string =>
  s.draw !== undefined ? `d${s.draw}` : `w${s.words ?? 0}`;

/** Whether the state is the whole annotation (its own PNG shows it). */
export function revealDone(s: RevealState | null, words: number): boolean {
  return !s || (s.draw !== undefined ? s.draw >= 1 : (s.words ?? 0) >= words);
}

/** FNV-1a of a text, as hex: the cache key of an annotation's sprite. */
export function revealHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * The project as the export draws it with the animated annotations: each clip with a sprite
 * plays it as a transparent video (a media of its own, from its first frame) instead of the
 * still picture.
 */
export function withRevealSprites<T extends Pick<Project, "assets" | "clips">>(
  p: T,
  reveals: Record<string, RevealSprite> | undefined,
): T {
  if (!reveals || !Object.keys(reveals).length) return p;
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const added: Asset[] = [];
  const clips = p.clips.map((c) => {
    const sprite = reveals[c.id];
    const asset = assets.get(c.assetId);
    if (!sprite || !asset || !c.annotation) return c;
    const id = `${asset.id}~reveal~${c.id}`;
    added.push({
      ...asset,
      id,
      path: sprite.sprite,
      kind: "video",
      duration: c.duration,
      fps: sprite.fps,
      width: sprite.width,
      height: sprite.height,
      hasVideo: true,
      hasAudio: false,
      alpha: true,
      proxyStatus: "none",
    });
    return { ...c, assetId: id, in: 0 };
  });
  return added.length ? { ...p, assets: [...p.assets, ...added], clips } : p;
}
