/** One byte range of a local media file, as `<video>` seeking asks for it. */
export interface ByteRange {
  start: number;
  end: number;
  /** False when the request asked for the whole file (no Range header). */
  partial: boolean;
}

/**
 * Parses a single `bytes=` range strictly: one range, safe integers, inside the file. Throws on
 * anything else so the caller answers 416 instead of guessing.
 */
export function byteRange(value: string | null, size: number): ByteRange {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error("Intervalo inválido.");
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if (
    (first !== null && !Number.isSafeInteger(first)) ||
    (last !== null && !Number.isSafeInteger(last))
  )
    throw new Error("Intervalo inválido.");
  const start = first === null ? Math.max(0, size - (last ?? 0)) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  if (start < 0 || start >= size || end < start || (first === null && last === 0))
    throw new Error("Intervalo fora da mídia.");
  return { start, end, partial: true };
}

/** Headers of a 200/206 answer for `range`; local media is never cached nor sniffed. */
export function rangeHeaders(range: ByteRange, size: number, mime: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Length": String(Math.max(0, range.end - range.start + 1)),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range.partial) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
  return headers;
}

/** The 416 answer for a range that `byteRange` refused. */
export const rangeNotSatisfiable = (size: number, extra: Record<string, string> = {}) =>
  new Response(null, { status: 416, headers: { ...extra, "Content-Range": `bytes */${size}` } });
