import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { NativeMedia, type NativeMediaPaths } from "@informach/edi-desktop/native-media";
import { LOCAL_INPUT } from "../shared/media/args.ts";
import { factsFromProbe, keyframesFromPackets } from "../shared/media/probe-parse.ts";
import type { FrameSheet, MediaFacts, PlaybackMode } from "../shared/types.ts";

/** Frame sheets: 10 × 6 tiles of 160 px, enough for the bar preview and the ruler. */
const SHEET_COLUMNS = 10;
const SHEET_ROWS = 6;
const TILE_WIDTH = 160;
/** Waveform bars kept per file, whatever its length. */
const WAVE_BARS = 1200;
const BACKGROUND_SLOTS = 3;
/** Picture codecs an MP4 copy can carry as they are. */
const MP4_PICTURES = new Set(["h264", "hevc", "av1", "vp9"]);
/** Previews and copies kept on disk; the oldest go first. */
export const CACHE_LIMIT = 6 * 1024 ** 3;

type SheetFile = Omit<FrameSheet, "url"> & { file: string };

/**
 * Everything EdiPlayer asks of FFmpeg except the edits: facts, keyframes, frame sheets,
 * waveforms, playable copies and subtitle tracks, each cached per file version
 * (path + size + modification time) under `cacheRoot`. No Electron here, so the integration
 * tests drive it with the real binaries.
 */
export class MediaEngine {
  readonly media: NativeMedia;
  private readonly facts = new Map<string, Promise<MediaFacts>>();
  private readonly keys = new Map<string, Promise<number[]>>();
  private readonly preparing = new Map<string, Promise<string>>();
  private readonly sheets = new Map<string, Promise<SheetFile>>();
  private readonly waves = new Map<string, Promise<number[]>>();
  private readonly thumbs = new Map<string, Promise<string>>();
  private readonly cacheRoot: string;
  /** Background work (sheets, waves, thumbnails, keyframes) waits its turn instead of failing. */
  private busy = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(paths: NativeMediaPaths, cacheRoot: string) {
    this.cacheRoot = cacheRoot;
    // No ceiling here: edits must never be refused because the window asked for thumbnails.
    // Background work is queued by `background` instead.
    this.media = new NativeMedia(paths, {
      maxRunning: Number.POSITIVE_INFINITY,
      maxTimeoutMs: null,
      maxStdoutBytes: 64 * 1024 ** 2,
      cancelledMessage: "Cancelado.",
    });
  }

  get ffmpeg(): string {
    return this.media.paths.ffmpeg;
  }

  /** At most BACKGROUND_SLOTS background jobs at once; the rest wait in order. */
  private async background<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy >= BACKGROUND_SLOTS) await new Promise<void>((go) => this.waiting.push(go));
    this.busy++;
    try {
      return await work();
    } finally {
      this.busy--;
      this.waiting.shift()?.();
    }
  }

  /** The cache folder of this version of the file. */
  async cacheDir(path: string): Promise<string> {
    const s = await stat(path);
    const id = createHash("sha1")
      .update(`${path.toLowerCase()}|${s.size}|${s.mtimeMs}`)
      .digest("hex");
    const dir = join(this.cacheRoot, id.slice(0, 24));
    await mkdir(dir, { recursive: true });
    const now = new Date();
    await utimes(dir, now, now);
    return dir;
  }

  private async version(path: string): Promise<string> {
    const s = await stat(path);
    return `${path.toLowerCase()}|${s.size}|${s.mtimeMs}`;
  }

  probe(path: string): Promise<MediaFacts> {
    return this.memo(this.facts, path, async () => {
      const s = await stat(path);
      if (!s.isFile()) throw new Error("Escolha um arquivo de vídeo ou áudio.");
      const text = await this.media.run(
        this.media.paths.ffprobe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          path,
        ],
        { timeoutMs: 120_000 },
      );
      return factsFromProbe(JSON.parse(text), path, basename(path), s.size);
    });
  }

  /** Keyframe times of the first picture stream; none for sound-only files. */
  keyframes(path: string): Promise<number[]> {
    return this.memo(this.keys, path, async () => {
      const facts = await this.probe(path);
      if (!facts.hasVideo) return [];
      const lines: string[] = [];
      let tail = "";
      await this.background(() =>
        this.media.run(
          this.media.paths.ffprobe,
          [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pts_time,flags",
            "-of",
            "csv=p=0",
            path,
          ],
          {
            timeoutMs: 600_000,
            onStdout: (chunk) => {
              tail += chunk.toString();
              const parts = tail.split("\n");
              tail = parts.pop() ?? "";
              for (const line of parts) if (line.includes("K")) lines.push(line);
            },
          },
        ),
      );
      if (tail.includes("K")) lines.push(tail);
      return keyframesFromPackets(lines, facts.startTime);
    });
  }

  /** Tiles taken at even steps, from keyframes only (fast even for hours of video). */
  frameSheet(path: string): Promise<SheetFile> {
    // One run per file version: the bar and the ruler ask at the same time.
    return this.memo(this.sheets, path, () => this.makeSheet(path));
  }

  private async makeSheet(path: string): Promise<SheetFile> {
    const facts = await this.probe(path);
    if (!facts.hasVideo) throw new Error("Arquivo sem imagem.");
    const count = SHEET_COLUMNS * SHEET_ROWS;
    const step = facts.duration / count;
    const tileHeight = Math.max(
      2,
      Math.round((TILE_WIDTH * facts.height) / Math.max(1, facts.width) / 2) * 2,
    );
    const sheet = {
      columns: SHEET_COLUMNS,
      rows: SHEET_ROWS,
      count,
      step,
      tileWidth: TILE_WIDTH,
      tileHeight,
    };
    const file = join(await this.cacheDir(path), "sheet.jpg");
    if (existsSync(file)) return { ...sheet, file };
    const partial = `${file}.part.jpg`;
    await this.background(() =>
      this.media.run(
        this.ffmpeg,
        [
          "-hide_banner",
          "-nostdin",
          "-y",
          "-v",
          "error",
          "-skip_frame",
          "nokey",
          ...LOCAL_INPUT,
          "-i",
          path,
          "-map",
          "0:V:0",
          "-vf",
          `tpad=stop_mode=clone:stop_duration=${(step * 2).toFixed(3)},fps=${count}/${Math.max(0.1, facts.duration).toFixed(3)},scale=${TILE_WIDTH}:${tileHeight}:force_original_aspect_ratio=decrease,pad=${TILE_WIDTH}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${SHEET_COLUMNS}x${SHEET_ROWS}`,
          "-frames:v",
          "1",
          "-q:v",
          "5",
          "-an",
          partial,
        ],
        { timeoutMs: 600_000 },
      ),
    );
    await rename(partial, file);
    return { ...sheet, file };
  }

  /** Peaks of the first sound, 0..1, at most WAVE_BARS bars, computed as the samples stream. */
  waveform(path: string): Promise<number[]> {
    return this.memo(this.waves, path, () => this.makeWave(path));
  }

  private async makeWave(path: string): Promise<number[]> {
    const facts = await this.probe(path);
    if (!facts.audio.length) return [];
    const file = join(await this.cacheDir(path), "waveform.json");
    if (existsSync(file)) {
      const saved: unknown = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(saved) && saved.every((v) => typeof v === "number")) return saved;
    }
    const rate = 2000;
    const bars = Math.min(WAVE_BARS, Math.max(1, Math.round(facts.duration * 4)));
    const perBar = Math.max(1, Math.ceil((facts.duration * rate) / bars));
    const out = new Array<number>(bars).fill(0);
    let index = 0;
    let carry: Buffer | null = null;
    await this.background(() =>
      this.media.run(
        this.ffmpeg,
        [
          "-hide_banner",
          "-nostdin",
          "-v",
          "error",
          ...LOCAL_INPUT,
          "-i",
          path,
          "-map",
          "0:a:0",
          "-ac",
          "1",
          "-ar",
          String(rate),
          "-f",
          "s16le",
          "-",
        ],
        {
          timeoutMs: 600_000,
          onStdout: (chunk) => {
            const data: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
            const whole = data.length - (data.length % 2);
            carry = whole < data.length ? data.subarray(whole) : null;
            for (let i = 0; i < whole; i += 2, index++) {
              const bar = Math.min(bars - 1, Math.floor(index / perBar));
              const v = Math.abs(data.readInt16LE(i)) / 32768;
              if (v > (out[bar] ?? 0)) out[bar] = Math.min(1, v);
            }
          },
        },
      ),
    );
    await atomicJson(file, out);
    return out;
  }

  /**
   * A copy the <video> can open. "remux" copies the picture and converts only a sound Chromium
   * cannot play (seconds); "preview" makes a 720p H.264 copy (the model is EdiAula's proxy()).
   */
  prepare(
    path: string,
    plan: Exclude<PlaybackMode, "native">,
    audioIndex: number,
    onProgress: (ratio: number) => void,
    signal: AbortSignal,
    audioPlayable: boolean,
  ): Promise<string> {
    const key = `${path}|${plan}|${audioIndex}`;
    const running = this.preparing.get(key);
    if (running) return running;
    const job = (async () => {
      const facts = await this.probe(path);
      // MP4 carries these pictures as they are; anything else (VP8, WMV, MPEG-4 Part 2...) is
      // converted even when only a copy was asked.
      const how =
        plan === "remux" && facts.hasVideo && !MP4_PICTURES.has(facts.videoCodec ?? "")
          ? "preview"
          : plan;
      const dir = await this.cacheDir(path);
      const file = join(dir, `${how}-a${audioIndex}.mp4`);
      if (existsSync(file)) return file;
      const partial = join(dir, `${how}-a${audioIndex}.part.mp4`);
      const audio = facts.audio.length
        ? ["-map", `0:a:${Math.min(audioIndex, facts.audio.length - 1)}`]
        : [];
      const sound =
        how === "remux" && audioPlayable && facts.audio.at(audioIndex)?.codec === "aac"
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "160k", "-ac", "2"];
      const picture =
        how === "remux"
          ? ["-c:v", "copy"]
          : [
              "-vf",
              "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)':flags=bicubic,format=yuv420p",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-crf",
              "24",
              "-g",
              "48",
            ];
      await this.media.run(
        this.ffmpeg,
        [
          "-hide_banner",
          "-nostdin",
          "-y",
          "-v",
          "error",
          ...LOCAL_INPUT,
          "-i",
          path,
          ...(facts.hasVideo ? ["-map", "0:V:0", ...picture] : ["-vn"]),
          ...audio,
          ...(facts.audio.length ? sound : []),
          "-sn",
          "-dn",
          "-movflags",
          "+faststart",
          partial,
        ],
        { signal, duration: facts.duration, onProgress, jobId: `prepare:${key}` },
      );
      await rename(partial, file);
      return file;
    })();
    this.preparing.set(key, job);
    const forget = () => {
      if (this.preparing.get(key) === job) this.preparing.delete(key);
    };
    job.then(forget, forget);
    return job;
  }

  cancelPrepare(path: string): void {
    for (const key of this.preparing.keys())
      if (key.startsWith(`${path}|`)) this.media.cancel(`prepare:${key}`);
  }

  /** A text subtitle track of the file as WebVTT. */
  async subtitleTrack(path: string, index: number): Promise<string> {
    const facts = await this.probe(path);
    const track = facts.subtitles.at(index);
    if (!track?.text) throw new Error("Esta legenda é uma imagem e não pode ser mostrada.");
    return this.media.run(
      this.ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-v",
        "error",
        ...LOCAL_INPUT,
        "-i",
        path,
        "-map",
        `0:s:${index}`,
        "-f",
        "webvtt",
        "-",
      ],
      { timeoutMs: 300_000 },
    );
  }

  /** A small JPEG of the file for the "Continuar assistindo" cards, cached. */
  thumbnail(path: string): Promise<string> {
    return this.memo(this.thumbs, path, () => this.background(() => this.makeThumbnail(path)));
  }

  private async makeThumbnail(path: string): Promise<string> {
    const facts = await this.probe(path);
    if (!facts.hasVideo) throw new Error("Arquivo sem imagem.");
    const file = join(await this.cacheDir(path), "thumb.jpg");
    if (!existsSync(file)) {
      const partial = join(await this.cacheDir(path), "thumb.part.jpg");
      await this.media.frame(path, partial, Math.min(30, facts.duration * 0.1), 320);
      await rename(partial, file);
    }
    return file;
  }

  /** A full-resolution PNG of the frame at `at`. */
  async frame(path: string, at: number, output: string): Promise<void> {
    await this.media.frame(path, output, at);
  }

  /** Forgets everything derived from the person's files ("Limpar recentes"). */
  async clearCache(): Promise<void> {
    this.sheets.clear();
    this.waves.clear();
    this.thumbs.clear();
    await rm(this.cacheRoot, { recursive: true, force: true });
  }

  /** Drops the oldest cache folders until the cache fits CACHE_LIMIT. */
  async trimCache(limit = CACHE_LIMIT): Promise<void> {
    if (!existsSync(this.cacheRoot)) return;
    const entries = await Promise.all(
      (await readdir(this.cacheRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const dir = join(this.cacheRoot, e.name);
          let size = 0;
          for (const f of await readdir(dir)) size += (await stat(join(dir, f))).size;
          return { dir, size, used: (await stat(dir)).mtimeMs };
        }),
    );
    let total = entries.reduce((s, e) => s + e.size, 0);
    for (const e of entries.sort((a, b) => a.used - b.used)) {
      if (total <= limit) break;
      await rm(e.dir, { recursive: true, force: true });
      total -= e.size;
    }
  }

  private async memo<T>(
    map: Map<string, Promise<T>>,
    path: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const id = await this.version(path);
    const known = map.get(id);
    if (known) return known;
    const job = work();
    map.set(id, job);
    job.catch(() => {
      if (map.get(id) === job) map.delete(id);
    });
    return job;
  }
}

const atomicJson = (file: string, value: unknown): Promise<void> =>
  atomicWrite(file, JSON.stringify(value));
