import { mergeRanges, type TimelineWord } from "./cleanup.ts";
import { atempo } from "./exportPlan.ts";
import type { ScriptDoc, ScriptSection, SpeechItem } from "./script.ts";
import { alignSection } from "./scriptAlign.ts";
import { clipEnd, clipSpeed, sourceEnd, timelineAt } from "./timeline.ts";
import type {
  Clip,
  Project,
  Track,
  VoiceMaster,
  VoiceMasterPiece,
  VoiceMasterSegment,
} from "./types.ts";
import { treatedPath } from "./voiceChain.ts";

/**
 * The lesson's voice as it is exported to make the presenter's video (with an avatar tool or
 * recorded by hand) and comes back. The voice tracks ("Voz", or those with the microphone of a
 * recording) are rendered, treated and cut as they are on the timeline, into WAV files of 48 kHz,
 * 16 bits, mono: the whole lesson, one per script section, or one per avatar insert. Each file
 * keeps a source map (which media and which of its seconds each stretch of the file holds), so a
 * presenter's video made from it lands where that voice is on the timeline now, even after cuts
 * made later.
 */

/**
 * The default longest piece ("Dividir a voz em partes de até N min", 5 min). It comes from
 * HeyGen's limits for an uploaded audio: WAV or MP3; the upload of an asset takes up to 32 MB in
 * a standard request (developers.heygen.com, "Upload Asset", read on 18/10/2026; avatar audio
 * itself may last up to 10 minutes). At 48 kHz, 16 bits, mono a WAV takes 96 kB a second, so
 * five minutes (28.8 MB) per file stays under the upload limit. Other avatar tools have limits of
 * their own: the person chooses (1 to 60 min, Project.voiceExport.pieceMinutes).
 */
export const DEFAULT_PIECE_SECONDS = 300;
export const PIECE_MINUTES = { min: 1, max: 60, default: 5 } as const;

/** The longest piece of an export, in seconds, from the lesson's choice. */
export const pieceSeconds = (project: { voiceExport?: { pieceMinutes?: number } }): number =>
  project.voiceExport?.pieceMinutes !== undefined
    ? Math.min(PIECE_MINUTES.max, Math.max(PIECE_MINUTES.min, project.voiceExport.pieceMinutes)) *
      60
    : DEFAULT_PIECE_SECONDS;
export const VOICE_EXPORT_FORMAT = { rate: 48000, channels: 1, bits: 16 } as const;

/** Most voice masters kept in a project (the newest stay). */
export const VOICE_MASTER_LIMIT = 20;

const EPS = 1e-3;
const round = (v: number): number => Math.round(v * 1000) / 1000;
const n = (v: number): string => String(round(v));

type VoiceProject = Pick<Project, "tracks" | "clips" | "assets">;

/**
 * The tracks the lesson's voice is on: every audio track named "Voz" that holds clips, and any
 * other audio track with a recording's microphone. Music beds never.
 */
export function voiceTracks(project: VoiceProject): Track[] {
  const mic = new Set(
    project.assets.filter((a) => a.recording?.role === "mic" || a.voiceTakes).map((a) => a.id),
  );
  return project.tracks.filter(
    (t) =>
      t.kind === "audio" &&
      !t.music &&
      project.clips.some((c) => c.trackId === t.id && (t.name === "Voz" || mic.has(c.assetId))),
  );
}

/**
 * The voice's clips, in order. Their volume and a mute for the presenter's sound (`mutedFor`) do
 * not take them out: the voice is still what the avatar says.
 */
export function voiceClips(project: VoiceProject): Clip[] {
  const tracks = new Set(voiceTracks(project).map((t) => t.id));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  return project.clips
    .filter((c) => tracks.has(c.trackId) && assets.get(c.assetId)?.hasAudio)
    .sort((a, b) => a.start - b.start);
}

/** A stretch of a media file in the voice: where it plays and from which file. */
export interface VoiceSegment {
  /** The treated file when there is one, else the media itself. */
  path: string;
  /** Timeline second it starts at. */
  start: number;
  /** Source seconds it reads from, and timeline seconds it lasts. */
  in: number;
  duration: number;
  speed: number;
  volume: number;
}

interface Content extends VoiceSegment {
  assetId: string;
}

/**
 * The voice over [start, end] as stretches of media: pieces of a clip split without anything
 * removed in between (as muting a stretch for the presenter's sound does) are one stretch.
 */
function voiceContent(project: VoiceProject, start: number, end: number): Content[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out: Content[] = [];
  for (const c of voiceClips(project)) {
    const a = Math.max(start, c.start);
    const b = Math.min(end, clipEnd(c));
    const asset = assets.get(c.assetId);
    if (b - a < EPS || !asset) continue;
    const speed = clipSpeed(c);
    const item: Content = {
      assetId: c.assetId,
      path: treatedPath(asset) ?? asset.path,
      start: round(a),
      in: round(c.in + (a - c.start) * speed),
      duration: round(b - a),
      speed,
      volume: c.volume,
    };
    const last = out.at(-1);
    if (
      last &&
      last.assetId === item.assetId &&
      last.path === item.path &&
      last.speed === item.speed &&
      last.volume === item.volume &&
      Math.abs(last.start + last.duration - item.start) <= 0.002 &&
      Math.abs(last.in + last.duration * last.speed - item.in) <= 0.002
    )
      last.duration = round(last.duration + item.duration);
    else out.push(item);
  }
  return out;
}

/**
 * What the voice is: which media seconds play where, from which file. Volumes, mutes and clips
 * split without removing anything do not change it. FNV-1a, hex.
 */
export function voiceHash(project: VoiceProject): string {
  const text = voiceContent(project, 0, Number.POSITIVE_INFINITY)
    .map((s) => [s.assetId, n(s.start), n(s.in), n(s.duration), n(s.speed), s.path].join("|"))
    .join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${text.length.toString(36)}`;
}

/** Timeline span of the voice: from its first clip to the end of its last. */
export function voiceSpan(project: VoiceProject): [number, number] | null {
  const clips = voiceClips(project);
  if (!clips.length) return null;
  return [clips[0].start, Math.max(...clips.map(clipEnd))];
}

/**
 * Where a "Só voz" or "Voz e câmera" take goes on the timeline: after the voice already there (0
 * in a new lesson), so a second take never lands over the first. Undefined for other takes.
 */
export const voiceTakeStart = (
  project: VoiceProject,
  result: { mode?: string },
): number | undefined =>
  result.mode === "voice" || result.mode === "voicecam"
    ? (voiceSpan(project)?.[1] ?? 0)
    : undefined;

export interface PieceSpec {
  label: string;
  start: number;
  end: number;
}

/**
 * Pieces longer than `max` split at the middle of the longest quiet stretch in their last
 * quarter (a gap between clips, or `quiet` ranges of the timeline), else right at `max`.
 */
export function splitLong(
  pieces: readonly PieceSpec[],
  quiet: readonly [number, number][],
  max = DEFAULT_PIECE_SECONDS,
): PieceSpec[] {
  const out: PieceSpec[] = [];
  for (const p of pieces) {
    let start = p.start;
    let part = 1;
    const parts: PieceSpec[] = [];
    while (p.end - start > max + EPS) {
      const lo = start + max * 0.75;
      const hi = start + max;
      let best: [number, number] | null = null;
      for (const [a, b] of quiet) {
        const s = Math.max(a, lo);
        const e = Math.min(b, hi);
        if (e - s > (best ? best[1] - best[0] : 0.05)) best = [s, e];
      }
      const cut = best ? (best[0] + best[1]) / 2 : hi;
      parts.push({ label: `${p.label}, parte ${part++}`, start, end: round(cut) });
      start = round(cut);
    }
    if (parts.length) parts.push({ label: `${p.label}, parte ${part}`, start, end: p.end });
    else parts.push(p);
    out.push(...parts);
  }
  return out;
}

/** Labels used by more than one piece (each piece becomes a file named after its label). */
export function repeatedLabels(pieces: readonly PieceSpec[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const p of pieces) {
    const key = p.label.trim().toLowerCase();
    if (seen.has(key)) repeated.add(p.label);
    seen.add(key);
  }
  return [...repeated];
}

/** Gaps between the voice's clips over [start, end]: quiet by construction. */
export function voiceGaps(project: VoiceProject): [number, number][] {
  const busy = mergeRanges(
    voiceClips(project).map((c): [number, number] => [c.start, clipEnd(c)]),
    0,
  );
  const gaps: [number, number][] = [];
  for (let i = 1; i < busy.length; i++) gaps.push([busy[i - 1][1], busy[i][0]]);
  return gaps;
}

/** The whole lesson as one piece (split when longer than `max` seconds). */
export function lessonPieces(
  project: VoiceProject,
  label: string,
  quiet: readonly [number, number][] = [],
  max = DEFAULT_PIECE_SECONDS,
): PieceSpec[] {
  const span = voiceSpan(project);
  if (!span) return [];
  return splitLong(
    [{ label, start: span[0], end: span[1] }],
    [...voiceGaps(project), ...quiet],
    max,
  );
}

/** Margin kept around a line when a piece is cut from the voice. */
const PAD = 0.3;

/** One piece per script section heard in the voice (by the transcript), in timeline order. */
export function sectionPieces(
  project: VoiceProject,
  doc: ScriptDoc,
  words: readonly TimelineWord[],
  quiet: readonly [number, number][] = [],
  max = DEFAULT_PIECE_SECONDS,
): PieceSpec[] {
  const voice = new Set(voiceClips(project).map((c) => c.id));
  const heard = words.filter((w) => voice.has(w.clipId));
  const span = voiceSpan(project);
  if (!span) return [];
  const pieces: PieceSpec[] = [];
  for (const section of doc.sections) {
    const a = alignSection(section, [...heard]);
    const placed = a.lines.filter((l) => l.start !== undefined && l.end !== undefined);
    if (a.coverage < 0.3 || !placed.length) continue;
    pieces.push({
      label: `Seção ${section.number}`,
      start: round(Math.max(span[0], Math.min(...placed.map((l) => l.start ?? 0)) - PAD)),
      end: round(Math.min(span[1], Math.max(...placed.map((l) => l.end ?? 0)) + PAD)),
    });
  }
  pieces.sort((x, y) => x.start - y.start);
  // Sections said one after the other share the pause between them.
  for (let i = 1; i < pieces.length; i++)
    if (pieces[i].start < pieces[i - 1].end) {
      const mid = round((pieces[i - 1].end + pieces[i].start) / 2);
      pieces[i - 1].end = mid;
      pieces[i].start = mid;
    }
  return splitLong(pieces, [...voiceGaps(project), ...quiet], max);
}

/**
 * The speech items of each avatar insert: the line with the insert id and the paragraphs of the
 * same speaker after it, until a "Na tela" direction, another speaker or another insert.
 * Indexes into the section's speech items (as Asset.voiceTakes counts them).
 */
export function insertLines(section: ScriptSection): { insertId: string; lines: number[] }[] {
  const out: { insertId: string; lines: number[] }[] = [];
  let current: { insertId: string; lines: number[]; speaker: string } | null = null;
  let speech = -1;
  for (const item of section.items) {
    if (item.kind !== "speech") {
      if (item.kind === "screen") current = null;
      continue;
    }
    speech++;
    const s: SpeechItem = item;
    if (s.insertId) {
      current = { insertId: s.insertId, lines: [speech], speaker: s.speaker };
      out.push(current);
    } else if (current && s.speaker === current.speaker) current.lines.push(speech);
    else current = null;
  }
  return out.map(({ insertId, lines }) => ({ insertId, lines }));
}

/**
 * One piece per avatar insert of the section (F1P1-D01) whose voice was recorded: by the takes
 * of a "Só voz" recording (the last one of each line that was not thrown away), else by the
 * transcript. An insert in several paragraphs covers them all.
 */
export function insertPieces(
  project: VoiceProject,
  section: ScriptSection,
  words: readonly TimelineWord[],
): PieceSpec[] {
  const clips = voiceClips(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const voice = new Set(clips.map((c) => c.id));
  const alignment = alignSection(
    section,
    words.filter((w) => voice.has(w.clipId)),
  );
  // Speech index → index in section.items (alignment lines count items).
  const itemOf: number[] = [];
  section.items.forEach((item, i) => {
    if (item.kind === "speech") itemOf.push(i);
  });
  const out: PieceSpec[] = [];
  for (const insert of insertLines(section)) {
    const spans: [number, number][] = [];
    const widen = (span: [number, number]): void => {
      spans.push(span);
    };
    for (const index of insert.lines) {
      let found = false;
      for (const c of clips) {
        const takes = (assets.get(c.assetId)?.voiceTakes ?? []).filter(
          (t) => t.line === index && !t.retake,
        );
        const take = takes.at(-1);
        if (!take) continue;
        const a = Math.max(take.start, c.in);
        const b = Math.min(take.end, sourceEnd(c));
        if (b - a < 0.2) continue;
        widen([timelineAt(c, a), timelineAt(c, b)]);
        found = true;
      }
      if (found) continue;
      const line = alignment.lines.find((l) => l.item === itemOf[index]);
      if (line?.start !== undefined && line.end !== undefined && line.matched / line.total >= 0.5)
        widen([line.start - PAD, line.end + PAD]);
    }
    if (spans.length)
      out.push({
        label: insert.insertId,
        start: round(Math.max(0, Math.min(...spans.map((x) => x[0])))),
        end: round(Math.max(...spans.map((x) => x[1]))),
      });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Which media and which of its seconds each stretch of the piece [start, end] holds. */
export function sourceMapFor(
  project: VoiceProject,
  start: number,
  end: number,
): VoiceMasterSegment[] {
  return voiceContent(project, start, end).map((s) => ({
    at: round(s.start - start),
    duration: s.duration,
    start: s.start,
    assetId: s.assetId,
    in: s.in,
    ...(s.speed !== 1 ? { speed: s.speed } : {}),
  }));
}

/** The voice over the timeline range [start, end], as segments to render. */
export function voiceSegments(project: VoiceProject, start: number, end: number): VoiceSegment[] {
  return voiceContent(project, start, end).map(({ assetId: _asset, ...s }) => s);
}

/** An FFmpeg run that writes the voice of [start, end] to `out` as avatar tools take it. */
export interface RenderPlan {
  args: string[];
  /** The media files read (the renderer must be allowed to read each). */
  inputs: string[];
  duration: number;
}

/** The segments mixed into one 16-bit mono WAV of [start, end] (silence where there are none). */
export function renderSegments(
  segments: readonly VoiceSegment[],
  start: number,
  end: number,
  out: string,
  rate: number = VOICE_EXPORT_FORMAT.rate,
): RenderPlan {
  const duration = Math.max(0.05, end - start);
  const args: string[] = ["-y", "-v", "error"];
  const inputs: string[] = [];
  const graph: string[] = [];
  const labels: string[] = [];
  for (const s of segments) {
    const a = Math.max(start, s.start);
    const b = Math.min(end, s.start + s.duration);
    if (b - a < EPS) continue;
    const k = inputs.length;
    inputs.push(s.path);
    args.push("-ss", n(s.in + (a - s.start) * s.speed), "-t", n((b - a) * s.speed), "-i", s.path);
    graph.push(
      `[${k}:a:0]aresample=${rate},aformat=sample_fmts=fltp:channel_layouts=mono,${atempo(s.speed)}volume=${n(s.volume)},adelay=${Math.round((a - start) * 1000)}:all=1[v${k}]`,
    );
    labels.push(`[v${k}]`);
  }
  if (!labels.length) graph.push(`anullsrc=r=${rate}:cl=mono,atrim=0:${n(duration)}[mix]`);
  else
    graph.push(
      `${labels.join("")}${labels.length > 1 ? `amix=inputs=${labels.length}:normalize=0:duration=longest` : "anull"},apad=whole_dur=${n(duration)},atrim=0:${n(duration)}[mix]`,
    );
  args.push(
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[mix]",
    "-ar",
    String(rate),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    out,
  );
  return { args, inputs, duration };
}

export const renderPlan = (
  project: VoiceProject,
  start: number,
  end: number,
  out: string,
  rate: number = VOICE_EXPORT_FORMAT.rate,
): RenderPlan => renderSegments(voiceSegments(project, start, end), start, end, out, rate);

/** File name of a piece, "Aula 3 (F1P1-D01).wav", without characters Windows refuses. */
export function pieceFileName(lesson: string, label: string): string {
  const clean = (s: string): string =>
    [...s]
      .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  return `${clean(lesson).slice(0, 80) || "Aula"} (${clean(label).slice(0, 60) || "voz"}).wav`;
}

/** The folder of one export, by its date and time: "2026-10-18 14h05m09". */
export function exportFolderName(at: Date): string {
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}h${p(at.getMinutes())}m${p(at.getSeconds())}`;
}

/** The project's voice masters with the new one, newest last, within VOICE_MASTER_LIMIT. */
export const withMaster = (list: readonly VoiceMaster[], master: VoiceMaster): VoiceMaster[] =>
  [...list.filter((m) => m.id !== master.id), master].slice(-VOICE_MASTER_LIMIT);

/**
 * Every exported piece of every master, newest master first (two made at the same moment keep
 * the list's order, where the newest is last).
 */
export function masterPieces(
  masters: readonly VoiceMaster[],
): { master: VoiceMaster; piece: VoiceMasterPiece }[] {
  return [...masters]
    .reverse()
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((master) => master.pieces.map((piece) => ({ master, piece })));
}

/**
 * Where a moment of an exported piece is on the timeline now: through its source map, in the
 * voice clip that still holds that second of that media. Null when it was cut away since.
 */
export function pieceToTimeline(
  project: VoiceProject,
  piece: Pick<VoiceMasterPiece, "sourceMap">,
  t: number,
): number | null {
  const seg = piece.sourceMap.find((s) => t >= s.at - EPS && t <= s.at + s.duration + EPS);
  if (!seg) return null;
  const src = seg.in + (t - seg.at) * (seg.speed ?? 1);
  const clip = voiceClips(project).find(
    (c) => c.assetId === seg.assetId && src >= c.in - EPS && src <= sourceEnd(c) + EPS,
  );
  return clip ? timelineAt(clip, src) : null;
}

/** The media a piece was made from are all still in the project. */
export const pieceMediaExist = (
  project: Pick<Project, "assets">,
  piece: Pick<VoiceMasterPiece, "sourceMap">,
): boolean =>
  piece.sourceMap.every((s) => project.assets.some((a) => a.id === s.assetId && !a.missing));

/** A clip of the presenter's video: where it goes and which of its seconds it plays. */
export interface PresenterPlacement {
  start: number;
  in: number;
  duration: number;
  /** Video seconds per timeline second (a render a little longer or shorter than the voice). */
  speed: number;
}

/** Gaps on the timeline up to this long between two stretches of the avatar are bridged. */
export const AVATAR_BRIDGE = 1.5;

/**
 * The presenter's video over the timeline: `offset` is the piece's second at the video's 0 and
 * `scale` piece seconds per video second (audioSync). Every stretch of the piece's source map
 * that is still on the timeline gets the part of the video made from it, so cuts made before
 * or after the export are followed. A short gap between two stretches (a pause between clips
 * of the voice) is bridged by letting the earlier stretch run on, so the avatar does not blink
 * away.
 */
export function presenterPlacements(
  project: VoiceProject,
  piece: Pick<VoiceMasterPiece, "sourceMap">,
  offset: number,
  scale: number,
  videoDuration: number,
): PresenterPlacement[] {
  const out: PresenterPlacement[] = [];
  const clips = voiceClips(project);
  for (const seg of piece.sourceMap) {
    // The stretch of the video made from this segment of the piece.
    const v0 = Math.max(0, (seg.at - offset) / scale);
    const v1 = Math.min(videoDuration, (seg.at + seg.duration - offset) / scale);
    if (v1 - v0 < EPS) continue;
    const speed = seg.speed ?? 1;
    // The segment's media seconds, and each clip that still plays some of them.
    const s0 = seg.in + (offset + v0 * scale - seg.at) * speed;
    const s1 = seg.in + (offset + v1 * scale - seg.at) * speed;
    for (const c of clips) {
      if (c.assetId !== seg.assetId) continue;
      const a = Math.max(s0, c.in);
      const b = Math.min(s1, sourceEnd(c));
      if (b - a < EPS) continue;
      // Video second of media second x.
      const videoAt = (x: number): number => v0 + (x - s0) / speed / scale;
      const t0 = timelineAt(c, a);
      const t1 = timelineAt(c, b);
      out.push({
        start: round(t0),
        in: round(videoAt(a)),
        duration: round(t1 - t0),
        speed: Math.round(((videoAt(b) - videoAt(a)) / (t1 - t0)) * 1e6) / 1e6,
      });
    }
  }
  out.sort((x, y) => x.start - y.start);
  const joined: PresenterPlacement[] = [];
  for (const p of out) {
    const last = joined.at(-1);
    if (!last) {
      joined.push({ ...p });
      continue;
    }
    const lastEnd = last.start + last.duration;
    const gap = p.start - lastEnd;
    // Stretches that still follow each other on the timeline and in the video become one clip.
    if (
      Math.abs(gap) < 0.002 &&
      Math.abs(last.in + last.duration * last.speed - p.in) < 0.002 &&
      Math.abs(last.speed - p.speed) < 1e-4
    ) {
      last.duration = round(last.duration + p.duration);
      continue;
    }
    // A short gap: the earlier stretch runs on over it, as far as the video goes.
    if (gap > 0.002 && gap <= AVATAR_BRIDGE) {
      const room = (videoDuration - (last.in + last.duration * last.speed)) / last.speed;
      last.duration = round(last.duration + Math.max(0, Math.min(gap, room)));
    }
    joined.push({ ...p });
  }
  return joined;
}

/** The voice changed since it was exported (a cut, a new take, another treatment). */
export const masterIsStale = (project: VoiceProject, master: Pick<VoiceMaster, "hash">): boolean =>
  voiceHash(project) !== master.hash;
