import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

export interface NativeMediaPaths {
  ffmpeg: string;
  ffprobe: string;
}
export interface MediaInfo {
  kind: "image" | "video" | "audio";
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  size: number;
  videoCodec?: string;
  vfr: boolean;
  pixFmt?: string;
  colorSpace?: string;
  colorRange?: string;
  /** Tags of the picture stream (alpha flags of VP8/VP9, rotation, encoder). */
  videoTags?: Record<string, string>;
}
export function resolveNativeMedia(options: {
  packaged: boolean;
  resourcesPath: string;
  developmentRoot: string;
  developmentBinary?: (name: "ffmpeg" | "ffprobe") => unknown;
}): NativeMediaPaths {
  const binary = (name: "ffmpeg" | "ffprobe") => {
    let file: unknown;
    if (options.packaged) file = join(options.resourcesPath, "native-media", "bin", `${name}.exe`);
    else {
      let root = resolve(options.developmentRoot);
      while (true) {
        const candidate = join(
          root,
          ".cache",
          "edi-native-media",
          "windows-x64",
          "bin",
          `${name}.exe`,
        );
        if (existsSync(candidate)) {
          file = candidate;
          break;
        }
        const parent = dirname(root);
        if (parent === root) break;
        root = parent;
      }
      if (!file) {
        const candidate = options.developmentBinary?.(name);
        file =
          typeof candidate === "object" && candidate !== null && "path" in candidate
            ? candidate.path
            : candidate;
      }
    }
    if (typeof file !== "string" || !isAbsolute(file) || !statSync(file).isFile())
      throw new Error(`${name} indisponível. Prepare o bundle de mídia da suíte.`);
    return file;
  };
  return { ffmpeg: binary("ffmpeg"), ffprobe: binary("ffprobe") };
}
export interface MediaRunOptions {
  /** Jobs named `<id>:<part>` are cancelled together with `<id>`. */
  jobId?: string;
  signal?: AbortSignal;
  /** Total seconds of output, used to turn FFmpeg's out_time into a 0..1 ratio. */
  duration?: number;
  onProgress?: (ratio: number) => void;
  onStdout?: (chunk: Buffer) => void;
  /** Every piece of stderr as it comes; the run keeps only its tail for the error. */
  onStderr?: (text: string) => void;
  /** Resolve with the end of stderr instead of stdout (measurements that print there). */
  capture?: "stderr";
  timeoutMs?: number;
}
export interface NativeMediaOptions {
  /** Processes at once; default 4. A consumer with its own scheduler may lift it. */
  maxRunning?: number;
  /** Ceiling for any run, default 1 h; `null` lets long exports run without one. */
  maxTimeoutMs?: number | null;
  /** Accumulated stdout when no `onStdout` is given; default 2 MiB. */
  maxStdoutBytes?: number;
  /** Default true: a second run with a running ID is refused instead of sharing it. */
  exclusiveJobIds?: boolean;
  /** Message of a run ended by a signal (cancel/kill). */
  cancelledMessage?: string;
  /** Called once per spawned process that carries a job ID (priority, tracking). */
  onSpawn?: (child: ChildProcess, jobId: string) => void;
}
/** A failed run: the last lines as the message, the end of everything it said as detail. */
export class MediaProcessError extends Error {
  readonly detail: string;
  readonly code: number;
  constructor(message: string, detail: string, code: number) {
    super(message);
    this.name = "MediaProcessError";
    this.detail = detail;
    this.code = code;
  }
}
/** Settlement always follows close, including callback/limit/abort failures. */
export class NativeMedia {
  readonly paths: NativeMediaPaths;
  private running = new Map<string, Set<ChildProcess>>();
  private count = 0;
  private encoder: "nvenc" | "x264" | null = null;
  private readonly options: Required<Omit<NativeMediaOptions, "onSpawn" | "maxTimeoutMs">> & {
    maxTimeoutMs: number | null;
    onSpawn?: NativeMediaOptions["onSpawn"];
  };
  constructor(paths: NativeMediaPaths, options: NativeMediaOptions = {}) {
    this.paths = paths;
    this.options = {
      maxRunning: options.maxRunning ?? 4,
      maxTimeoutMs: options.maxTimeoutMs === undefined ? 3_600_000 : options.maxTimeoutMs,
      maxStdoutBytes: options.maxStdoutBytes ?? 2 * 1024 ** 2,
      exclusiveJobIds: options.exclusiveJobIds ?? true,
      cancelledMessage: options.cancelledMessage ?? "Operação de mídia cancelada.",
      onSpawn: options.onSpawn,
    };
  }
  run(bin: string, args: string[], opts: MediaRunOptions = {}): Promise<string> {
    if (![this.paths.ffmpeg, this.paths.ffprobe].includes(bin))
      return Promise.reject(new Error("Executável de mídia não autorizado."));
    const id = opts.jobId ?? crypto.randomUUID();
    if (
      (this.options.exclusiveJobIds && this.running.has(id)) ||
      this.count >= this.options.maxRunning
    )
      return Promise.reject(new Error("Operação de mídia já está em andamento."));
    return new Promise((resolveResult, reject) => {
      opts.signal?.throwIfAborted();
      const progress = !!opts.onProgress && bin === this.paths.ffmpeg;
      const child = spawn(bin, progress ? ["-progress", "pipe:2", "-nostats", ...args] : args, {
        windowsHide: true,
        shell: false,
      });
      const group = this.running.get(id) ?? new Set<ChildProcess>();
      group.add(child);
      this.running.set(id, group);
      this.count++;
      let stdout = "",
        stderr = "",
        progressTail = "",
        size = 0,
        failure: Error | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill("SIGKILL");
      };
      const abort = () => fail(opts.signal?.reason ?? new Error(this.options.cancelledMessage));
      opts.signal?.addEventListener("abort", abort, { once: true });
      if (opts.signal?.aborted) abort();
      const limit =
        this.options.maxTimeoutMs === null
          ? opts.timeoutMs
          : Math.min(opts.timeoutMs ?? this.options.maxTimeoutMs, this.options.maxTimeoutMs);
      const timeout =
        limit === undefined
          ? undefined
          : setTimeout(() => fail(new Error("Tempo limite de processamento de mídia.")), limit);
      if (opts.jobId && this.options.onSpawn) {
        try {
          this.options.onSpawn(child, opts.jobId);
        } catch (error) {
          fail(error);
        }
      }
      child.stdout.on("data", (chunk: Buffer) => {
        try {
          if (opts.onStdout) opts.onStdout(chunk);
          else {
            size += chunk.length;
            if (size > this.options.maxStdoutBytes)
              throw new Error("Resposta de mídia excede o limite.");
            stdout += chunk.toString();
          }
        } catch (error) {
          fail(error);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = (stderr + text).slice(-8000);
        try {
          opts.onStderr?.(text);
          if (!progress || !opts.duration) return;
          progressTail = (progressTail + text).slice(-16000);
          const lines = progressTail.split("\n");
          progressTail = lines.pop() ?? "";
          for (const line of lines) {
            const match = /^out_time_us=(\d+)/.exec(line);
            if (match) opts.onProgress?.(Math.min(1, Number(match[1]) / 1e6 / opts.duration));
          }
        } catch (error) {
          fail(error);
        }
      });
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        opts.signal?.removeEventListener("abort", abort);
        group.delete(child);
        if (!group.size && this.running.get(id) === group) this.running.delete(id);
        this.count--;
        if (failure) reject(failure);
        else if (code === 0 && !signal) resolveResult(opts.capture === "stderr" ? stderr : stdout);
        else if (signal || code === null) reject(new Error(this.options.cancelledMessage));
        else {
          const said = stderr.split("\n").filter((line) => !/^\w+=/.test(line));
          reject(
            new MediaProcessError(
              said.slice(-6).join("\n") || `Mídia saiu com código ${code}`,
              said.join("\n"),
              code,
            ),
          );
        }
      });
    });
  }
  /** Ends the job and every process started under it (`<id>:segment-3`, `<id>:audio`, …). */
  cancel(id: string) {
    for (const [key, group] of this.running)
      if (key === id || key.startsWith(`${id}:`)) for (const child of group) child.kill("SIGKILL");
  }
  /**
   * `scanPackets` (default) measures a missing duration from packet timestamps and refuses an
   * unusable one. Without it a missing duration is reported as 0, for consumers that measure
   * damaged or partial files their own way (EdiAula's take recovery).
   */
  async probe(
    file: string,
    signal?: AbortSignal,
    { scanPackets = true }: { scanPackets?: boolean } = {},
  ): Promise<MediaInfo> {
    if (!isAbsolute(file) || !statSync(file).isFile()) throw new Error("Mídia local inválida.");
    const text = await this.run(
      this.paths.ffprobe,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        file,
      ],
      { signal, timeoutMs: 300_000 },
    );
    const info: {
      format?: { duration?: string; size?: string; format_name?: string };
      streams?: {
        codec_type: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        duration?: string;
        pix_fmt?: string;
        color_space?: string;
        color_range?: string;
        tags?: Record<string, string>;
        disposition?: { attached_pic?: number };
      }[];
    } = JSON.parse(text);
    const video = info.streams?.find(
      (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
    );
    const audio = info.streams?.find((s) => s.codec_type === "audio");
    if (!video && !audio) throw new Error("Arquivo sem vídeo ou áudio reconhecível.");
    const isImage =
      /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(extname(file)) ||
      /image2|_pipe$/.test(info.format?.format_name ?? "");
    let duration = isImage
      ? 0
      : Number(info.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
    // Streaming WebM often lacks a duration header. Read packet timestamps, never guess by bytes.
    if (!Number.isFinite(duration)) duration = 0;
    if (scanPackets && !isImage && !(duration > 0)) {
      let tail = "",
        count = 0,
        maximum = 0;
      const line = (value: string) => {
        if (++count > 10_000_000) throw new Error("Vídeo excede o limite de pacotes.");
        const [pts = NaN, span = 0] = value.split(",").map(Number);
        if (Number.isFinite(pts))
          maximum = Math.max(maximum, pts + (Number.isFinite(span) ? span : 0));
      };
      await this.run(
        this.paths.ffprobe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_entries",
          "packet=pts_time,duration_time",
          "-of",
          "csv=p=0",
          file,
        ],
        {
          signal,
          timeoutMs: 300_000,
          onStdout: (chunk) => {
            tail += chunk.toString();
            if (tail.length > 1024 * 1024) throw new Error("Pacote de mídia inválido.");
            const lines = tail.split("\n");
            tail = lines.pop() ?? "";
            for (const value of lines) line(value);
          },
        },
      );
      if (tail) line(tail);
      duration = maximum;
    }
    if (scanPackets && !isImage && (duration <= 0 || duration > 86400))
      throw new Error("Duração de mídia inválida ou superior a 24 horas.");
    const rate = (value?: string) => {
      const [a = 0, b = 0] = (value ?? "0").split("/").map(Number);
      const n = b ? a / b : a;
      return Number.isFinite(n) ? n : 0;
    };
    const nominal = rate(video?.r_frame_rate),
      average = rate(video?.avg_frame_rate);
    return {
      kind: isImage ? "image" : video ? "video" : "audio",
      duration,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: Math.round((average || nominal) * 100) / 100,
      hasVideo: !!video,
      hasAudio: !!audio && !isImage,
      size: statSync(file).size,
      videoCodec: video?.codec_name,
      vfr: !isImage && !!nominal && !!average && Math.abs(nominal - average) / nominal > 0.02,
      pixFmt: video?.pix_fmt,
      colorSpace: video?.color_space,
      colorRange: video?.color_range,
      videoTags: video?.tags,
    };
  }
  async frame(file: string, output: string, at: number, width?: number, signal?: AbortSignal) {
    if (
      !Number.isFinite(at) ||
      at < 0 ||
      at > 86400 ||
      (width !== undefined && (!Number.isInteger(width) || width < 2 || width > 4096))
    )
      throw new Error("Quadro inválido.");
    if (!isAbsolute(file) || !statSync(file).isFile() || !isAbsolute(output))
      throw new Error("Quadro requer arquivos locais.");
    await this.run(
      this.paths.ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        file,
        "-ss",
        String(at),
        "-map",
        "0:V:0",
        "-frames:v",
        "1",
        ...(width ? ["-vf", `scale=${width}:-2`] : []),
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-an",
        output,
      ],
      { signal },
    );
  }
  async detectEncoder(): Promise<"nvenc" | "x264"> {
    if (this.encoder) return this.encoder;
    try {
      await this.run(
        this.paths.ffmpeg,
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=s=256x256:d=0.2",
          "-c:v",
          "h264_nvenc",
          "-f",
          "null",
          "-",
        ],
        { timeoutMs: 30000 },
      );
      this.encoder = "nvenc";
    } catch {
      this.encoder = "x264";
    }
    return this.encoder;
  }
}
