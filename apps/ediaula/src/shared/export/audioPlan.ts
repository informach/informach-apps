import { duckExpr, duckingOf, ducks, speechSpans } from "../audio.ts";
import { adjacency, clipEnd, clipSpeed, projectDuration, sourceEnd } from "../timeline.ts";
import { isCutFx } from "../transitions.ts";
import type { Asset, Clip, ExportSpec, Project } from "../types.ts";
import { treatedPath } from "../voiceChain.ts";

/**
 * The lesson's sound in one pass, separate from the picture: every audible clip of a track is
 * laid end to end with the silences between them (a lane), so a recording cut in a hundred places
 * is read once, in order, and each piece lands on its exact sample. The lanes are mixed, the
 * music steps aside for the voice, and the result is the whole lesson as PCM: the segments of the
 * picture never cut it, so no AAC seam can click.
 */

/** Gentle broadband noise reduction, after cutting the rumble below the voice. */
export const DENOISE = "highpass=f=80,afftdn=nr=12:nf=-35:tn=1";

/** Sample rate of the export's sound. */
export const RATE = 48000;

/** Every cut that is not a continuation of the same recording gets these few milliseconds of fade. */
export const MICROFADE = 0.008;
/** The sound of a clip leaving through a transition fades out over at most this. */
export const TRANSITION_FADE = 0.25;
/** Music that plays to the end of the lesson fades out over this. */
export const MUSIC_END_FADE = 1.5;

/** Tempo change keeping the pitch: atempo takes 0.5 to 2, so larger changes chain several. */
export function atempo(speed: number): string {
  if (Math.abs(speed - 1) < 1e-3) return "";
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s /= 0.5;
  }
  parts.push(s);
  return parts.map((p) => `atempo=${n(p)},`).join("");
}

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const us = (v: number): string => (Math.round(v * 1e6) / 1e6).toString();
const at = (t: number): number => Math.round(t * RATE);

export interface AudioOptions {
  /** Moments someone speaks, for the ducking (default: the voice clips). */
  speech?: [number, number][];
  /** Fixed gain in dB per asset, so the avatar and the microphone sound alike. */
  gains?: Record<string, number>;
  /**
   * The treated voice an asset plays from (default: shared/voiceChain.ts treatedPath, the same
   * file the preview plays), read instead of denoising every clip on its own.
   */
  treated?: (asset: Asset) => string | null;
  /** Filters applied to the whole mix (the one-pass loudnorm of a single command). */
  master?: string;
  firstInput?: number;
}

export interface AudioPlan {
  inputArgs: string[];
  filter: string;
  output: string;
  /** Seconds and samples of the lesson. */
  duration: number;
  samples: number;
  media: string[];
}

/** One audible clip: where it sounds on the timeline and how. */
interface Sound {
  clip: Clip;
  asset: Asset;
  path: string;
  denoise: boolean;
  /** Timeline samples [from, to). */
  from: number;
  to: number;
  /** Source seconds read. */
  in: number;
  out: number;
  fadeIn: number;
  fadeOut: number;
}

/** Seconds a clip's sound fades in and out: its own fades and its transitions. */
function fadesOf(
  clip: Clip,
  outgoing: Map<string, { kind: string; d: number }>,
  incoming: Map<string, { kind: string; d: number }>,
): { fadeIn: number; fadeOut: number } {
  const enter = incoming.get(clip.id);
  const leave = outgoing.get(clip.id);
  return {
    fadeIn: Math.max(clip.fadeIn ?? 0, enter?.kind === "black" ? enter.d / 2 : 0),
    fadeOut: Math.max(
      clip.fadeOut ?? 0,
      leave ? (leave.kind === "black" ? leave.d / 2 : Math.min(leave.d, TRANSITION_FADE)) : 0,
    ),
  };
}

/** Whether `b` goes on exactly where `a` stopped, in the same file and on the same timeline spot. */
const continues = (a: Sound, b: Sound): boolean =>
  a.path === b.path &&
  a.to === b.from &&
  clipSpeed(a.clip) === clipSpeed(b.clip) &&
  Math.abs(b.in - a.out) < 0.001;

export function buildAudioPlan(
  project: Project,
  spec: Pick<ExportSpec, "speech">,
  options: AudioOptions = {},
): AudioPlan {
  const duration = projectDuration(project);
  const samples = Math.max(1, at(duration));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));

  // Transitions: the sound of the clip that leaves fades, "passar pelo preto" dips both.
  const outgoing = new Map<string, { kind: string; d: number }>();
  const incoming = new Map<string, { kind: string; d: number }>();
  const previous = adjacency(project.clips);
  for (const b of project.clips) {
    const a = b.transition ? previous.get(b.id) : undefined;
    if (!a || !b.transition || (isCutFx(b.transition.kind) && b.transition.kind !== "glitch"))
      continue;
    const d = Math.max(0.1, Math.min(b.transition.duration, b.duration / 2, a.duration / 2));
    outgoing.set(a.id, { kind: b.transition.kind, d });
    incoming.set(b.id, { kind: b.transition.kind, d });
  }

  // Lanes: the clips of a track one after the other (a clip overlapping the lane's last one, which
  // the timeline does not make, starts another lane of the same track).
  const lanes: { trackId: string; sounds: Sound[] }[] = [];
  const clips = [...project.clips].sort(
    (a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.start - b.start,
  );
  for (const clip of clips) {
    const track = tracks.get(clip.trackId);
    const asset = assets.get(clip.assetId);
    if (
      !track ||
      !asset ||
      track.muted ||
      !asset.hasAudio ||
      asset.kind === "image" ||
      clip.volume <= 0 ||
      clip.zoomLayer ||
      // A voice clip under the presenter's own sound stays silent (it is there for the voice map).
      clip.mutedFor
    )
      continue;
    const from = at(clip.start);
    const to = at(clipEnd(clip));
    if (to <= from) continue;
    const treated = (options.treated ?? treatedPath)(asset);
    const sound: Sound = {
      clip,
      asset,
      path: treated ?? asset.path,
      denoise: !!clip.denoise && !treated,
      from,
      to,
      in: clip.in,
      out: sourceEnd(clip),
      fadeIn: 0,
      fadeOut: 0,
    };
    let lane = lanes.find((l) => l.trackId === clip.trackId && (l.sounds.at(-1)?.to ?? 0) <= from);
    if (!lane) {
      lane = { trackId: clip.trackId, sounds: [] };
      lanes.push(lane);
    }
    lane.sounds.push(sound);
  }
  for (const lane of lanes) {
    const music = !!tracks.get(lane.trackId)?.music;
    lane.sounds.forEach((s, i) => {
      const prev = lane.sounds[i - 1];
      const next = lane.sounds[i + 1];
      const own = fadesOf(s.clip, outgoing, incoming);
      s.fadeIn = Math.max(own.fadeIn, prev && continues(prev, s) ? 0 : MICROFADE);
      s.fadeOut = Math.max(own.fadeOut, next && continues(s, next) ? 0 : MICROFADE);
      if (music && s.to >= samples - at(0.05)) s.fadeOut = Math.max(s.fadeOut, MUSIC_END_FADE);
    });
  }

  const inputArgs: string[] = [];
  const media = new Set<string>();
  const graph: string[] = [];
  let input = options.firstInput ?? 0;
  let label = 0;
  const format = `aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=stereo`;

  const laneLabels: { trackId: string; label: string }[] = [];
  for (const [li, lane] of lanes.entries()) {
    // Runs of pieces of one file that go forward in it share an input.
    const runs: Sound[][] = [];
    for (const s of lane.sounds) {
      const run = runs.at(-1);
      const last = run?.at(-1);
      if (run && last && last.path === s.path && s.in >= last.out - 1e-6) run.push(s);
      else runs.push([s]);
    }
    const pieces = new Map<Sound, { label: string; seek: number }>();
    for (const run of runs) {
      const first = run[0];
      const last = run[run.length - 1];
      const index = input++;
      inputArgs.push("-ss", us(first.in), "-t", us(last.out - first.in + 0.05), "-i", first.path);
      media.add(first.path);
      const base = `[${index}:a]aresample=${RATE},${format}`;
      if (run.length === 1) {
        pieces.set(first, { label: `ai${index}`, seek: first.in });
        graph.push(`${base}[ai${index}]`);
        continue;
      }
      const labels = run.map((_, i) => `ai${index}_${i}`);
      graph.push(`${base},asplit=${run.length}${labels.map((l) => `[${l}]`).join("")}`);
      for (const [i, s] of run.entries()) pieces.set(s, { label: labels[i], seek: first.in });
    }
    // Each piece: its stretch of the source, cleaned, retimed, at its volume, faded, and exactly
    // as many samples as it lasts on the timeline.
    const parts: string[] = [];
    let cursor = 0;
    for (const s of lane.sounds) {
      const piece = pieces.get(s);
      if (!piece) continue;
      const begin = Math.max(cursor, s.from);
      const count = s.to - begin;
      if (count <= 0) continue;
      if (begin > cursor) {
        const gap = `g${label++}`;
        graph.push(
          `anullsrc=r=${RATE}:cl=stereo,atrim=end_sample=${begin - cursor},${format}[${gap}]`,
        );
        parts.push(gap);
      }
      const speed = clipSpeed(s.clip);
      // A piece that would overlap the one before (rounding) starts that much later in its source.
      const skip = ((begin - s.from) / RATE) * speed;
      const gain = 10 ** ((options.gains?.[s.asset.id] ?? 0) / 20);
      const fadeIn = Math.min(count, at(s.fadeIn));
      const fadeOut = Math.min(count - fadeIn, at(s.fadeOut));
      const out = `c${label++}`;
      graph.push(
        `[${piece.label}]atrim=start=${us(s.in + skip - piece.seek)}:end=${us(s.out - piece.seek)},asetpts=PTS-STARTPTS,` +
          `${s.denoise ? `${DENOISE},` : ""}${atempo(speed)}volume=${n(s.clip.volume * gain)},` +
          `apad=whole_len=${count},atrim=end_sample=${count}` +
          `${fadeIn > 0 ? `,afade=t=in:ss=0:ns=${fadeIn}` : ""}` +
          `${fadeOut > 0 ? `,afade=t=out:ss=${count - fadeOut}:ns=${fadeOut}` : ""},${format}[${out}]`,
      );
      parts.push(out);
      cursor = s.to;
    }
    if (!parts.length) continue;
    const name = `lane${li}`;
    graph.push(
      parts.length === 1
        ? `[${parts[0]}]anull[${name}]`
        : `${parts.map((p) => `[${p}]`).join("")}concat=n=${parts.length}:v=0:a=1[${name}]`,
    );
    laneLabels.push({ trackId: lane.trackId, label: name });
  }

  const mixOf = (labels: string[], out: string): void => {
    graph.push(
      labels.length === 1
        ? `[${labels[0]}]anull[${out}]`
        : `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:normalize=0:duration=longest[${out}]`,
    );
  };
  const voice = laneLabels.filter((l) => !tracks.get(l.trackId)?.music).map((l) => l.label);
  const ducked = laneLabels
    .filter((l) => {
      const track = tracks.get(l.trackId);
      return !!track && ducks(track);
    })
    .map((l) => l.label);
  const flat = laneLabels
    .filter((l) => {
      const track = tracks.get(l.trackId);
      return !!track?.music && !ducks(track);
    })
    .map((l) => l.label);
  const groups: string[] = [];
  if (voice.length) {
    mixOf(voice, "voice");
    groups.push("voice");
  }
  if (ducked.length) {
    // The music follows an envelope that drops while anyone speaks (same curve as the preview).
    const d = duckingOf(project);
    const duck = duckExpr(
      spec.speech ?? options.speech ?? speechSpans(project, [], new Set(), d.ramp, d.hold),
      d.depth,
      d.ramp,
    );
    mixOf(ducked, "musicmix");
    graph.push(`[musicmix]${duck === "1" ? "anull" : `volume='${duck}':eval=frame`}[ducked]`);
    groups.push("ducked");
  }
  if (flat.length) {
    mixOf(flat, "flat");
    groups.push("flat");
  }
  const master = options.master ? `${options.master},` : "";
  const end = `${master}apad=whole_len=${samples},atrim=end_sample=${samples}[aout]`;
  if (!groups.length) graph.push(`anullsrc=r=${RATE}:cl=stereo,${end}`);
  else if (groups.length === 1) graph.push(`[${groups[0]}]${end}`);
  else
    graph.push(
      `${groups.map((g) => `[${g}]`).join("")}amix=inputs=${groups.length}:normalize=0:duration=longest,${end}`,
    );

  return {
    inputArgs,
    filter: graph.join(";\n"),
    output: "aout",
    duration,
    samples,
    media: [...media],
  };
}
