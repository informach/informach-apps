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
  jobId?: string;
  signal?: AbortSignal;
  duration?: number;
  onProgress?: (ratio: number) => void;
  onStdout?: (chunk: Buffer) => void;
  timeoutMs?: number;
}
/** One owner per ID; settlement always follows close, including callback/limit/abort failures. */
export class NativeMedia {
  readonly paths: NativeMediaPaths;
  private running = new Map<string, ChildProcess>();
  private encoder: "nvenc" | "x264" | null = null;
  constructor(paths: NativeMediaPaths) {
    this.paths = paths;
  }
  run(bin: string, args: string[], opts: MediaRunOptions = {}): Promise<string> {
    if (![this.paths.ffmpeg, this.paths.ffprobe].includes(bin))
      return Promise.reject(new Error("Executável de mídia não autorizado."));
    const id = opts.jobId ?? crypto.randomUUID();
    if (this.running.has(id) || this.running.size >= 4)
      return Promise.reject(new Error("Operação de mídia já está em andamento."));
    return new Promise((resolveResult, reject) => {
      opts.signal?.throwIfAborted();
      const progress = !!opts.onProgress && bin === this.paths.ffmpeg;
      const child = spawn(bin, progress ? ["-progress", "pipe:2", "-nostats", ...args] : args, {
        windowsHide: true,
        shell: false,
      });
      this.running.set(id, child);
      let stdout = "",
        stderr = "",
        progressTail = "",
        size = 0,
        failure: Error | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill("SIGKILL");
      };
      const abort = () => fail(opts.signal?.reason ?? new Error("Operação de mídia cancelada."));
      opts.signal?.addEventListener("abort", abort, { once: true });
      if (opts.signal?.aborted) abort();
      const timeout = setTimeout(
        () => fail(new Error("Tempo limite de processamento de mídia.")),
        Math.min(opts.timeoutMs ?? 3_600_000, 3_600_000),
      );
      child.stdout.on("data", (chunk: Buffer) => {
        try {
          if (opts.onStdout) opts.onStdout(chunk);
          else {
            size += chunk.length;
            if (size > 2 * 1024 ** 2) throw new Error("Resposta de mídia excede 2 MiB.");
            stdout += chunk.toString();
          }
        } catch (error) {
          fail(error);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-8000);
        if (!progress || !opts.duration) return;
        progressTail = (progressTail + chunk.toString()).slice(-16000);
        const lines = progressTail.split("\n");
        progressTail = lines.pop() ?? "";
        try {
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
        this.running.delete(id);
        if (failure) reject(failure);
        else if (code === 0 && !signal) resolveResult(stdout);
        else
          reject(
            new Error(
              signal || code === null
                ? "Operação de mídia cancelada."
                : stderr
                    .split("\n")
                    .filter((line) => !/^\w+=/.test(line))
                    .slice(-6)
                    .join("\n") || `Mídia saiu com código ${code}`,
            ),
          );
      });
    });
  }
  cancel(id: string) {
    this.running.get(id)?.kill("SIGKILL");
  }
  async probe(file: string, signal?: AbortSignal): Promise<MediaInfo> {
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
    if (!isImage && !(duration > 0 && Number.isFinite(duration))) {
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
    if (!isImage && (!Number.isFinite(duration) || duration <= 0 || duration > 86400))
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
