import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { MediaProcessError } from "@informach/edi-desktop/native-media";
import {
  bitrateForTarget,
  canCopy,
  copyExtension,
  type EditJob,
  GIF_FPS,
  outputSize,
  type PresetId,
  presetOf,
  type Transform,
} from "../shared/edit.ts";
import {
  audioCutGraph,
  concatCopyArgs,
  concatList,
  displayRotation,
  exportGraph,
  LOCAL_INPUT,
  type Loudness,
  loudnormFilter,
  parseLoudness,
  pointsList,
  type VideoEncoder,
  videoEncodeArgs,
} from "../shared/media/args.ts";
import { joinBlocker } from "../shared/media/compat.ts";
import {
  keyframeAtOrBefore,
  normalizeRanges,
  type Range,
  totalDuration,
} from "../shared/ranges.ts";
import { parseSubtitles, SUBTITLE_LIMIT, shiftCues, toSrt } from "../shared/subtitles.ts";
import type { MediaFacts } from "../shared/types.ts";
import type { MediaEngine } from "./engine.ts";

export interface RunContext {
  jobId: string;
  signal: AbortSignal;
  onProgress: (ratio: number) => void;
  /** The H.264 encoder to try first; the runner falls back to x264 when it fails. */
  encoder: () => Promise<VideoEncoder>;
}

/** The files a job will create, for the write checks before it is queued. */
export function jobOutputs(job: EditJob): string[] {
  if (job.kind === "split")
    return job.pieces.map((_, i) =>
      join(job.folder, `${job.baseName} (parte ${i + 1}).${copyExtension(job.source)}`),
    );
  return [job.output];
}

/** Runs one edit. The sources are only read; every result is staged, checked and then published. */
export async function runJob(
  engine: MediaEngine,
  job: EditJob,
  ctx: RunContext,
): Promise<string[]> {
  const outputs = jobOutputs(job);
  await assertOutputsSafe(job, outputs);
  await withStagedFiles(outputs, async (staged) => {
    if (job.kind === "export") await runExport(engine, job, staged.get(job.output) as string, ctx);
    else if (job.kind === "split") await runSplit(engine, job, outputs, staged, ctx);
    else if (job.kind === "join") await runJoin(engine, job, staged.get(job.output) as string, ctx);
    else await runAudio(engine, job, staged.get(job.output) as string, ctx);
    ctx.signal.throwIfAborted();
  });
  return outputs;
}

const extensionOf = (path: string) => extname(path).slice(1).toLowerCase();

/** Every file a job reads: sources, a new sound, a subtitle to burn. */
function jobInputs(job: EditJob): string[] {
  if (job.kind === "join") return job.sources;
  if (job.kind !== "export") return [job.source];
  return [job.source, job.transform.replaceAudio, job.transform.burnSubtitles].filter(
    (p): p is string => !!p,
  );
}

/**
 * A result never replaces a file the job reads, compared by identity on disk (volume + file id),
 * not by spelling: a mapped drive, a short 8.3 name, a junction or a hard link is the same file.
 * Split parts never replace existing files at all.
 */
async function assertOutputsSafe(job: EditJob, outputs: readonly string[]): Promise<void> {
  const inputs = await Promise.all(jobInputs(job).map((p) => stat(p, { bigint: true })));
  for (const output of outputs) {
    let found: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      found = await stat(output, { bigint: true });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (!found) continue;
    if (inputs.some((i) => i.dev === found.dev && i.ino === found.ino))
      throw new Error(
        "O resultado não pode substituir um arquivo usado na edição. Escolha outro nome.",
      );
    if (job.kind === "split")
      throw new Error(`Já existe ${basename(output)} nesta pasta. Escolha outra pasta.`);
  }
}

async function filterOption(engine: MediaEngine): Promise<string> {
  const text = await engine.media.run(engine.ffmpeg, ["-hide_banner", "-version"], {
    timeoutMs: 30_000,
  });
  const major = Number(/ffmpeg version n?(\d+)\./.exec(text)?.[1]);
  if (!Number.isInteger(major) || major < 6) throw new Error("Versão do FFmpeg não suportada.");
  return major >= 7 ? "-/filter_complex" : "-filter_complex_script";
}

/** Renders with the given encoder; an encoder that cannot start falls back to x264 once. */
async function encodeWithFallback(
  engine: MediaEngine,
  ctx: RunContext,
  build: (encoder: VideoEncoder) => string[],
  duration: number,
  part: string,
): Promise<void> {
  const first = await ctx.encoder();
  const run = (encoder: VideoEncoder) =>
    engine.media.run(engine.ffmpeg, build(encoder), {
      jobId: `${ctx.jobId}:${part}`,
      signal: ctx.signal,
      duration,
      onProgress: ctx.onProgress,
    });
  try {
    await run(first);
  } catch (error) {
    if (first === "x264" || ctx.signal.aborted || !(error instanceof MediaProcessError))
      throw error;
    await run("x264");
  }
}

/** The output exists, opens and lasts about what was asked. */
async function verify(
  engine: MediaEngine,
  file: string,
  expected: number,
  slack: number,
): Promise<void> {
  const facts = await engine.probe(file);
  if (Math.abs(facts.duration - expected) > Math.max(slack, expected * 0.03))
    throw new Error(
      `O arquivo gerado ficou com ${facts.duration.toFixed(1)} s em vez de ${expected.toFixed(1)} s.`,
    );
}

/**
 * A cut without re-encoding the picture. A concat list cuts the source by points (the inpoint on
 * the keyframe at or before each mark, the outpoint half a frame before its end, so no extra
 * frame slips in); every stretch then lasts the same for picture and sound, so cuts do not drift
 * apart. The sound is cut with sample accuracy and encoded to AAC to match those exact lengths.
 * A sound-only cut copies its packets: one stream cannot drift against another.
 */
async function copyStretches(
  engine: MediaEngine,
  facts: MediaFacts,
  ranges: readonly Range[],
  output: string,
  ctx: RunContext,
  opts: {
    rotation: number | null;
    removeAudio: boolean;
    replaceAudio: string | null;
    audioOnly: boolean;
    /** One sound stream to keep, or null for all of them. */
    audioIndex: number | null;
  },
): Promise<number> {
  const work = dirname(output);
  const tag = randomUUID().slice(0, 8);
  const list = join(work, `.cut-${tag}.txt`);
  const faststart = /\.(mp4|mov|m4a)$/i.test(output) ? ["-movflags", "+faststart"] : [];
  const head = ["-hide_banner", "-nostdin", "-y", "-v", "error"];
  const run = (args: string[], duration: number) =>
    engine.media.run(engine.ffmpeg, args, {
      jobId: `${ctx.jobId}:copy`,
      signal: ctx.signal,
      duration,
      onProgress: ctx.onProgress,
    });
  if (opts.audioOnly) {
    const points = ranges.map((r) => ({
      inpoint: facts.startTime + r.start,
      outpoint: facts.startTime + r.end,
    }));
    await writeFile(list, pointsList(facts.path, points));
    const length = totalDuration(ranges);
    await run(
      [
        ...head,
        ...LOCAL_INPUT,
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-map",
        `0:a:${opts.audioIndex ?? 0}`,
        "-vn",
        "-c",
        "copy",
        ...faststart,
        output,
      ],
      length,
    );
    return length;
  }
  const keys = await engine.keyframes(facts.path);
  const frame = 1 / (facts.fps > 0 ? facts.fps : 30);
  const cut = ranges.map((r) => ({
    start: keys.length ? keyframeAtOrBefore(r.start, keys) : r.start,
    end: r.end,
  }));
  await writeFile(
    list,
    pointsList(
      facts.path,
      cut.map((r) => ({
        inpoint: facts.startTime + r.start,
        outpoint: facts.startTime + Math.max(r.start + frame, r.end - frame / 2),
      })),
    ),
  );
  const length = totalDuration(cut);
  const tracks =
    opts.removeAudio || opts.replaceAudio
      ? []
      : opts.audioIndex === null
        ? facts.audio.map((a) => a.index)
        : [opts.audioIndex];
  const inputs = [
    ...(opts.rotation === null
      ? []
      : ["-display_rotation:v:0", String(displayRotation(opts.rotation))]),
    ...LOCAL_INPUT,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
  ];
  let graph: string[] = [];
  if (tracks.length) {
    const script = join(work, `.cut-${tag}-sound.txt`);
    await writeFile(script, audioCutGraph(1, tracks, cut));
    inputs.push(...LOCAL_INPUT, "-i", facts.path);
    graph = [await filterOption(engine), script];
  } else if (opts.replaceAudio) inputs.push(...LOCAL_INPUT, "-i", opts.replaceAudio);
  // A new sound ends the file with the shorter of picture and sound, said explicitly.
  const expected = opts.replaceAudio
    ? Math.min(length, (await engine.probe(opts.replaceAudio)).duration)
    : length;
  const keepSubtitles = /matroska/.test(facts.container) && extensionOf(output) === "mkv";
  await run(
    [
      ...head,
      ...inputs,
      ...graph,
      "-map",
      "0:V",
      ...(tracks.length
        ? tracks.flatMap((_, k) => ["-map", `[a${k}]`])
        : opts.replaceAudio
          ? ["-map", "1:a:0"]
          : ["-an"]),
      ...(keepSubtitles ? ["-map", "0:s?", "-c:s", "copy"] : ["-sn"]),
      "-c:v",
      "copy",
      ...(tracks.length || opts.replaceAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
      ...(opts.replaceAudio ? ["-t", expected.toFixed(3)] : []),
      "-dn",
      "-map_chapters",
      "-1",
      "-avoid_negative_ts",
      "make_zero",
      ...faststart,
      output,
    ],
    expected,
  );
  return expected;
}

async function runExport(
  engine: MediaEngine,
  job: Extract<EditJob, { kind: "export" }>,
  out: string,
  ctx: RunContext,
): Promise<void> {
  const facts = await engine.probe(job.source);
  const ranges = normalizeRanges(job.ranges, facts.duration);
  if (!ranges.length) throw new Error("Nada sobrou para salvar: todos os trechos foram removidos.");
  const t = job.transform;
  if (t.replaceAudio && !(await engine.probe(t.replaceAudio)).audio.length)
    throw new Error("O arquivo escolhido para o novo som não tem som.");
  if (canCopy(t, job.preset, job.precise, facts)) {
    const length = await copyStretches(engine, facts, ranges, out, ctx, {
      rotation: t.rotate && facts.hasVideo ? (facts.rotation + t.rotate) % 360 : null,
      removeAudio: t.removeAudio,
      replaceAudio: t.replaceAudio,
      audioOnly: !facts.hasVideo,
      audioIndex: facts.hasVideo ? null : t.audioIndex,
    });
    ctx.onProgress(1);
    await verify(engine, out, length, 1.5);
    return;
  }
  await recodeExport(engine, facts, ranges, job.preset, t, out, ctx);
}

/** Pixels of a normalized crop on the picture as shown, rounded to even numbers. */
function cropPixels(t: Transform, facts: MediaFacts) {
  if (!t.crop) return null;
  const even = (v: number) => Math.max(0, Math.round(v / 2) * 2);
  const w = Math.max(16, even(t.crop.w * facts.width)),
    h = Math.max(16, even(t.crop.h * facts.height));
  return {
    x: Math.min(even(t.crop.x * facts.width), facts.width - w),
    y: Math.min(even(t.crop.y * facts.height), facts.height - h),
    w,
    h,
  };
}

async function recodeExport(
  engine: MediaEngine,
  facts: MediaFacts,
  ranges: Range[],
  presetId: PresetId,
  t: Transform,
  out: string,
  ctx: RunContext,
): Promise<void> {
  const preset = presetOf(presetId);
  const gif = presetId === "gif";
  const soundOnly = presetId === "mp3" || !facts.hasVideo;
  const seeked = ranges.length === 1;
  const first = ranges.at(0) as Range;
  const length = totalDuration(ranges) / t.speed;
  const replacement = t.replaceAudio && !soundOnly ? await engine.probe(t.replaceAudio) : null;
  // With a new sound the file ends with the shorter of picture and sound, said with -t (the
  // -shortest flag overshoots by up to its 10 s buffer).
  const expected = replacement ? Math.min(length, replacement.duration) : length;
  const work = dirname(out);
  let burn: string | null = null;
  if (t.burnSubtitles && !soundOnly) {
    const raw = await readFile(t.burnSubtitles);
    if (raw.length > SUBTITLE_LIMIT) throw new Error("Arquivo de legenda grande demais.");
    const cues = shiftCues(
      parseSubtitles(raw.toString("utf8")),
      t.subtitleDelay - (seeked ? first.start : 0),
    );
    if (!cues.length) throw new Error("A legenda escolhida não tem falas legíveis.");
    burn = join(work, "legenda.srt");
    await writeFile(burn, toSrt(cues), "utf8");
  }
  const crop = soundOnly ? null : cropPixels(t, facts);
  let w = crop?.w ?? facts.width,
    h = crop?.h ?? facts.height;
  if (t.rotate === 90 || t.rotate === 270) [w, h] = [h, w];
  const size = soundOnly ? null : outputSize(w, h, preset.maxShort);
  const hasSound = !gif && !t.removeAudio && (t.replaceAudio ? true : facts.audio.length > 0);
  const audioLabel = !hasSound
    ? null
    : t.replaceAudio
      ? "1:a:0"
      : `0:a:${Math.min(t.audioIndex, facts.audio.length - 1)}`;
  if (soundOnly && !audioLabel) throw new Error("Este arquivo não tem som para salvar em MP3.");
  const inputs = [
    ...LOCAL_INPUT,
    ...(seeked ? ["-ss", first.start.toFixed(3), "-t", (first.end - first.start).toFixed(3)] : []),
    "-i",
    facts.path,
    ...(t.replaceAudio ? [...LOCAL_INPUT, "-i", t.replaceAudio] : []),
  ];
  const option = await filterOption(engine);
  const base = {
    ranges,
    seeked,
    video: !soundOnly,
    audio: audioLabel,
    audioUncut: !!t.replaceAudio,
    burn,
    crop,
    rotate: t.rotate,
    flipH: t.flipH,
    flipV: t.flipV,
    speed: t.speed,
    gain: t.gain,
    size,
    gif: gif ? { fps: GIF_FPS } : null,
  } as const;
  let measured: Loudness | null = null;
  if (t.normalize && audioLabel) {
    // A new sound is measured whole: it is not cut with the picture.
    const measure = t.replaceAudio
      ? `[${audioLabel}]${loudnormFilter(null)}[a]`
      : exportGraph({ ...base, video: false, loudnorm: loudnormFilter(null) }).graph;
    const script = join(work, "measure.txt");
    await writeFile(script, measure);
    const said = await engine.media.run(
      engine.ffmpeg,
      ["-hide_banner", "-nostdin", ...inputs, option, script, "-map", "[a]", "-f", "null", "-"],
      { jobId: `${ctx.jobId}:measure`, signal: ctx.signal, capture: "stderr" },
    );
    measured = parseLoudness(said);
  }
  const graph = exportGraph({ ...base, loudnorm: measured ? loudnormFilter(measured) : null });
  const script = join(work, "graph.txt");
  await writeFile(script, graph.graph);
  const audioKbps = preset.audioKbps || 192;
  const quality = preset.targetMB
    ? { kbps: bitrateForTarget(length, preset.targetMB, audioKbps) }
    : { crf: preset.crf ?? 20 };
  const build = (encoder: VideoEncoder) => [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-v",
    "error",
    ...inputs,
    option,
    script,
    ...(graph.video ? ["-map", "[v]"] : []),
    ...(graph.audio ? ["-map", "[a]"] : []),
    ...(gif
      ? ["-loop", "0", "-f", "gif"]
      : soundOnly
        ? ["-vn", "-c:a", "libmp3lame", "-b:a", `${audioKbps}k`]
        : [
            ...videoEncodeArgs(encoder, quality),
            ...(graph.audio ? ["-c:a", "aac", "-b:a", `${audioKbps}k`] : ["-an"]),
            ...(t.replaceAudio ? ["-t", expected.toFixed(3)] : []),
            "-movflags",
            "+faststart",
          ]),
    "-map_metadata",
    "-1",
    "-sn",
    "-dn",
    out,
  ];
  if (soundOnly || gif)
    await engine.media.run(engine.ffmpeg, build("x264"), {
      jobId: `${ctx.jobId}:render`,
      signal: ctx.signal,
      duration: expected,
      onProgress: ctx.onProgress,
    });
  else await encodeWithFallback(engine, ctx, build, expected, "render");
  ctx.onProgress(1);
  await verify(engine, out, expected, 1);
}

async function runSplit(
  engine: MediaEngine,
  job: Extract<EditJob, { kind: "split" }>,
  outputs: string[],
  staged: ReadonlyMap<string, string>,
  ctx: RunContext,
): Promise<void> {
  const facts = await engine.probe(job.source);
  const pieces = [...job.pieces]
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(facts.duration, r.end) }))
    .sort((a, b) => a.start - b.start);
  // Pieces touch end to start; they must not overlap or be empty.
  if (
    pieces.some(
      (r, i) => r.end - r.start < 0.05 || (r.start < (pieces.at(i - 1)?.end ?? 0) - 1e-3 && i > 0),
    )
  )
    throw new Error("As partes se sobrepõem ou estão vazias.");
  for (const [i, piece] of pieces.entries()) {
    const out = staged.get(outputs.at(i) ?? "") as string;
    const part: RunContext = {
      ...ctx,
      jobId: `${ctx.jobId}:p${i}`,
      onProgress: (r) => ctx.onProgress((i + r) / pieces.length),
    };
    const length = await copyStretches(engine, facts, [piece], out, part, {
      rotation: null,
      removeAudio: false,
      replaceAudio: null,
      audioOnly: !facts.hasVideo,
      audioIndex: facts.hasVideo ? null : 0,
    });
    await verify(engine, out, length, 1.5);
  }
}

async function runJoin(
  engine: MediaEngine,
  job: Extract<EditJob, { kind: "join" }>,
  out: string,
  ctx: RunContext,
): Promise<void> {
  const all = await Promise.all(job.sources.map((s) => engine.probe(s)));
  const total = all.reduce((s, f) => s + f.duration, 0);
  if (job.preset === "original" && !joinBlocker(all)) {
    const list = join(dirname(out), "join.txt");
    await writeFile(list, concatList(job.sources));
    await engine.media.run(engine.ffmpeg, concatCopyArgs(list, out, /\.(mp4|mov)$/i.test(out)), {
      jobId: `${ctx.jobId}:join`,
      signal: ctx.signal,
      duration: total,
      onProgress: ctx.onProgress,
    });
    await verify(engine, out, total, 1.5);
    return;
  }
  const video = all.every((f) => f.hasVideo);
  if (!video && all.some((f) => f.hasVideo))
    throw new Error("Para juntar, use só vídeos ou só áudios.");
  const sound = all.some((f) => f.audio.length);
  const first = all.at(0) as MediaFacts;
  const preset = presetOf(job.preset);
  const [w, h] = outputSize(first.width || 1280, first.height || 720, preset.maxShort);
  const fps = first.fps > 0 && first.fps <= 120 ? first.fps : 30;
  const parts: string[] = [];
  const streams: string[] = [];
  all.forEach((f, i) => {
    if (video)
      parts.push(
        `[${i}:v:0]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`,
      );
    if (sound)
      parts.push(
        f.audio.length
          ? `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
          : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${f.duration.toFixed(3)}[a${i}]`,
      );
    streams.push(`${video ? `[v${i}]` : ""}${sound ? `[a${i}]` : ""}`);
  });
  parts.push(
    `${streams.join("")}concat=n=${all.length}:v=${video ? 1 : 0}:a=${sound ? 1 : 0}${video ? "[v]" : ""}${sound ? "[a]" : ""}`,
  );
  const script = join(dirname(out), "join-graph.txt");
  await writeFile(script, parts.join(";\n"));
  const option = await filterOption(engine);
  const quality = preset.targetMB
    ? { kbps: bitrateForTarget(total, preset.targetMB, preset.audioKbps) }
    : { crf: preset.crf ?? 18 };
  const build = (encoder: VideoEncoder) => [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-v",
    "error",
    ...job.sources.flatMap((s) => ["-i", s]),
    option,
    script,
    ...(video ? ["-map", "[v]", ...videoEncodeArgs(encoder, quality)] : ["-vn"]),
    ...(sound
      ? [
          "-map",
          "[a]",
          ...(video ? ["-c:a", "aac"] : ["-c:a", "libmp3lame"]),
          "-b:a",
          `${preset.audioKbps}k`,
        ]
      : []),
    ...(video ? ["-movflags", "+faststart"] : []),
    out,
  ];
  if (video) await encodeWithFallback(engine, ctx, build, total, "join");
  else
    await engine.media.run(engine.ffmpeg, build("x264"), {
      jobId: `${ctx.jobId}:join`,
      signal: ctx.signal,
      duration: total,
      onProgress: ctx.onProgress,
    });
  await verify(engine, out, total, 1.5);
}

async function runAudio(
  engine: MediaEngine,
  job: Extract<EditJob, { kind: "audio" }>,
  out: string,
  ctx: RunContext,
): Promise<void> {
  const facts = await engine.probe(job.source);
  const track = facts.audio.at(job.audioIndex);
  if (!track) throw new Error("Este arquivo não tem som.");
  const ranges = normalizeRanges(job.ranges, facts.duration);
  if (!ranges.length) throw new Error("Nada sobrou para salvar.");
  if (job.format === "copy") {
    const length = await copyStretches(engine, facts, ranges, out, ctx, {
      rotation: null,
      removeAudio: false,
      replaceAudio: null,
      audioOnly: true,
      audioIndex: job.audioIndex,
    });
    await verify(engine, out, length, 1.5);
    return;
  }
  await recodeExport(
    engine,
    facts,
    ranges,
    "mp3",
    {
      rotate: 0,
      flipH: false,
      flipV: false,
      crop: null,
      speed: 1,
      gain: 1,
      normalize: false,
      removeAudio: false,
      audioIndex: job.audioIndex,
      replaceAudio: null,
      burnSubtitles: null,
      subtitleDelay: 0,
    },
    out,
    ctx,
  );
}

/** The label of a job in the queue ("aula.mp4 → aula (editado).mp4"). */
export function jobLabel(job: EditJob): string {
  if (job.kind === "join") return `Juntar ${job.sources.length} arquivos → ${basename(job.output)}`;
  if (job.kind === "split") return `Dividir ${basename(job.source)} em ${job.pieces.length} partes`;
  return `${basename(job.source)} → ${basename(job.output)}`;
}
