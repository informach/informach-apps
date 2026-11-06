import { randomBytes } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { Readable } from "node:stream";
import {
  type ByteRange,
  byteRange,
  rangeHeaders,
  rangeNotSatisfiable,
} from "@informach/edi-desktop/media-range";

export const MEDIA_SCHEME = "ediplayer-media";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

interface Asset {
  file: string;
  mime: string;
  size: number;
  ino: number;
  dev: number;
  mtimeMs: number;
}

/**
 * Files the window may load, behind unguessable tokens (the model is EdiCaptura's
 * video-stream.ts): no path ever appears in a URL, a changed file stops streaming, ranges come
 * from the suite's helpers. The CORS header lets Web Audio read the sound for the volume boost.
 */
export class MediaStreams {
  private assets = new Map<string, Asset>();
  private active = new Set<Readable>();

  async grant(file: string): Promise<string> {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("Arquivo de mídia inválido.");
    const mime = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
    for (const [token, a] of this.assets)
      if (a.file === file && a.size === s.size && a.mtimeMs === s.mtimeMs && a.ino === s.ino)
        return `${MEDIA_SCHEME}://media/${token}`;
    if (this.assets.size >= 512) this.assets.delete(this.assets.keys().next().value ?? "");
    const token = randomBytes(32).toString("hex");
    this.assets.set(token, {
      file,
      mime,
      size: s.size,
      ino: s.ino,
      dev: s.dev,
      mtimeMs: s.mtimeMs,
    });
    return `${MEDIA_SCHEME}://media/${token}`;
  }

  revokeAll(): void {
    this.assets.clear();
    for (const stream of this.active) stream.destroy(new Error("Acesso encerrado."));
    this.active.clear();
  }

  async respond(request: Request): Promise<Response> {
    const cors = { "Access-Control-Allow-Origin": "*" };
    const match = new RegExp(`^${MEDIA_SCHEME}://media/([a-f0-9]{64})$`).exec(request.url);
    const asset = match?.[1] ? this.assets.get(match[1]) : undefined;
    if (!asset) return new Response(null, { status: 403, headers: cors });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405, headers: cors });
    if (this.active.size >= 16) return new Response(null, { status: 429, headers: cors });
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(asset.file, "r");
    } catch {
      return new Response(null, { status: 404, headers: cors });
    }
    let handed = false;
    try {
      const actual = await handle.stat();
      if (
        actual.ino !== asset.ino ||
        actual.dev !== asset.dev ||
        actual.size !== asset.size ||
        actual.mtimeMs !== asset.mtimeMs
      )
        return new Response(null, { status: 410, headers: cors });
      let range: ByteRange;
      try {
        range = byteRange(request.headers.get("range"), actual.size);
      } catch {
        return rangeNotSatisfiable(actual.size, cors);
      }
      const headers = { ...rangeHeaders(range, actual.size, asset.mime), ...cors };
      if (request.method === "HEAD")
        return new Response(null, { status: range.partial ? 206 : 200, headers });
      const stream = handle.createReadStream({
        start: range.start,
        end: range.end,
        highWaterMark: 1024 * 1024,
        autoClose: true,
        signal: request.signal,
      });
      this.active.add(stream);
      stream.once("close", () => this.active.delete(stream));
      handed = true;
      const iterator = stream[Symbol.asyncIterator]();
      const body = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          const { done, value } = await iterator.next();
          if (done) controller.close();
          else if (value instanceof Uint8Array) controller.enqueue(value);
          else controller.error(new Error("Resposta de mídia inválida."));
        },
        cancel: async () => {
          await iterator.return?.();
        },
      });
      return new Response(body, { status: range.partial ? 206 : 200, headers });
    } finally {
      if (!handed) await handle.close();
    }
  }
}
