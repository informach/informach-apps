import { mergeRanges, type TimelineWord } from "./cleanup.ts";
import { atempo } from "./exportPlan.ts";
import type { ScriptDoc, ScriptSection } from "./script.ts";
import { speechItems } from "./script.ts";
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
 * The lesson's voice as it goes to HeyGen and comes back. The voice track ("Voz", or the one with
 * the microphone of a recording) is rendered, treated and cut as it is on the timeline, into WAV
 * files of 48 kHz, 16 bits, mono: the whole lesson, one per script section, or one per avatar
 * insert. Each file keeps a source map (which media and which of its seconds each stretch of the
 * file holds), so a HeyGen MP4 made from it lands where that voice is on the timeline now, even
 * after cuts made later.
 */

/**
 * HeyGen's limits for an uploaded audio (developers.heygen.com, usage limits and video
 * generation input, read on 18/10/2026): WAV or MP3, up to 10 minutes and 50 MB. At 48 kHz,
 * 16 bits, mono a WAV takes 96 kB a second, so 8 minutes (46 MB) per file keeps both.
 */
export const HEYGEN_MAX_SECONDS = 480;
export const HEYGEN_FORMAT = { rate: 48000, channels: 1, bits: 16 } as const;

const EPS = 1e-3;
const round = (v: number): number => Math.round(v * 1000) / 1000;
const n = (v: number): string => String(round(v));

/** The track the lesson's voice is on: "Voz", else the one with a recording's microphone. */
export function voiceTrack(
  project: Pick<Project, "tracks" | "clips" | "assets">,
): Track | undefined {
  const audio = project.tracks.filter((t) => t.kind === "audio" && !t.music);
  const used = (t: Track): number => project.clips.filter((c) => c.trackId === t.id).length;
  const named = audio.find((t) => t.name === "Voz" && used(t) > 0);
  if (named) return named;
  const mic = new Set(
    project.assets.filter((a) => a.recording?.role === "mic" || a.voiceTakes).map((a) => a.id),
  );
  let best: { track: Track; count: number } | undefined;
  for (const t of audio) {
    const count = project.clips.filter((c) => c.trackId === t.id && mic.has(c.assetId)).length;
    if (count && (!best || count > best.count)) best = { track: t, count };
  }
  return best?.track;
}

/** The clips of the voice track that sound, in order. */
export function voiceClips(project: Pick<Project, "tracks" | "clips" | "assets">): Clip[] {
  const track = voiceTrack(project);
  if (!track || track.muted) return [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  return project.clips
    .filter((c) => c.trackId === track.id && c.volume > 0 && assets.get(c.assetId)?.hasAudio)
    .sort((a, b) => a.start - b.start);
}

/** What the voice is: its clips, their media and the treated file each plays. FNV-1a, hex. */
export function voiceHash(project: Pick<Project, "tracks" | "clips" | "assets">): string {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const text = voiceClips(project)
    .map((c) => {
      const a = assets.get(c.assetId);
      const file = a ? (treatedPath(a) ?? a.path) : "";
      return [
        c.assetId,
        n(c.start),
        n(c.in),
        n(c.duration),
        n(clipSpeed(c)),
        n(c.volume),
        file,
      ].join("|");
    })
    .join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${text.length.toString(36)}`;
}

/** Timeline span of the voice: from its first clip to the end of its last. */
export function voiceSpan(
  project: Pick<Project, "tracks" | "clips" | "assets">,
): [number, number] | null {
  const clips = voiceClips(project);
  if (!clips.length) return null;
  return [clips[0].start, Math.max(...clips.map(clipEnd))];
}

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
  max = HEYGEN_MAX_SECONDS,
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
      parts.push({ label: `${p.label} · parte ${part++}`, start, end: round(cut) });
      start = round(cut);
    }
    if (parts.length) parts.push({ label: `${p.label} · parte ${part}`, start, end: p.end });
    else parts.push(p);
    out.push(...parts);
  }
  return out;
}

/** Gaps between the voice's clips over [start, end]: quiet by construction. */
export function voiceGaps(
  project: Pick<Project, "tracks" | "clips" | "assets">,
): [number, number][] {
  const busy = mergeRanges(
    voiceClips(project).map((c): [number, number] => [c.start, clipEnd(c)]),
    0,
  );
  const gaps: [number, number][] = [];
  for (let i = 1; i < busy.length; i++) gaps.push([busy[i - 1][1], busy[i][0]]);
  return gaps;
}

/** The whole lesson as one piece (split when longer than HeyGen takes). */
export function lessonPieces(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  label: string,
  quiet: readonly [number, number][] = [],
): PieceSpec[] {
  const span = voiceSpan(project);
  if (!span) return [];
  return splitLong([{ label, start: span[0], end: span[1] }], [...voiceGaps(project), ...quiet]);
}

/** Margin kept around a line when a piece is cut from the voice. */
const PAD = 0.3;

/** One piece per script section heard in the voice (by the transcript), in timeline order. */
export function sectionPieces(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  doc: ScriptDoc,
  words: readonly TimelineWord[],
  quiet: readonly [number, number][] = [],
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
  return splitLong(pieces, [...voiceGaps(project), ...quiet]);
}

/**
 * One piece per avatar insert of the section (F1P1-D01) whose voice was recorded: by the takes
 * of a "Só voz" recording (the last one that was not thrown away), else by the transcript.
 */
export function insertPieces(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  section: ScriptSection,
  words: readonly TimelineWord[],
): PieceSpec[] {
  const items = speechItems(section);
  const clips = voiceClips(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const voice = new Set(clips.map((c) => c.id));
  const alignment = alignSection(
    section,
    words.filter((w) => voice.has(w.clipId)),
  );
  const out: PieceSpec[] = [];
  items.forEach((item, index) => {
    if (!item.insertId) return;
    let range: [number, number] | null = null;
    for (const c of clips) {
      const takes = (assets.get(c.assetId)?.voiceTakes ?? []).filter(
        (t) => t.line === index && !t.retake,
      );
      const take = takes.at(-1);
      if (!take) continue;
      const a = Math.max(take.start, c.in);
      const b = Math.min(take.end, sourceEnd(c));
      if (b - a < 0.2) continue;
      const span: [number, number] = [timelineAt(c, a), timelineAt(c, b)];
      range = range ? [Math.min(range[0], span[0]), Math.max(range[1], span[1])] : span;
    }
    if (!range) {
      const line = alignment.lines.find((l) => l.item === section.items.indexOf(item));
      if (line?.start !== undefined && line.end !== undefined && line.matched / line.total >= 0.5)
        range = [line.start - PAD, line.end + PAD];
    }
    if (range)
      out.push({ label: item.insertId, start: round(Math.max(0, range[0])), end: round(range[1]) });
  });
  return out.sort((a, b) => a.start - b.start);
}

/** Which media and which of its seconds each stretch of the piece [start, end] holds. */
export function sourceMapFor(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  start: number,
  end: number,
): VoiceMasterSegment[] {
  const out: VoiceMasterSegment[] = [];
  for (const c of voiceClips(project)) {
    const a = Math.max(start, c.start);
    const b = Math.min(end, clipEnd(c));
    if (b - a < EPS) continue;
    const speed = clipSpeed(c);
    out.push({
      at: round(a - start),
      duration: round(b - a),
      start: round(a),
      assetId: c.assetId,
      in: round(c.in + (a - c.start) * speed),
      ...(speed !== 1 ? { speed } : {}),
    });
  }
  return out;
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

/** The voice over the timeline range [start, end], as segments to render. */
export function voiceSegments(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  start: number,
  end: number,
): VoiceSegment[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out: VoiceSegment[] = [];
  for (const c of voiceClips(project)) {
    const a = Math.max(start, c.start);
    const b = Math.min(end, clipEnd(c));
    const asset = assets.get(c.assetId);
    if (b - a < EPS || !asset) continue;
    const speed = clipSpeed(c);
    out.push({
      path: treatedPath(asset) ?? asset.path,
      start: round(a),
      in: round(c.in + (a - c.start) * speed),
      duration: round(b - a),
      speed,
      volume: c.volume,
    });
  }
  return out;
}

/** An FFmpeg run that writes the voice of [start, end] to `out` as HeyGen takes it. */
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
  rate: number = HEYGEN_FORMAT.rate,
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
  project: Pick<Project, "tracks" | "clips" | "assets">,
  start: number,
  end: number,
  out: string,
  rate: number = HEYGEN_FORMAT.rate,
): RenderPlan => renderSegments(voiceSegments(project, start, end), start, end, out, rate);

/** File name of a piece: the lesson and the stretch, without characters Windows refuses. */
export function pieceFileName(lesson: string, label: string): string {
  const clean = (s: string): string =>
    [...s]
      .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  return `${clean(lesson).slice(0, 80) || "Aula"} - ${clean(label).slice(0, 60) || "voz"}.wav`;
}

/**
 * Where a moment of an exported piece is on the timeline now: through its source map, in the
 * voice clip that still holds that second of that media. Null when it was cut away since.
 */
export function pieceToTimeline(
  project: Pick<Project, "tracks" | "clips" | "assets">,
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

/** A clip of the HeyGen video: where it goes and which of its seconds it plays. */
export interface HeygenPlacement {
  start: number;
  in: number;
  duration: number;
  /** Video seconds per timeline second (a render a little longer or shorter than the voice). */
  speed: number;
}

/**
 * The HeyGen video over the timeline: `offset` is the piece's second at the video's 0 and
 * `scale` piece seconds per video second (audioSync). Every stretch of the piece's source map
 * that is still on the timeline gets the part of the video made from it, so cuts made before
 * or after the export are followed.
 */
export function heygenPlacements(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  piece: Pick<VoiceMasterPiece, "sourceMap">,
  offset: number,
  scale: number,
  videoDuration: number,
): HeygenPlacement[] {
  const out: HeygenPlacement[] = [];
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
      // Video second of media second x: v0 + (x - s0) / (speed * scale) · scale… in piece time.
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
  // Stretches that still follow each other on the timeline and in the video become one clip.
  const joined: HeygenPlacement[] = [];
  for (const p of out) {
    const last = joined.at(-1);
    if (
      last &&
      Math.abs(last.start + last.duration - p.start) < 0.002 &&
      Math.abs(last.in + last.duration * last.speed - p.in) < 0.002 &&
      Math.abs(last.speed - p.speed) < 1e-4
    )
      last.duration = round(last.duration + p.duration);
    else joined.push({ ...p });
  }
  return joined;
}

/** The voice changed since it went to HeyGen (a cut, a new take, another treatment). */
export const masterIsStale = (
  project: Pick<Project, "tracks" | "clips" | "assets">,
  master: Pick<VoiceMaster, "hash">,
): boolean => voiceHash(project) !== master.hash;
