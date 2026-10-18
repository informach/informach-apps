import { ANNOTATION_TEXT } from "./annotation.ts";
import type { Cue } from "./captions.ts";
import { DEFAULT_CAPTION_STYLE } from "./captions.ts";
import { strip, type TimelineWord } from "./cleanup.ts";
import { clipLayout } from "./compose.ts";
import { chaptersOf, hasChapterMarkers } from "./markers.ts";
import { LINE_MISSING, LINE_PARTIAL } from "./retake.ts";
import { type ScriptSection, speechItems } from "./script.ts";
import type { Alignment } from "./scriptAlign.ts";
import { clipEnd, projectDuration } from "./timeline.ts";
import type { Asset, Clip, Project, PublishInfo } from "./types.ts";

/**
 * The check before exporting: what would make the lesson worse for a child of 9 to 14 watching
 * it, found on the project as it is. Each finding says where it is and, when the editor can do
 * it, how to fix it (the export dialog and the AI's check_before_export show the same list).
 */

export type Severity = "error" | "warn" | "info";

export type FindingKind =
  | "silence-start"
  | "silence-end"
  | "loudness"
  | "peak"
  | "duration"
  | "line-missing"
  | "line-partial"
  | "bridge-spoken"
  | "voices-overlap"
  | "caption-safe"
  | "annotation-small"
  | "caption-small"
  | "caption-fast"
  | "media-missing"
  | "cursor-missing"
  | "chapters"
  | "black-gap"
  | "short-piece"
  | "solo";

export type Fix = { label: string } & (
  | { action: "cut"; ranges: [number, number][] }
  | { action: "propose-cut"; ranges: [number, number][]; reason: string }
  | { action: "relink" }
  | { action: "chapters"; chapters: NonNullable<PublishInfo["chapters"]> }
  | { action: "normalize" }
  | { action: "annotation-size"; clipId: string; fontSize: number }
  | { action: "caption-size"; size: number }
  | { action: "solo-off" }
  | { action: "without-cursor" }
);

/** What a recording whose cursor data went missing looks like in the export. */
export const CURSOR_MISSING =
  "O ponteiro não vai aparecer nestes trechos. Reconecte o arquivo do cursor para mostrar.";

/**
 * The lesson as it is exported once the person chose "Exportar sem o cursor": the recordings
 * whose cursor data went missing are exported as plain videos (no pointer, no keys on screen).
 * Nothing else changes, and the lesson itself keeps them as they are.
 */
export function withoutMissingCursors<P extends Pick<Project, "assets">>(project: P): P {
  if (!project.assets.some((a) => a.cursorMissing)) return project;
  return {
    ...project,
    assets: project.assets.map((a) => {
      if (!a.cursorMissing) return a;
      const { cursor: _cursor, cursorMissing: _missing, ...rest } = a;
      return rest;
    }),
  };
}

export interface Finding {
  severity: Severity;
  kind: FindingKind;
  /** Timeline second to go to. */
  at?: number;
  message: string;
  fix?: Fix;
}

export interface Loudness {
  /** Integrated loudness (LUFS). */
  lufs: number;
  /** True peak (dBTP); -Infinity for silence. */
  peak: number;
}

export interface PreflightContext {
  /** Timeline words (cleanup.ts timelineWords). */
  words?: readonly TimelineWord[];
  /** Where anyone is heard (cleanup.ts speechIntervals). */
  speech?: readonly (readonly [number, number])[];
  /** Caption cues of the edit (captions.ts buildCues, from captionWords). */
  cues?: readonly Cue[];
  /** The .srt goes out with the export: its reading speed counts even without burned captions. */
  srt?: boolean;
  section?: ScriptSection;
  alignment?: Alignment;
  /** Measured by the main process (main/loudness.ts); undefined while not measured. */
  loudness?: Loudness | null;
  /** The export brings the volume to −14 LUFS. */
  normalize?: boolean;
  /** Tracks heard alone in the editor now (solo): the export does not follow it. */
  solo?: readonly string[];
}

/** Thresholds of the checks. */
export const PREFLIGHT = {
  /** Silence at the very start or end longer than this (seconds). */
  edgeSilence: 1.5,
  /** Two voices at once longer than this (seconds). */
  overlap: 0.3,
  /** Captions inside the central 90% of the frame. */
  safeArea: 0.9,
  /** Annotation letters smaller than this share of the frame height are hard to read (36 px in
   *  1080p), and smaller than `annotationTiny` they are a problem. */
  annotationText: 0.033,
  annotationTiny: 0.026,
  /** Smallest burned captions, % of the frame height. */
  captionSize: 5,
  /** Most characters per second a caption may ask a child to read, over a whole stretch. */
  captionCps: 17,
  /** Seconds the reading speed is averaged over, and the longest a cue counts on screen after
   *  its last word. */
  captionWindow: 10,
  captionLinger: 0.7,
  /** The Zappy bridge counts as spoken with this share of its words in order, and this many. */
  bridgeShare: 0.6,
  bridgeWords: 6,
  /** Chapters: at least this many, each this long. */
  chapters: 3,
  chapterSeconds: 10,
  /** Shortest piece, in frames. */
  frames: 3,
  /** Integrated loudness outside this range is too soft or too loud (LUFS). */
  lufs: [-20, -9] as [number, number],
  /** True peak above this distorts (dBTP). */
  peak: -1,
} as const;

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const secs = (s: number): string => `${s.toFixed(1).replace(".", ",")} s`;
const dec = (v: number, d = 1): string => v.toFixed(d).replace(".", ",").replace("-", "−");

/** Reads the summary FFmpeg's ebur128 filter prints at the end (peak=true). */
export function parseLoudness(stderr: string): Loudness | null {
  const lufs = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/i.exec(stderr);
  const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/i.exec(stderr);
  if (!lufs) return null;
  const value = (s: string): number => (/inf/i.test(s) ? Number.NEGATIVE_INFINITY : Number(s));
  return { lufs: value(lufs[1]), peak: peak ? value(peak[1]) : Number.NEGATIVE_INFINITY };
}

const timed = (c: Clip, assets: Map<string, Asset>): boolean => {
  const kind = assets.get(c.assetId)?.kind;
  return (kind === "video" || kind === "audio") && !c.annotation && !c.zoomLayer;
};

/** Font size of an annotation's text in 1080p pixels, as renderAnnotation draws it; null without text. */
export function annotationFont(
  a: NonNullable<Clip["annotation"]>,
): { size: number; fixed: boolean } | null {
  switch (a.kind) {
    case "balloon":
    case "note":
    case "label":
      return a.text?.trim() ? { size: a.fontSize ?? ANNOTATION_TEXT, fixed: false } : null;
    case "title":
      return a.text?.trim() ? { size: a.fontSize ?? 72, fixed: false } : null;
    case "card":
      return a.text?.trim() ? { size: a.fontSize ?? 96, fixed: false } : null;
    case "lowerthird":
    case "step":
      return a.text?.trim() ? { size: 40, fixed: true } : null;
    default:
      return null;
  }
}

/**
 * Letters of an annotation on screen, as a share of the frame height, at its resting size (its
 * transform: a keyframed movement passes through other sizes on its way).
 */
function textShare(c: Clip, asset: Asset, project: Project, size: number): number {
  if (!asset.width || !asset.height) return size / 1080;
  const shown = clipLayout(
    { transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1, ...c.transform } },
    asset,
    project.settings,
  );
  // The picture is drawn at (frame height / 1080) × 2 pixels per 1080p pixel (annotations.ts).
  const drawn = (project.settings.height / 1080) * 2;
  return (size * drawn * (shown.full.w / asset.width)) / project.settings.height;
}

/** Joined intervals of one voice, from its words (pauses up to 0.3 s stay inside). */
function voiceSpans(words: readonly TimelineWord[]): [number, number][] {
  const out: [number, number][] = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && w.start - last[1] <= 0.3) last[1] = Math.max(last[1], w.end);
    else out.push([w.start, w.end]);
  }
  return out;
}

/**
 * Where the bridge was said: the stretch of `words` that says most of its words in order (within
 * a window one and a half times its length), with how many it said. Null under 4 words in order.
 */
function spokenBridge(
  words: readonly TimelineWord[],
  said: readonly string[],
  bridge: readonly string[],
): { range: [number, number]; matched: number } | null {
  if (bridge.length < 3) return null;
  const window = Math.ceil(bridge.length * 1.5);
  let best: { range: [number, number]; matched: number } | null = null;
  for (let i = 0; i < said.length; i++) {
    if (!bridge.includes(said[i])) continue;
    // Bridge words found in order from i, each after the one before.
    let j = bridge.indexOf(said[i]);
    let matched = 1;
    let last = i;
    for (let k = i + 1; k < Math.min(said.length, i + window) && j < bridge.length - 1; k++) {
      const next = bridge.indexOf(said[k], j + 1);
      if (next < 0) continue;
      j = next;
      matched++;
      last = k;
    }
    if (!best || matched > best.matched)
      best = { range: [words[i].start, words[last].end], matched };
  }
  return best && best.matched >= Math.min(4, bridge.length) ? best : null;
}

/** Characters of a cue as read (its lines joined). */
const cueChars = (c: Cue): number =>
  c.lines.map((l) => l.map((w) => w.text).join(" ")).join(" ").length;

/**
 * The stretch of `windowSeconds` where the captions ask the most of the reader: characters over
 * the time they stay on screen (until the next caption, at most `linger` after the last word).
 */
export function worstReading(
  cues: readonly Cue[],
  windowSeconds: number = PREFLIGHT.captionWindow,
  linger: number = PREFLIGHT.captionLinger,
): { start: number; end: number; cps: number } | null {
  const shown = cues.map((c, i) => {
    const last = c.lines.flat().at(-1)?.end ?? c.end;
    const until = Math.min(cues[i + 1]?.start ?? Number.POSITIVE_INFINITY, last + linger);
    return { start: c.start, screen: Math.max(0.1, until - c.start), chars: cueChars(c) };
  });
  const end = shown.length ? shown[shown.length - 1].start + shown[shown.length - 1].screen : 0;
  if (end - (shown[0]?.start ?? 0) < windowSeconds) return null;
  let worst: { start: number; end: number; cps: number } | null = null;
  for (const [i, first] of shown.entries()) {
    if (first.start + windowSeconds > end) break;
    let chars = 0;
    let screen = 0;
    for (const s of shown.slice(i)) {
      if (s.start >= first.start + windowSeconds) break;
      chars += s.chars;
      screen += s.screen;
    }
    const cps = chars / Math.max(1, screen);
    if (!worst || cps > worst.cps)
      worst = { start: first.start, end: first.start + windowSeconds, cps };
  }
  return worst;
}

/** Chapters as YouTube takes them: first at 0:00, at least 3, each 10 s or longer. */
export function chapterProblems(
  chapters: NonNullable<PublishInfo["chapters"]>,
  duration: number,
): { problems: string[]; fixed: NonNullable<PublishInfo["chapters"]> | null } {
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  const problems: string[] = [];
  if (sorted.length && sorted[0].time > 0.5)
    problems.push(`o primeiro começa em ${clock(sorted[0].time)} e não em 0:00`);
  if (sorted.length < PREFLIGHT.chapters)
    problems.push(`são ${sorted.length}, o mínimo é ${PREFLIGHT.chapters}`);
  const lengths = sorted.map((c, i) => (sorted[i + 1]?.time ?? duration) - c.time);
  const short = lengths.filter((l) => l < PREFLIGHT.chapterSeconds).length;
  if (short)
    problems.push(
      short === 1
        ? `um tem menos de ${PREFLIGHT.chapterSeconds} s`
        : `${short} têm menos de ${PREFLIGHT.chapterSeconds} s`,
    );
  if (!problems.length) return { problems, fixed: null };
  // The fix: the first goes to 0:00 and a short chapter joins the one before it.
  const fixed: NonNullable<PublishInfo["chapters"]> = [];
  for (const [i, c] of sorted.entries()) {
    const time = i === 0 ? 0 : c.time;
    const last = fixed[fixed.length - 1];
    if (last && time - last.time < PREFLIGHT.chapterSeconds) continue;
    fixed.push({ ...c, time });
  }
  while (fixed.length > 1 && duration - fixed[fixed.length - 1].time < PREFLIGHT.chapterSeconds)
    fixed.pop();
  return { problems, fixed: fixed.length >= PREFLIGHT.chapters ? fixed : null };
}

/** Every finding about the lesson, errors first, then in timeline order. */
export function preflight(project: Project, ctx: PreflightContext = {}): Finding[] {
  const out: Finding[] = [];
  const duration = projectDuration(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const used = new Set(project.clips.map((c) => c.assetId));
  const fps = project.settings.fps || 30;

  // Media and cursor data that are not there.
  for (const a of project.assets) {
    if (!used.has(a.id)) continue;
    if (a.missing)
      out.push({
        severity: "error",
        kind: "media-missing",
        at: project.clips.find((c) => c.assetId === a.id)?.start,
        message: `Arquivo não encontrado: ${a.name}. A aula não exporta sem ele.`,
        fix: { label: "Reconectar", action: "relink" },
      });
    else if (a.cursorMissing)
      out.push({
        severity: "warn",
        kind: "cursor-missing",
        at: project.clips.find((c) => c.assetId === a.id)?.start,
        message: `${a.name}: ${CURSOR_MISSING}`,
        fix: { label: "Exportar sem o cursor", action: "without-cursor" },
      });
  }

  if (duration <= 0) return out;

  // Silence at the start and at the end: nobody speaks and no music plays.
  const music = project.clips.filter((c) => {
    const t = tracks.get(c.trackId);
    return !!t?.music && !t.muted && c.volume > 0 && assets.get(c.assetId)?.hasAudio;
  });
  const sound = [
    ...(ctx.speech ?? []).map(([a, b]) => [a, b] as [number, number]),
    ...music.map((c): [number, number] => [c.start, clipEnd(c)]),
  ];
  if (ctx.speech && sound.length) {
    const first = Math.min(...sound.map((s) => s[0]));
    const last = Math.max(...sound.map((s) => s[1]));
    // A card on screen is the opening or the closing: quiet under it is on purpose.
    const covered = (a: number, b: number): boolean =>
      project.clips.some(
        (c) => c.annotation?.kind === "card" && c.start <= a + 0.05 && clipEnd(c) >= b - 0.05,
      );
    if (first > PREFLIGHT.edgeSilence && !covered(0, first))
      out.push({
        severity: "warn",
        kind: "silence-start",
        at: 0,
        message: `A aula começa com ${secs(first)} sem som.`,
        fix: { label: "Cortar o silêncio", action: "cut", ranges: [[0, first - 0.5]] },
      });
    if (duration - last > PREFLIGHT.edgeSilence && !covered(last, duration))
      out.push({
        severity: "warn",
        kind: "silence-end",
        at: last,
        message: `A aula termina com ${secs(duration - last)} sem som.`,
        fix: { label: "Cortar o silêncio", action: "cut", ranges: [[last + 0.5, duration]] },
      });
  }

  // Volume, measured on the mix.
  if (ctx.loudness) {
    const { lufs, peak } = ctx.loudness;
    if (ctx.normalize)
      out.push({
        severity: "info",
        kind: "loudness",
        message: `Volume medido em ${dec(lufs)} LUFS, com pico de ${Number.isFinite(peak) ? dec(peak) : "silêncio"} dBTP. A exportação leva a aula a −14 LUFS.`,
      });
    else {
      if (lufs < PREFLIGHT.lufs[0] || lufs > PREFLIGHT.lufs[1])
        out.push({
          severity: "warn",
          kind: "loudness",
          message: `Volume ${lufs < PREFLIGHT.lufs[0] ? "baixo" : "alto"}: ${dec(lufs)} LUFS. O YouTube e as áreas de membros esperam perto de −14 LUFS.`,
          fix: { label: "Normalizar o volume", action: "normalize" },
        });
      if (peak > PREFLIGHT.peak)
        out.push({
          severity: "warn",
          kind: "peak",
          message: `O som chega a ${dec(peak)} dBTP e pode distorcer nos alto-falantes do celular.`,
          fix: { label: "Normalizar o volume", action: "normalize" },
        });
    }
  }

  // The script: target duration, lines not recorded, the Zappy bridge spoken.
  const section = ctx.section;
  if (section?.target) {
    const [min, max] = section.target;
    if (duration < min - 0.5 || duration > max + 0.5)
      out.push({
        severity: "warn",
        kind: "duration",
        message: `A aula tem ${clock(duration)}; o roteiro pede ${section.targetText ?? `de ${clock(min)} a ${clock(max)}`}.`,
      });
  }
  const words = ctx.words ?? [];
  if (section && ctx.alignment && words.length) {
    const placed = new Set(project.clips.flatMap((c) => (c.insertId ? [c.insertId] : [])));
    const lineOf = new Map(ctx.alignment.lines.map((l) => [l.item, l]));
    const speech = speechItems(section);
    for (const [index, it] of section.items.entries()) {
      if (it.kind !== "speech" || (it.insertId && placed.has(it.insertId))) continue;
      const l = lineOf.get(index);
      const share = l ? l.matched / Math.max(1, l.total) : 0;
      const number = speech.indexOf(it) + 1;
      const quote = it.text.length > 70 ? `${it.text.slice(0, 70)}…` : it.text;
      if (share < LINE_MISSING)
        out.push({
          severity: "warn",
          kind: "line-missing",
          message: `A fala ${number} do roteiro (${it.speaker}) não está na aula: "${quote}"`,
        });
      else if (share < LINE_PARTIAL)
        out.push({
          severity: "info",
          kind: "line-partial",
          at: l?.start,
          message: `A fala ${number} do roteiro está pela metade (${Math.round(share * 100)}% das palavras): "${quote}"`,
        });
    }
    const heard = words.filter((w) => !w.silent);
    const said = heard.map((w) => strip(w.text));
    for (const it of section.items) {
      if (it.kind !== "bridge") continue;
      const bridge = it.text.split(/\s+/).map(strip).filter(Boolean);
      const found = spokenBridge(heard, said, bridge);
      if (!found) continue;
      const spoken =
        found.matched >= PREFLIGHT.bridgeWords &&
        found.matched >= PREFLIGHT.bridgeShare * bridge.length;
      out.push(
        spoken
          ? {
              severity: "error",
              kind: "bridge-spoken",
              at: found.range[0],
              message: `O texto do Zappy na página foi falado em ${clock(found.range[0])}; ele é só da plataforma e não entra no vídeo.`,
              fix: {
                label: "Propor o corte",
                action: "propose-cut",
                ranges: [found.range],
                reason: "texto do Zappy na página, não se grava",
              },
            }
          : {
              severity: "info",
              kind: "bridge-spoken",
              at: found.range[0],
              message: `Algumas palavras do texto do Zappy na página aparecem em ${clock(found.range[0])}. Confira se não foi o texto da plataforma lido no vídeo.`,
            },
      );
    }
  }

  // Two voices at once.
  const voices = new Map<string, TimelineWord[]>();
  for (const w of words) {
    if (w.silent || w.role === "other") continue;
    const key = w.source ?? "";
    voices.set(key, [...(voices.get(key) ?? []), w]);
  }
  const spans = [...voices].map(([source, list]) => ({ source, spans: voiceSpans(list) }));
  const overlaps: [number, number][] = [];
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++)
      for (const [a, b] of spans[i].spans)
        for (const [c, d] of spans[j].spans) {
          const s = Math.max(a, c);
          const e = Math.min(b, d);
          if (e - s > PREFLIGHT.overlap) overlaps.push([s, e]);
        }
  for (const [s, e] of overlaps.sort((x, y) => x[0] - y[0]))
    out.push({
      severity: "warn",
      kind: "voices-overlap",
      at: s,
      message: `Duas vozes ao mesmo tempo por ${secs(e - s)} em ${clock(s)}.`,
    });

  // Captions: inside the safe area, big enough, slow enough to read.
  const style = { ...DEFAULT_CAPTION_STYLE, ...project.captions };
  const burned = !!project.captions?.burn;
  const cues = ctx.cues ?? [];
  const { width: W, height: H } = project.settings;
  if (burned && style.size < PREFLIGHT.captionSize)
    out.push({
      severity: "warn",
      kind: "caption-small",
      message: `A legenda está com ${dec(style.size)}% da altura; para crianças, pelo menos ${PREFLIGHT.captionSize}%.`,
      fix: { label: `Aumentar para ${PREFLIGHT.captionSize}%`, action: "caption-size", size: 5.2 },
    });
  if (burned && cues.length) {
    const wide = cues.filter((c) => {
      const size = c.style?.size ?? style.size;
      const longest = Math.max(...c.lines.map((l) => l.map((w) => w.text).join(" ").length));
      // A bold sans letter is a little over half its size wide.
      return longest * 0.55 * (size / 100) * H > PREFLIGHT.safeArea * W;
    });
    if (wide.length) {
      const longest = Math.max(
        ...wide.flatMap((c) => c.lines.map((l) => l.map((w) => w.text).join(" ").length)),
      );
      const fits = Math.floor(((PREFLIGHT.safeArea * W) / (longest * 0.55 * H)) * 1000) / 10;
      out.push({
        severity: "warn",
        kind: "caption-safe",
        at: wide[0].start,
        message:
          wide.length === 1
            ? `Uma legenda passa da área segura de 90% do quadro em ${clock(wide[0].start)}.`
            : `${wide.length} legendas passam da área segura de 90% do quadro; a primeira em ${clock(wide[0].start)}.`,
        ...(fits >= PREFLIGHT.captionSize
          ? {
              fix: {
                label: `Diminuir para ${dec(fits)}%`,
                action: "caption-size",
                size: fits,
              },
            }
          : {}),
      });
    }
  }
  // Reading speed: only for captions someone reads (burned in, or the .srt that goes out).
  const reading = cues.length && (burned || ctx.srt) ? worstReading(cues) : null;
  if (reading && reading.cps > PREFLIGHT.captionCps)
    out.push({
      severity: "warn",
      kind: "caption-fast",
      at: reading.start,
      message: `Entre ${clock(reading.start)} e ${clock(reading.end)} a legenda pede ${Math.round(reading.cps)} caracteres por segundo, acima de ${PREFLIGHT.captionCps}. O público tem de 9 a 14 anos: deixe a fala respirar nesse trecho.`,
    });

  // Annotation letters.
  for (const c of project.clips) {
    if (!c.annotation) continue;
    const font = annotationFont(c.annotation);
    const asset = assets.get(c.assetId);
    if (!font || !asset) continue;
    const share = textShare(c, asset, project, font.size);
    if (share >= PREFLIGHT.annotationText - 1e-4) continue;
    const need = Math.ceil((font.size * PREFLIGHT.annotationText) / share);
    out.push({
      severity: share < PREFLIGHT.annotationTiny - 1e-4 ? "error" : "warn",
      kind: "annotation-small",
      at: c.start,
      message: `Letra pequena em ${clock(c.start)} (${dec(share * 100)}% da altura; o mínimo é ${dec(PREFLIGHT.annotationText * 100)}%): "${(c.annotation.text ?? "").replace(/\s+/g, " ").slice(0, 40)}".`,
      ...(font.fixed
        ? {}
        : {
            fix: {
              label: "Aumentar a letra",
              action: "annotation-size",
              clipId: c.id,
              fontSize: need,
            },
          }),
    });
  }

  // Chapters for YouTube, as the MP4 and the platform package have them (markers first).
  const chapters = chaptersOf(project);
  if (chapters.length) {
    const { problems, fixed } = chapterProblems(chapters, duration);
    // The fix rewrites publish.chapters: chapters from the markers are fixed on the timeline.
    const fromMarkers = hasChapterMarkers(project);
    if (problems.length)
      out.push({
        severity: "warn",
        kind: "chapters",
        at: 0,
        message: `Os capítulos não valem no YouTube: ${problems.join("; ")}.${fromMarkers ? " Eles vêm dos marcadores-capítulo da timeline: ajuste os marcadores." : ""}`,
        ...(fixed && !fromMarkers
          ? { fix: { label: "Corrigir os capítulos", action: "chapters", chapters: fixed } }
          : {}),
      });
  }

  // Black gaps in the main picture and pieces too short to see.
  const pictures = project.clips.filter((c) => {
    const t = tracks.get(c.trackId);
    const a = assets.get(c.assetId);
    if (!t || t.hidden || !a || c.zoomLayer || (c.transform?.opacity ?? 1) <= 0) return false;
    if (c.annotation) return c.annotation.kind === "card";
    return a.kind === "image" || (a.kind === "video" && a.hasVideo);
  });
  const covered = pictures
    .map((c): [number, number] => [c.start, clipEnd(c)])
    .sort((a, b) => a[0] - b[0]);
  let reach = 0;
  const gaps: [number, number][] = [];
  for (const [a, b] of covered) {
    if (a - reach >= 1 / fps - 1e-6) gaps.push([reach, a]);
    reach = Math.max(reach, b);
  }
  if (covered.length && duration - reach >= 1 / fps - 1e-6) gaps.push([reach, duration]);
  for (const [a, b] of gaps) {
    const spoken = (ctx.speech ?? []).some(([s, e]) => s < b - 0.05 && e > a + 0.05);
    out.push({
      severity: "warn",
      kind: "black-gap",
      at: a,
      message: `Tela preta por ${secs(b - a)} em ${clock(a)}${spoken ? ", com fala por cima" : ""}.`,
      ...(spoken ? {} : { fix: { label: "Fechar a lacuna", action: "cut", ranges: [[a, b]] } }),
    });
  }
  for (const c of project.clips) {
    if (!timed(c, assets) || c.duration * fps >= PREFLIGHT.frames - 1e-3) continue;
    out.push({
      severity: "warn",
      kind: "short-piece",
      at: c.start,
      message: `Pedaço de ${Math.max(1, Math.round(c.duration * fps))} ${Math.round(c.duration * fps) <= 1 ? "quadro" : "quadros"} de ${assets.get(c.assetId)?.name ?? "mídia"} em ${clock(c.start)}: aparece como um piscar.`,
      fix: { label: "Tirar o pedaço", action: "cut", ranges: [[c.start, clipEnd(c)]] },
    });
  }

  // Solo is only for listening in the editor: the export mixes every track that is not muted.
  const alone = (ctx.solo ?? []).flatMap((id) => {
    const t = tracks.get(id);
    return t ? [t.name] : [];
  });
  if (alone.length)
    out.push({
      severity: "info",
      kind: "solo",
      message: `No editor, só ${alone.length > 1 ? `${alone.slice(0, -1).join(", ")} e ${alone.at(-1)} estão` : `${alone[0]} está`} tocando (solo). A exportação leva o som de todas as faixas que não estão mudas.`,
      fix: { label: "Ouvir todas as faixas", action: "solo-off" },
    });

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (a.at ?? -1) - (b.at ?? -1));
}
