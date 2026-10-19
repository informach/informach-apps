import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { MediaInfo, NativeMedia } from "@informach/edi-desktop/native-media";
import type { CaptureDocument } from "../domain/document.ts";
import {
  gifEstimate,
  type VideoOutput,
  validateVideoRecipe,
  videoOutputSchema,
} from "../domain/quick-video.ts";
import { assertVideoDiskSpace, MAX_VIDEO_BYTES, videoIdentity } from "./video-files.ts";

export interface VideoLibrary {
  root: string;
  file(id: string, extension: string): string;
  read(id: string): Promise<CaptureDocument>;
  save(value: Partial<CaptureDocument>): Promise<CaptureDocument>;
}
const sameFile = (
  a: Awaited<ReturnType<typeof videoIdentity>>,
  b: Awaited<ReturnType<typeof videoIdentity>>,
) =>
  a.ino === b.ino &&
  a.dev === b.dev &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;

export class QuickVideo {
  readonly media: NativeMedia;
  readonly cache: string;
  private active: { id: string; controller: AbortController; done: Promise<unknown> } | null = null;
  constructor(media: NativeMedia, cache: string) {
    this.media = media;
    this.cache = cache;
  }
  get busy() {
    return this.active !== null;
  }
  async cancel(id?: string) {
    const active = this.active;
    if (!active || (id && active.id !== id)) return;
    active.controller.abort();
    await active.done.catch(() => undefined);
  }
  private async source(lib: VideoLibrary, id: string) {
    const doc = await lib.read(id);
    if (doc.kind !== "video" || doc.deletedAt) throw new Error("Vídeo indisponível.");
    const file = lib.file(id, "webm"),
      identity = await videoIdentity(file);
    return { doc, file, identity };
  }
  async inspect(lib: VideoLibrary, id: string, assertAuthority: () => void) {
    if (this.busy) throw new Error("Aguarde a operação de vídeo atual.");
    const jobId = randomUUID(),
      controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const source = await this.source(lib, id);
      const poster = join(this.cache, `${jobId}.png`);
      await mkdir(this.cache, { recursive: true });
      try {
        assertAuthority();
        const info = await this.media.probe(source.file, controller.signal);
        if (
          info.kind !== "video" ||
          !info.width ||
          !info.height ||
          info.width * info.height > 100_000_000
        )
          throw new Error("Vídeo sem dimensões válidas.");
        await this.media.frame(
          source.file,
          poster,
          Math.min(info.duration / 10, 5),
          320,
          controller.signal,
        );
        if ((await stat(poster)).size > 1_000_000) throw new Error("Miniatura excede o limite.");
        const preview = `data:image/png;base64,${(await readFile(poster)).toString("base64")}`;
        if (!sameFile(source.identity, await videoIdentity(source.file)))
          throw new Error("O vídeo mudou durante a leitura.");
        assertAuthority();
        controller.signal.throwIfAborted();
        await lib.save({
          id,
          preview,
          media: {
            status: "ready",
            durationSeconds: info.duration,
            width: info.width,
            height: info.height,
            hasAudio: info.hasAudio,
          },
        });
        assertAuthority();
        return await lib.read(id);
      } catch (error) {
        if (!controller.signal.aborted) {
          assertAuthority();
          await lib.save({
            id,
            media: {
              status: "failed",
              error: error instanceof Error ? error.message.slice(0, 500) : "Falha ao ler vídeo.",
            },
          });
        }
        throw error;
      } finally {
        await rm(poster, { force: true });
      }
    });
    this.active = { id: jobId, controller, done };
    try {
      return await done;
    } finally {
      this.active = null;
    }
  }
  async output(
    lib: VideoLibrary,
    raw: unknown,
    destination: string | null,
    assertAuthority: () => void,
    onProgress: (ratio: number) => void,
  ) {
    const input = videoOutputSchema.parse(raw);
    if (this.busy) throw new Error("Aguarde a operação de vídeo atual.");
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const source = await this.source(lib, input.id);
      assertAuthority();
      controller.signal.throwIfAborted();
      const info = await this.media.probe(source.file, controller.signal);
      const recipe = validateVideoRecipe(input.recipe, info.duration);
      if (
        info.kind !== "video" ||
        !info.width ||
        !info.height ||
        info.width * info.height > 100_000_000
      )
        throw new Error("Dimensões de vídeo inválidas.");
      if (input.format === "png" && (input.at < recipe.start || input.at >= recipe.end))
        throw new Error("Quadro fora do intervalo selecionado.");
      const width = Math.max(
        2,
        Math.floor(Math.min(input.width, info.width, input.format === "gif" ? 960 : 1920) / 2) * 2,
      );
      const height = Math.max(2, Math.round((width * info.height) / info.width / 2) * 2);
      if (height > 4096) throw new Error("Altura de saída excede 4096 pixels.");
      const duration = recipe.end - recipe.start;
      if (input.format === "gif" && duration > 30)
        throw new Error("GIF aceita até 30 segundos por intervalo.");
      const estimate =
        input.format === "gif"
          ? gifEstimate(recipe, width, height, input.fps)
          : input.format === "png"
            ? info.width * info.height * 4
            : Math.ceil(duration * 1_100_000);
      if (estimate > MAX_VIDEO_BYTES - 8_000_000)
        throw new Error("Saída excede o limite de 32 GiB. Reduza o intervalo.");
      await mkdir(this.cache, { recursive: true });
      const target = destination ?? join(this.cache, `${input.jobId}.${input.format}`);
      if (!isAbsolute(target))
        throw new Error("Destino de mídia deve ser um arquivo local absoluto.");
      const comparable = (value: string) =>
        process.platform === "win32" ? value.toLowerCase() : value;
      const libraryPath = comparable(await realpath(lib.root));
      const sourcePath = comparable(await realpath(source.file));
      const destinationPath = async () =>
        comparable(join(await realpath(dirname(resolve(target))), basename(target)));
      const initialDestination = await destinationPath();
      const assertDestination = async () => {
        const actual = await destinationPath();
        if (
          actual !== initialDestination ||
          actual === sourcePath ||
          actual === libraryPath ||
          actual.startsWith(libraryPath + sep)
        )
          throw new Error(
            "O original não pode ser substituído; escolha um destino fora da biblioteca.",
          );
      };
      await assertDestination();
      const staging = join(dirname(target), `.${randomUUID()}.partial.${input.format}`);
      await assertVideoDiskSpace(dirname(target), estimate + 8_000_000);
      let published = false;
      try {
        if (input.format === "png")
          await this.media.frame(source.file, staging, input.at, undefined, controller.signal);
        else
          await this.media.run(
            this.media.paths.ffmpeg,
            this.arguments(
              source.file,
              staging,
              input,
              info,
              recipe.start,
              duration,
              width,
              height,
              estimate + 8_000_000,
            ),
            { signal: controller.signal, jobId: input.jobId, duration, onProgress },
          );
        controller.signal.throwIfAborted();
        assertAuthority();
        const rendered = await this.media.probe(staging, controller.signal);
        if (
          !rendered.hasVideo ||
          rendered.width !== (input.format === "png" ? info.width : width) ||
          rendered.height !== (input.format === "png" ? info.height : height)
        )
          throw new Error("Dimensões da saída não conferem.");
        if (
          input.format === "mp4" &&
          (rendered.videoCodec !== "h264" ||
            rendered.hasAudio !== info.hasAudio ||
            Math.abs(rendered.duration - duration) > 0.25)
        )
          throw new Error("Duração ou codecs da saída não conferem.");
        if (input.format === "gif") {
          const value = await this.media.run(
            this.media.paths.ffprobe,
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration",
              "-of",
              "default=noprint_wrappers=1:nokey=1",
              staging,
            ],
            { signal: controller.signal },
          );
          const renderedDuration = Number(value.trim());
          if (
            !Number.isFinite(renderedDuration) ||
            Math.abs(renderedDuration - duration) > 1 / input.fps + 0.03
          )
            throw new Error("Duração do GIF não confere.");
        }
        const outputStat = await videoIdentity(staging);
        if (
          outputStat.size > estimate + 8_000_000 ||
          !sameFile(source.identity, await videoIdentity(source.file))
        )
          throw new Error("Mídia alterada ou saída excedeu orçamento.");
        await assertVideoDiskSpace(dirname(target), 0);
        const handle = await open(staging, "r+");
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
        controller.signal.throwIfAborted();
        assertAuthority();
        await assertDestination();
        // Canonicalization yields: recheck authority at the publication boundary.
        controller.signal.throwIfAborted();
        assertAuthority();
        await rename(staging, target);
        published = true;
        onProgress(1);
        return {
          file: target,
          format: input.format,
          bytes: outputStat.size,
          estimatedBytes: estimate,
          duration,
          width: rendered.width,
          height: rendered.height,
        };
      } finally {
        // NativeMedia settles only on close, so the child never writes into removed staging.
        if (!published) await rm(staging, { force: true });
      }
    });
    this.active = { id: input.jobId, controller, done };
    try {
      return await done;
    } finally {
      this.active = null;
    }
  }
  private arguments(
    file: string,
    target: string,
    input: VideoOutput,
    info: MediaInfo,
    start: number,
    duration: number,
    width: number,
    height: number,
    maxBytes: number,
  ) {
    const base = [
      "-y",
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      file,
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-map",
      "0:V:0",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
    ];
    if (input.format === "gif")
      return [
        ...base,
        "-an",
        "-vf",
        `fps=${input.fps},scale=${width}:${height}:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`,
        "-loop",
        "0",
        "-fs",
        String(maxBytes),
        target,
      ];
    return [
      ...base,
      ...(info.hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
      "-vf",
      `scale=${width}:${height},setsar=1`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      input.quality === "compact" ? "28" : "23",
      "-maxrate",
      "8M",
      "-bufsize",
      "16M",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-fs",
      String(maxBytes),
      target,
    ];
  }
}
