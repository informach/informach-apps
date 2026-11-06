/** One subtitle line on screen, in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Subtitle files above this are refused: no real subtitle comes close. */
export const SUBTITLE_LIMIT = 8 * 1024 * 1024;

const TIME = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;

function seconds(stamp: string): number | null {
  const m = TIME.exec(stamp.trim());
  if (!m) return null;
  const [, h = "0", min = "0", s = "0", frac = "0"] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(frac.padEnd(3, "0")) / 1000;
}

/**
 * Reads SRT or WebVTT. Broken blocks are skipped, never guessed; tags other than <b>, <i>, <u>
 * are dropped so the text cannot carry markup into the player.
 */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [left = "", right = ""] = (lines.at(at) ?? "").split("-->");
    const start = seconds(left),
      end = seconds(right.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end <= start) continue;
    const body = lines
      .slice(at + 1)
      .join("\n")
      .replace(/<(?!\/?[biu]>)[^>]*>/gi, "")
      .replace(/\{\\[^}]*\}/g, "")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Moves every cue by `delay` seconds; cues pushed before zero are clipped or dropped. */
export function shiftCues(cues: readonly Cue[], delay: number): Cue[] {
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start + delay), end: c.end + delay }))
    .filter((c) => c.end > c.start + 0.01);
}

const stamp = (t: number, comma: boolean): string => {
  const ms = Math.round(Math.max(0, t) * 1000);
  const h = Math.floor(ms / 3_600_000),
    m = Math.floor((ms % 3_600_000) / 60_000),
    s = Math.floor((ms % 60_000) / 1000),
    rest = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${comma ? "," : "."}${p(rest, 3)}`;
};

export function toWebVtt(cues: readonly Cue[]): string {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}`).join("\n\n")}\n`;
}

export function toSrt(cues: readonly Cue[]): string {
  return `${cues.map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}`).join("\n\n")}\n`;
}
