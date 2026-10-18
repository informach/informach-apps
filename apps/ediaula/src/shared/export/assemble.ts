import type { PublishInfo } from "../types.ts";
import { frameTime, type Rate } from "./frames.ts";

/**
 * Putting the segments together: FFmpeg's concat demuxer reads them one after the other, each
 * lasting exactly its frames, and copies the picture without encoding it again.
 */

/** The concat list: every segment with its exact duration. */
export function concatList(segments: readonly { path: string; frames: number }[], r: Rate): string {
  const quote = (path: string): string => `'${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
  return `ffconcat version 1.0\n${segments
    .map(
      (s) =>
        `file ${quote(s.path)}\nduration ${(Math.round(frameTime(s.frames, r) * 1e6) / 1e6).toString()}\n`,
    )
    .join("")}`;
}

/** FFMETADATA escapes =, ;, #, the backslash and line breaks. */
const metaText = (text: string): string =>
  text.replace(/[\\=;#]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\\n");

/**
 * Title and chapters of the lesson (from the publishing texts) as an FFMETADATA file, or null
 * when there are none. A chapter lasts until the next one; chapters past the end are left out.
 */
export function ffmetadata(publish: PublishInfo | undefined, duration: number): string | null {
  const ms = (t: number): number => Math.round(t * 1000);
  const chapters = [...(publish?.chapters ?? [])]
    .filter((c) => c.time >= 0 && c.time < duration && c.title.trim())
    .sort((a, b) => a.time - b.time);
  const title = publish?.title?.trim();
  if (!title && !chapters.length) return null;
  const lines = [";FFMETADATA1"];
  if (title) lines.push(`title=${metaText(title)}`);
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].time : duration;
    if (ms(end) <= ms(c.time)) return;
    lines.push(
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${ms(c.time)}`,
      `END=${ms(end)}`,
      `title=${metaText(c.title.trim())}`,
    );
  });
  return `${lines.join("\n")}\n`;
}
