import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { open, readFile, rename, rm, stat, statfs } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type CaptureSegment,
  insideSegments,
  mergeHookEvents,
} from "../../shared/cursorCapture.ts";
import { buildCursorData, cursorDataForPart } from "../../shared/cursorData.ts";
import { type HookEvent, parseHookLine } from "../../shared/helperProtocol.ts";
import type { RecordingPiece, RecordingResult } from "../../shared/recording.ts";
import {
  JOURNAL_FILE,
  type JournalPart,
  type JournalReplay,
  MEDIA_SOURCES,
  type MediaSource,
  momentInTake,
  RESULT_FILE,
  rangesInTake,
  referenceSource,
  replayJournal,
  segmentOffsets,
  takeSegments,
} from "../../shared/recordingJournal.ts";
import { FFMPEG, probe, run, writeFilterScript } from "../ffmpeg.ts";
import { filterScriptOption } from "../ffmpeg-arguments.ts";
import { qpc } from "../nativeHelper.ts";

/**
 * Turns a take's folder into what the editor imports, from its journal (sessao.jsonl), so a take
 * that was stopped and one found after a crash are finalized the same way:
 *
 * 1. Every part is measured; parts from a process that did not end cleanly are checked first and
 *    remuxed when their last fragment is broken.
 * 2. The screen parts are joined without re-encoding into a regular MP4 when the disk has room
 *    for a copy (1.1 times their size); otherwise they stay as recorded.
 * 3. The microphone and the computer's sound are cut to what each screen part covers, with
 *    silence where they have nothing, so their second 0 is the screen's.
 * 4. The camera is placed as recorded, without re-encoding.
 * 5. Every file written is checked against the length it should have and flushed to the disk;
 *    the cursor data (version 2) and gravacao.json are written, then `finalized` in the journal,
 *    and only then the parts that were copied are removed. From that line on nothing throws: a
 *    part that cannot be removed only costs disk space, and the take is not lost over it.
 */

export interface FinalizeInput {
  dir: string;
  /** Helper events that reached memory (cursor.jsonl has the rest). */
  events?: readonly HookEvent[];
  cursorIssues?: readonly string[];
  encoderIssues?: readonly string[];
  warnings?: readonly string[];
  /** Part files whose process did not end cleanly, or "all" after a crash. */
  suspect?: ReadonlySet<string> | "all";
  /** Removes a part that is no longer needed (rm with retries; tests make it fail). */
  remove?: (path: string) => Promise<void>;
}

/** Free space needed to join the parts, against their size. */
const JOIN_ROOM = 1.1;
/**
 * The computer's sound is stretched back to the wall clock when it drifted more than both of
 * these: a relative drift (its clock against the wall) and an amount worth correcting.
 */
const DRIFT_RELATIVE = 0.001;
const DRIFT_ABSOLUTE = 0.05;
/** Seconds a file written here may differ from what it should hold before its parts are kept. */
const LENGTH_TOLERANCE = 0.25;

const removePart = (path: string): Promise<void> =>
  rm(path, { force: true, maxRetries: 5, retryDelay: 200 });

interface Measured extends JournalPart {
  path: string;
  duration: number;
}

export async function finalizeTake(input: FinalizeInput): Promise<RecordingResult> {
  const { dir } = input;
  const warnings = [...(input.warnings ?? [])];
  const replay = replayJournal(await readFile(join(dir, JOURNAL_FILE), "utf8"));
  if (!replay.begin) throw new Error("O diário desta gravação está incompleto.");
  const parts = await measureParts(dir, replay, input.suspect, warnings);
  const durations = new Map<string, number>();
  for (const list of Object.values(parts)) for (const p of list) durations.set(p.file, p.duration);
  const reference = referenceSource({ ...replay, parts });
  if (!reference) throw new Error("Nada foi gravado.");
  const segments = takeSegments(parts[reference], durations);
  if (!segments.length) throw new Error("Nada foi gravado.");
  const offsets = segmentOffsets(segments);
  const duration = segments.reduce((sum, g) => sum + g.duration, 0);
  /** Files written here, what they should hold, and the parts they replace once they do. */
  const outputs: { path: string; expected: number; parts: string[]; label: string }[] = [];

  // Screen.
  let screen: string | undefined;
  let screenParts: Measured[] | undefined;
  if (parts.screen.length) {
    const joined = await joinScreen(dir, parts.screen);
    if (joined.file) {
      screen = joined.file;
      if (joined.copied)
        outputs.push({
          path: joined.file,
          expected: parts.screen.reduce((sum, p) => sum + p.duration, 0),
          parts: parts.screen.map((p) => p.path),
          label: "O vídeo da tela",
        });
    } else {
      screenParts = parts.screen;
      warnings.push(
        "Faltou espaço para juntar as partes da tela: elas ficaram separadas, como foram gravadas.",
      );
    }
  }

  // Microphone and the computer's sound, on the take's clock, when the disk has room to write
  // them again; otherwise they stay in parts, placed like the camera.
  // A "Só voz" take keeps its voice as recorded: 16-bit PCM, mono, 48 kHz (voz.wav).
  const voice = replay.begin.mode === "voice";
  let microphone: string | undefined;
  let microphoneParts: RecordingPiece[] | undefined;
  if (parts.mic.length) {
    if (await roomFor(dir, parts.mic)) {
      microphone = join(dir, voice ? "voz.wav" : "microfone.m4a");
      await alignAudio(parts.mic, segments, microphone, undefined, voice ? "pcm" : "aac");
      outputs.push({
        path: microphone,
        expected: duration,
        parts: parts.mic.map((p) => p.path),
        label: "O som do microfone",
      });
    } else {
      microphoneParts = placeParts(parts.mic, segments, offsets);
      warnings.push(
        "Faltou espaço para alinhar o microfone: ele ficou nas partes em que foi gravado.",
      );
    }
  }
  let systemAudio: string | undefined;
  let systemParts: RecordingPiece[] | undefined;
  const system = parts.system[0];
  if (system) {
    const expected = system.end !== undefined ? (system.end - system.qpc) / 1000 : null;
    let tempo: number | undefined;
    let length = system.duration;
    const drift = expected ? Math.abs(system.duration - expected) : 0;
    if (expected && expected > 1 && drift > DRIFT_ABSOLUTE && drift / expected > DRIFT_RELATIVE) {
      const ratio = system.duration / expected;
      if (ratio > 0.9 && ratio < 1.1) {
        tempo = ratio;
        length = expected;
      } else
        warnings.push("O áudio do PC tem uma duração que não confere; ele foi mantido sem ajuste.");
    }
    if (await roomFor(dir, [system])) {
      systemAudio = join(dir, "sistema.m4a");
      await alignAudio([{ ...system, duration: length }], segments, systemAudio, tempo);
      outputs.push({
        path: systemAudio,
        expected: duration,
        parts: [system.path],
        label: "O áudio do PC",
      });
    } else {
      systemParts = placeParts([system], segments, offsets);
      warnings.push("Faltou espaço para alinhar o áudio do PC: ele ficou como foi gravado.");
    }
  }

  // Camera files as recorded, placed on the take's clock.
  const cameraParts = placeParts(parts.camera, segments, offsets);

  // Cursor data.
  let cursor: string | undefined;
  let cursorParts: string[] | undefined;
  if (parts.screen.length && replay.begin.monitor) {
    const journal = await readHelperJournal(dir);
    const events = mergeHookEvents(
      input.events ?? [],
      journal.map((entry) => entry.event),
    );
    const m = replay.begin.monitor;
    const r = replay.begin.region ?? { x: 0, y: 0, width: m.width, height: m.height };
    const data = buildCursorData(events, replay, segments, {
      x: m.x + r.x,
      y: m.y + r.y,
      width: r.width,
      height: r.height,
    });
    if (screenParts) {
      cursorParts = [];
      for (const [i, p] of screenParts.entries()) {
        const file = join(dir, `cursor-${p.part}.json`);
        await writeAtomic(file, JSON.stringify(cursorDataForPart(data, offsets[i], p.duration)));
        cursorParts.push(file);
      }
    } else {
      cursor = join(dir, "cursor.json");
      await writeAtomic(cursor, JSON.stringify(data));
    }
    await pruneHelperJournal(dir, journal, segments);
  }

  // A file that does not hold what it should keeps its parts, and is flushed to the disk.
  const superseded: string[] = [];
  for (const output of outputs) {
    const held = await probe(output.path).then(
      (info) => info.duration,
      () => Number.NaN,
    );
    if (Math.abs(held - output.expected) <= LENGTH_TOLERANCE) superseded.push(...output.parts);
    else
      warnings.push(
        `${output.label} ficou com ${Number.isFinite(held) ? `${held.toFixed(2)} s` : "duração ilegível"} em vez de ${output.expected.toFixed(2)} s; as partes originais foram mantidas.`,
      );
    await syncFile(output.path);
  }

  const narration =
    replay.narration && existsSync(join(dir, replay.narration.file))
      ? {
          narration: join(dir, replay.narration.file),
          // The recorder counted from its first estimate of the first frame; the take starts
          // at the final one.
          narrationOffset: round(
            replay.narration.offset +
              (replay.narration.origin !== undefined
                ? (replay.narration.origin - parts[reference][0].qpc) / 1000
                : 0),
          ),
        }
      : {};
  const lines = replay.lines.map((l) => ({ t: momentInTake(segments, l.qpc), index: l.index }));
  const over =
    replay.begin.mode === "over" && replay.begin.over
      ? {
          ...replay.begin.over,
          anchors: replay.over.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
        }
      : undefined;
  const result: RecordingResult = {
    version: 2,
    dir,
    ...(screen ? { screen, ...(cursor ? { cursor } : {}) } : {}),
    ...(screenParts
      ? {
          screenParts: screenParts.map((p, i) => ({
            path: p.path,
            at: round(offsets[i]),
            in: 0,
            duration: p.duration,
            cursor: cursorParts?.[i] ?? "",
          })),
        }
      : {}),
    ...(microphone ? { microphone } : {}),
    ...(microphoneParts?.length ? { microphoneParts } : {}),
    ...(systemAudio ? { systemAudio } : {}),
    ...(systemParts?.length ? { systemParts } : {}),
    ...(cameraParts.length ? { cameraParts } : {}),
    ...narration,
    duration: round(duration),
    pauses: rangesInTake(replay.pauses, segments),
    markers: replay.markers.map((m) => ({ t: momentInTake(segments, m.qpc), kind: m.kind })),
    ...(lines.length ? { lines } : {}),
    ...(voice ? { mode: "voice" as const } : {}),
    ...(over ? { mode: "over" as const, over } : {}),
    ...(input.cursorIssues?.length ? { cursorIssues: [...input.cursorIssues] } : {}),
    ...(input.encoderIssues?.length ? { encoderIssues: [...input.encoderIssues] } : {}),
    ...(warnings.length ? { warnings: [...warnings] } : {}),
  };
  await writeAtomic(join(dir, RESULT_FILE), JSON.stringify(result, null, 2));
  await appendDurable(join(dir, JOURNAL_FILE), JSON.stringify({ k: "finalized", qpc: qpc() }));
  // Only now (until the line above, finalizing again needs every part), and nothing from here
  // on may throw: the take is done.
  const remove = input.remove ?? removePart;
  const left: string[] = [];
  for (const path of superseded)
    try {
      await remove(path);
    } catch (error) {
      left.push(`${basename(path)} (${error instanceof Error ? error.message : String(error)})`);
    }
  if (left.length)
    result.warnings = [
      ...(result.warnings ?? []),
      `Não consegui apagar partes já copiadas, que seguem ocupando espaço na pasta: ${left.join(", ")}.`,
    ];
  return result;
}

/** Parts placed on the take's clock as they are (the camera, or sound without room to redo it). */
function placeParts(
  parts: readonly Measured[],
  segments: readonly CaptureSegment[],
  offsets: readonly number[],
): RecordingPiece[] {
  const placed: RecordingPiece[] = [];
  for (const c of parts)
    segments.forEach((g, i) => {
      const a = Math.max(c.qpc, g.start);
      const b = Math.min(c.qpc + c.duration * 1000, g.start + g.duration * 1000);
      if (b - a < 50) return;
      placed.push({
        path: c.path,
        at: round(offsets[i] + (a - g.start) / 1000),
        in: round((a - c.qpc) / 1000),
        duration: round((b - a) / 1000),
      });
    });
  return placed;
}

/** The disk has room to write these parts again (they shrink little when re-encoded). */
async function roomFor(dir: string, parts: readonly Measured[]): Promise<boolean> {
  let size = 0;
  for (const p of parts) size += (await stat(p.path)).size;
  return (await freeSpace(dir)) >= size * 1.1 + 5 * 1024 ** 2;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Written whole, flushed to the disk and renamed into place. */
async function writeAtomic(path: string, text: string): Promise<void> {
  const partial = `${path}.partial`;
  const file = await open(partial, "w");
  try {
    await file.writeFile(text);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(partial, path);
}

/** Waits for a file's bytes to reach the disk. */
async function syncFile(path: string): Promise<void> {
  const file = await open(path, "r+");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Appends one line and waits for it to reach the disk. */
async function appendDurable(path: string, line: string): Promise<void> {
  const file = await open(path, "a");
  try {
    await file.write(`${line}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Runs FFmpeg and hands back its exit code and error output, whatever they are. */
function ffmpegStatus(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/**
 * Seconds a file really holds, by reading its packets (no decoding): MediaRecorder's WebM has no
 * duration, and a fragmented MP4 cut short has no index saying it.
 */
async function packetDuration(path: string, stream: "a" | "v"): Promise<number> {
  let text = "";
  await run(
    FFMPEG,
    [
      "-v",
      "error",
      "-i",
      path,
      "-map",
      `0:${stream}:0`,
      "-c",
      "copy",
      "-f",
      "null",
      "-progress",
      "pipe:1",
      "-",
    ],
    {
      onStdout: (chunk) => {
        text = (text + chunk.toString()).slice(-4000);
      },
    },
  );
  const all = [...text.matchAll(/out_time_us=(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) / 1e6 : 0;
}

/**
 * A part cut short keeps whole fragments and may end in a broken one: FFmpeg reads it, and when
 * that shows errors the part is remuxed (without re-encoding) in place.
 */
async function repair(path: string): Promise<void> {
  const check = await ffmpegStatus([
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0",
    "-c",
    "copy",
    "-f",
    "null",
    "-",
  ]);
  if (check.code === 0 && !check.stderr.trim()) return;
  // The voice of a "Só voz" take is PCM in Matroska, which MP4 cannot hold.
  const matroska = path.toLowerCase().endsWith(".mkv");
  const fixed = `${path}.fixed.${matroska ? "mkv" : "mp4"}`;
  try {
    await run(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-err_detect",
      "ignore_err",
      "-fflags",
      "+discardcorrupt",
      "-i",
      path,
      "-map",
      "0",
      "-c",
      "copy",
      "-f",
      matroska ? "matroska" : "mp4",
      fixed,
    ]);
    await rename(fixed, path);
  } finally {
    await rm(fixed, { force: true });
  }
}

/**
 * Seconds of a part, or null when it holds nothing usable (the take goes on without it and says
 * so); `problem` is what went wrong with it.
 */
async function partDuration(
  path: string,
  src: MediaSource,
  suspect: boolean,
): Promise<{ duration: number | null; problem?: string }> {
  if (!existsSync(path) || (await stat(path)).size === 0) return { duration: null };
  let problem: string | undefined;
  if (suspect && src !== "system")
    await repair(path).catch((error: unknown) => {
      problem = error instanceof Error ? error.message : String(error);
    });
  try {
    const seconds =
      src === "system"
        ? await packetDuration(path, "a")
        : (await probe(path)).duration || (await packetDuration(path, src === "mic" ? "a" : "v"));
    return seconds > 0 ? { duration: seconds, problem } : { duration: null, problem };
  } catch (error) {
    return {
      duration: null,
      problem: problem ?? (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function measureParts(
  dir: string,
  replay: JournalReplay,
  suspect: FinalizeInput["suspect"],
  warnings: string[],
): Promise<Record<MediaSource, Measured[]>> {
  const out: Record<MediaSource, Measured[]> = { screen: [], mic: [], camera: [], system: [] };
  for (const src of MEDIA_SOURCES)
    for (const part of replay.parts[src]) {
      const path = join(dir, part.file);
      const check = suspect === "all" || !!suspect?.has(part.file);
      const { duration, problem } = await partDuration(path, src, check);
      if (duration === null) {
        warnings.push(
          `A parte ${part.file} estava vazia ou ilegível e ficou de fora${problem ? `: ${problem}` : "."}`,
        );
        continue;
      }
      out[src].push({ ...part, path, duration });
    }
  return out;
}

async function freeSpace(dir: string): Promise<number> {
  const fs = await statfs(dir);
  return fs.bavail * fs.bsize;
}

/**
 * The screen as one regular MP4 (quick to seek) when the disk has room for the copy; a single
 * part without that room is used as it is. `copied` says the parts can go once the take is done.
 */
async function joinScreen(
  dir: string,
  parts: Measured[],
): Promise<{ file?: string; copied: boolean }> {
  let size = 0;
  for (const p of parts) size += (await stat(p.path)).size;
  if ((await freeSpace(dir)) < size * JOIN_ROOM) {
    return parts.length === 1 ? { file: parts[0].path, copied: false } : { copied: false };
  }
  const out = join(dir, "tela.mp4");
  const partial = join(dir, "tela.partial.mp4");
  const list =
    parts.length > 1
      ? await writeFilterScript(
          parts.map((p) => `file '${p.path.replace(/'/g, "'\\''")}'`).join("\n"),
        )
      : null;
  const input = list ? ["-f", "concat", "-safe", "0", "-i", list] : ["-i", parts[0].path];
  try {
    await run(FFMPEG, [
      "-y",
      "-v",
      "error",
      ...input,
      "-map",
      "0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      partial,
    ]);
    await rename(partial, out);
  } finally {
    await rm(partial, { force: true });
    if (list) await rm(list, { force: true });
  }
  return { file: out, copied: true };
}

type AudioPiece = { input: number; from: number; to: number } | { silence: number };

/**
 * Sound parts placed on the take's clock: for each segment, what the parts recorded over it,
 * with silence where none did. `tempo` first stretches the sound back to the wall clock.
 */
export function audioPieces(
  parts: readonly { qpc: number; duration: number }[],
  segments: readonly CaptureSegment[],
): AudioPiece[] {
  const pieces: AudioPiece[] = [];
  const order = parts.map((p, i) => ({ ...p, i })).sort((a, b) => a.qpc - b.qpc);
  for (const g of segments) {
    let cursor = g.start;
    const end = g.start + g.duration * 1000;
    for (const p of order) {
      const p0 = p.qpc;
      const p1 = p.qpc + p.duration * 1000;
      const a = Math.max(cursor, p0);
      const b = Math.min(end, p1);
      if (b - a < 1) continue;
      if (a - cursor >= 1) pieces.push({ silence: (a - cursor) / 1000 });
      pieces.push({ input: p.i, from: (a - p0) / 1000, to: (b - p0) / 1000 });
      cursor = b;
    }
    if (end - cursor >= 1) pieces.push({ silence: (end - cursor) / 1000 });
  }
  return pieces;
}

const STEREO = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
const MONO = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono";

/**
 * Sound parts laid on the take's clock into one file: AAC stereo (the microphone of a screen
 * take, the computer's sound) or, for the voice of a "Só voz" take, 16-bit PCM mono WAV.
 */
async function alignAudio(
  parts: readonly Measured[],
  segments: readonly CaptureSegment[],
  out: string,
  tempo?: number,
  codec: "aac" | "pcm" = "aac",
): Promise<void> {
  const layout = codec === "pcm" ? MONO : STEREO;
  const pieces = audioPieces(parts, segments);
  const uses = parts.map((_, i) => pieces.filter((p) => "input" in p && p.input === i).length);
  // Only the parts that cover the take are inputs; `slot` is a part's input number.
  const used = parts.flatMap((p, i) => (uses[i] ? [{ path: p.path, i }] : []));
  const slot = new Map(used.map((u, n) => [u.i, n]));
  const graph: string[] = [];
  const next = parts.map(() => 0);
  uses.forEach((count, i) => {
    if (!count) return;
    const labels = Array.from({ length: count }, (_, j) => `[s${i}_${j}]`).join("");
    graph.push(
      `[${slot.get(i)}:a]${tempo ? `atempo=${tempo.toFixed(6)},` : ""}aresample=48000,${layout}${count > 1 ? `,asplit=${count}` : ""}${labels}`,
    );
  });
  pieces.forEach((p, k) => {
    if ("input" in p) {
      const label = `[s${p.input}_${next[p.input]++}]`;
      graph.push(
        `${label}atrim=start=${p.from.toFixed(6)}:end=${p.to.toFixed(6)},asetpts=PTS-STARTPTS[p${k}]`,
      );
    } else
      graph.push(
        `anullsrc=channel_layout=${codec === "pcm" ? "mono" : "stereo"}:sample_rate=48000,atrim=duration=${p.silence.toFixed(6)},${layout}[p${k}]`,
      );
  });
  graph.push(`${pieces.map((_, k) => `[p${k}]`).join("")}concat=n=${pieces.length}:v=0:a=1[out]`);
  const script = await writeFilterScript(graph.join(";\n"));
  const partial = `${out}.partial.${codec === "pcm" ? "wav" : "m4a"}`;
  try {
    await run(FFMPEG, [
      "-y",
      "-v",
      "error",
      ...used.flatMap((u) => ["-i", u.path]),
      await filterScriptOption(FFMPEG),
      script,
      "-map",
      "[out]",
      ...(codec === "pcm"
        ? ["-c:a", "pcm_s16le", "-rf64", "auto", "-f", "wav"]
        : ["-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"]),
      partial,
    ]);
    await rename(partial, out);
  } finally {
    await rm(partial, { force: true });
    await rm(script, { force: true });
  }
}

/** cursor.jsonl as parsed lines; a half-written last line from a killed helper is left out. */
async function readHelperJournal(dir: string): Promise<{ line: string; event: HookEvent }[]> {
  let text: string;
  try {
    text = await readFile(join(dir, "cursor.jsonl"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return text.split("\n").flatMap((line) => {
    const event = parseHookLine(line);
    return event ? [{ line, event }] : [];
  });
}

/** Keeps only what happened inside the recorded parts (and the cursor images). */
async function pruneHelperJournal(
  dir: string,
  journal: { line: string; event: HookEvent }[],
  segments: readonly CaptureSegment[],
): Promise<void> {
  if (!journal.length) return;
  const kept = journal.filter((entry) => insideSegments(entry.event, segments));
  await writeAtomic(join(dir, "cursor.jsonl"), kept.map((entry) => `${entry.line}\n`).join(""));
}
