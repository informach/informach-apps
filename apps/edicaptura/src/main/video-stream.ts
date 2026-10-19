import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import type { Readable } from "node:stream";
import { COPY_BUFFER_BYTES, videoIdentity } from "./video-files.ts";

export function videoRange(value: string | null, size: number) {
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
    throw new Error("Intervalo fora do vídeo.");
  return { start, end, partial: true };
}

/** Capabilities live only in the editor's dedicated Electron session. */
export class VideoStreams {
  private assets = new Map<
    string,
    {
      file: string;
      mime: string;
      root: string;
      id: string;
      size: number;
      ino: number;
      dev: number;
      mtimeMs: number;
      ctimeMs: number;
    }
  >();
  private active = new Set<Readable>();
  private streamFiles = new Map<Readable, string>();
  private opening = 0;
  private generation = 0;
  private allowed: (root: string) => boolean;
  constructor(allowed: (root: string) => boolean) {
    this.allowed = allowed;
  }
  async grant(
    root: string,
    id: string,
    file: string,
    mime: "video/webm" | "video/mp4" | "image/gif" = "video/webm",
  ) {
    const generation = this.generation;
    const stat = await videoIdentity(file);
    if (generation !== this.generation)
      throw new Error("A biblioteca mudou durante a leitura do vídeo.");
    for (const [token, asset] of this.assets)
      if (
        asset.root === root &&
        asset.file === file &&
        asset.mime === mime &&
        asset.id === id &&
        asset.size === stat.size &&
        asset.mtimeMs === stat.mtimeMs &&
        asset.ctimeMs === stat.ctimeMs &&
        asset.ino === stat.ino &&
        asset.dev === stat.dev
      )
        return `edicaptura-media://video/${token}`;
    if (this.assets.size >= 128) this.assets.delete(this.assets.keys().next().value ?? "");
    const token = randomBytes(32).toString("hex");
    this.assets.set(token, {
      root,
      id,
      file,
      mime,
      size: stat.size,
      ino: stat.ino,
      dev: stat.dev,
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
    });
    return `edicaptura-media://video/${token}`;
  }
  async revokeFile(file: string) {
    for (const [token, asset] of this.assets) if (asset.file === file) this.assets.delete(token);
    await Promise.all(
      [...this.streamFiles]
        .filter(([, path]) => path === file)
        .map(
          ([stream]) =>
            new Promise<void>((done) => {
              if (stream.closed) return done();
              stream.once("close", done);
              stream.destroy();
            }),
        ),
    );
  }
  revoke() {
    this.generation++;
    this.assets.clear();
    for (const stream of this.active) stream.destroy(new Error("Acesso ao vídeo encerrado."));
    this.active.clear();
  }
  async respond(request: Request): Promise<Response> {
    const match = /^edicaptura-media:\/\/video\/([a-f0-9]{64})$/.exec(request.url);
    const asset = match?.[1] ? this.assets.get(match[1]) : undefined;
    if (!asset || !this.allowed(asset.root)) return new Response(null, { status: 403 });
    const token = match?.[1];
    const valid = () => !!token && this.assets.get(token) === asset && this.allowed(asset.root);
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
    if (this.opening + this.active.size >= 8) return new Response(null, { status: 429 });
    this.opening++;
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(asset.file, "r");
    } catch {
      this.opening--;
      return new Response(null, { status: 404 });
    }
    let transferred = false;
    try {
      const actual = await handle.stat();
      if (
        !actual.isFile() ||
        actual.ino !== asset.ino ||
        actual.dev !== asset.dev ||
        actual.size !== asset.size ||
        actual.mtimeMs !== asset.mtimeMs ||
        actual.ctimeMs !== asset.ctimeMs ||
        !valid()
      )
        return new Response(null, { status: 403 });
      let range: ReturnType<typeof videoRange>;
      try {
        range = videoRange(request.headers.get("range"), actual.size);
      } catch {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${actual.size}` },
        });
      }
      const headers: Record<string, string> = {
        "Content-Type": asset.mime,
        "Content-Length": String(range.end - range.start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (range.partial)
        headers["Content-Range"] = `bytes ${range.start}-${range.end}/${actual.size}`;
      if (request.method === "HEAD")
        return new Response(null, { status: range.partial ? 206 : 200, headers });
      const stream = handle.createReadStream({
        start: range.start,
        end: range.end,
        highWaterMark: COPY_BUFFER_BYTES,
        autoClose: true,
        signal: request.signal,
      });
      this.active.add(stream);
      this.streamFiles.set(stream, asset.file);
      stream.once("close", () => {
        this.active.delete(stream);
        this.streamFiles.delete(stream);
      });
      transferred = true;
      const iterator = stream[Symbol.asyncIterator]();
      const body = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          if (!valid()) {
            await iterator.return?.();
            controller.error(new Error("Acesso ao vídeo encerrado."));
            return;
          }
          const { done, value } = await iterator.next();
          if (!valid()) {
            await iterator.return?.();
            controller.error(new Error("Acesso ao vídeo encerrado."));
            return;
          }
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
      this.opening--;
      if (!transferred) await handle.close();
    }
  }
}
