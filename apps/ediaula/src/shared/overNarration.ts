import { clipEnd, newId } from "./clipTime.ts";
import type { Transform } from "./compose.ts";
import type { RecordingResult } from "./recording.ts";
import type { RecordingLayout } from "./recordingImport.ts";
import { keptRanges } from "./recordingJournal.ts";
import { overwriteRange, videoTrackSlot } from "./timeline.ts";
import type { Asset, Clip, Project, RecordingRole, Track } from "./types.ts";

/**
 * "Tela sobre a narração": the screen recorded while the lesson's voice plays in the
 * headphones. The recorder window notes, every half second, which timeline second of the voice
 * was being heard and when (`over` anchors: the window's clock moved to the take's, the audio
 * output latency taken off). Each stretch of the take kept on import (the pauses are cut, and
 * the voice pauses with them) goes where the voice heard during it is on the timeline.
 */

/** The take moment `t` (seconds) was heard at timeline second `t + k`. */
export interface OverPiece {
  /** Seconds of the take. */
  from: number;
  to: number;
  /** Timeline second where `from` goes. */
  start: number;
}

/** The window's clock against the main process's (QPC ms): the sample with the shortest trip. */
export function clockOffset(
  samples: readonly { sent: number; got: number; qpc: number }[],
): number {
  let best = samples[0];
  for (const s of samples) if (s.got - s.sent < best.got - best.sent) best = s;
  return best.qpc - (best.sent + best.got) / 2;
}

/**
 * One anchor from the playing voice: at window time `now` (ms) the audio element was at
 * `currentTime` of a file that starts at timeline second `fileStart`; what reaches the ears is
 * `latency` seconds behind (AudioContext outputLatency + baseLatency).
 */
export function overAnchor(o: {
  now: number;
  currentTime: number;
  fileStart: number;
  latency: number;
  offset: number;
}): { at: number; qpc: number } {
  return {
    at: Math.max(0, o.fileStart + o.currentTime - Math.max(0, o.latency)),
    qpc: o.now + o.offset,
  };
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Gaps this short between two stretches are closed by holding the earlier one a bit longer. */
const HOLD = 0.25;
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Where each kept stretch of the take goes, clipped to the planned interval. */
export function overPieces(
  result: Pick<RecordingResult, "duration" | "pauses" | "over">,
): OverPiece[] {
  const plan = result.over;
  if (!plan) return [];
  const kept = keptRanges(result.pauses, result.duration);
  const anchors = [...plan.anchors].sort((a, b) => a.t - b.t);
  const out: OverPiece[] = [];
  let lastK: number | null = null;
  for (const [a, b] of kept) {
    const inside = anchors.filter((x) => x.t >= a - 0.05 && x.t <= b + 0.05);
    const before = anchors.filter((x) => x.t < a).at(-1);
    const k: number = inside.length
      ? median(inside.map((x) => x.at - x.t))
      : before
        ? before.at - before.t
        : (lastK ?? plan.from - a);
    lastK = k;
    // Nothing before the point the voice started from, nor after the end of a redo.
    let from = a;
    let to = b;
    if (from + k < plan.from) from = plan.from - k;
    if (plan.to !== undefined && to + k > plan.to) to = plan.to - k;
    if (to - from < 1 / 30) continue;
    const piece = { from: round(from), to: round(to), start: round(from + k) };
    const prev = out.at(-1);
    if (prev) {
      const prevEnd = prev.start + (prev.to - prev.from);
      const gap = piece.start - prevEnd;
      if (gap < 0) {
        // Overlap: the later stretch starts where the earlier one ends.
        piece.from = round(piece.from - gap);
        piece.start = round(prevEnd);
        if (piece.to - piece.from < 1 / 30) continue;
      } else if (gap > 0 && gap <= HOLD) prev.to = round(prev.to + gap);
    }
    out.push(piece);
  }
  return out;
}

export interface OverLayoutOptions {
  cameraTransform?: (asset: Asset) => Transform;
}

const newTrack = (kind: Track["kind"], name: string): Track => ({
  id: newId("t"),
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});

/**
 * The take on the timeline: its screen on the main video track (on a "Tela" track above it when
 * the main one is taken there and nothing is being replaced), the camera above, and the sound
 * (the computer's, a microphone if one was on) on tracks of their own, all at the voice's time.
 * A redo first clears the screen track over [from, to].
 */
export function layoutOverNarration(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  assets: readonly Asset[],
  result: RecordingResult,
  options: OverLayoutOptions = {},
): RecordingLayout {
  const find = (path: string | undefined): Asset | undefined =>
    path ? assets.find((a) => a.path.toLowerCase() === path.toLowerCase()) : undefined;
  const pieces = overPieces(result);
  let tracks = [...project.tracks];
  let clips = [...project.clips];
  const placed: Clip[] = [];
  const plan = result.over;
  const screen = find(result.screen);
  const start = pieces[0]?.start ?? plan?.from ?? 0;
  const last = pieces.at(-1);
  const end = last ? last.start + (last.to - last.from) : start;
  const free = (t: Track): boolean =>
    !t.locked &&
    !clips.some((c) => c.trackId === t.id && c.start < end - 1e-3 && clipEnd(c) > start + 1e-3);

  let main = tracks.filter((t) => t.kind === "video" && !t.locked).at(-1);
  if (plan?.replace && pieces.length) {
    // A redo replaces the screen where it is: the unlocked track with a recording's screen in
    // the stretch, else the main one. Only what the new take covers goes (a take stopped early
    // leaves the rest of the stretch as it was).
    const roles = new Map(project.assets.map((a) => [a.id, a.recording?.role]));
    const holder = tracks.find(
      (t) =>
        t.kind === "video" &&
        !t.locked &&
        clips.some(
          (c) =>
            c.trackId === t.id &&
            roles.get(c.assetId) === "screen" &&
            c.start < end - 1e-3 &&
            clipEnd(c) > start + 1e-3,
        ),
    );
    if (holder) main = holder;
    if (main) clips = overwriteRange(clips, main.id, start, end);
  } else if (main && !free(main)) {
    const named = tracks.find((t) => t.kind === "video" && t.name === "Tela" && free(t));
    if (named) main = named;
    else {
      const track = newTrack("video", "Tela");
      tracks.splice(tracks.indexOf(main), 0, track);
      main = track;
    }
  }
  if (!main && screen) {
    main = newTrack("video", "Tela");
    tracks.splice(videoTrackSlot(tracks), 0, main);
  }

  const add = (clip: Omit<Clip, "id">): Clip | undefined => {
    if (clip.duration < 1 / 30) return undefined;
    const c: Clip = { id: newId("c"), ...clip };
    clips.push(c);
    placed.push(c);
    return c;
  };
  const audioTrack = (name: string): Track => {
    const existing = tracks.find((t) => t.kind === "audio" && t.name === name && free(t));
    if (existing) return existing;
    const track = newTrack("audio", name);
    tracks = [...tracks, track];
    return track;
  };
  const cameras = (result.cameraParts ?? []).flatMap((p) => {
    const asset = find(p.path);
    return asset ? [{ ...p, asset }] : [];
  });
  let cameraTrack: Track | undefined;
  if (cameras.length && main) {
    const above = tracks[tracks.indexOf(main) - 1];
    if (above && above.kind === "video" && free(above)) cameraTrack = above;
    else {
      cameraTrack = newTrack("video", "Câmera");
      tracks.splice(tracks.indexOf(main), 0, cameraTrack);
    }
  }
  const system = find(result.systemAudio);
  const mic = find(result.microphone);
  const systemTrack = system ? audioTrack("Áudio do PC") : undefined;
  const micTrack = mic ? audioTrack("Microfone") : undefined;

  for (const p of pieces) {
    const length = p.to - p.from;
    if (main && screen)
      add({
        assetId: screen.id,
        trackId: main.id,
        start: p.start,
        in: p.from,
        duration: length,
        volume: 1,
      });
    if (cameraTrack)
      for (const c of cameras) {
        const a = Math.max(p.from, c.at);
        const b = Math.min(p.to, c.at + c.duration);
        if (b - a < 1 / 30) continue;
        add({
          assetId: c.asset.id,
          trackId: cameraTrack.id,
          start: p.start + (a - p.from),
          in: c.in + (a - c.at),
          duration: b - a,
          volume: 0,
          transform: options.cameraTransform?.(c.asset) ?? {
            x: 0.88,
            y: 0.76,
            scale: 0.28,
            opacity: 1,
            mask: "circle",
          },
        });
      }
    for (const [asset, track, volume] of [
      [system, systemTrack, 0.8],
      [mic, micTrack, 1],
    ] as const)
      if (asset && track) {
        const b = Math.min(p.to, asset.duration);
        if (b > p.from)
          add({
            assetId: asset.id,
            trackId: track.id,
            start: p.start,
            in: p.from,
            duration: b - p.from,
            volume,
          });
      }
  }

  const roles: { assetId: string; role: RecordingRole }[] = [
    ...(screen ? [{ assetId: screen.id, role: "screen" as const }] : []),
    ...cameras.map((c) => ({ assetId: c.asset.id, role: "camera" as const })),
    ...(mic ? [{ assetId: mic.id, role: "mic" as const }] : []),
    ...(system ? [{ assetId: system.id, role: "system" as const }] : []),
  ].filter((r, i, all) => all.findIndex((o) => o.assetId === r.assetId) === i);
  return {
    tracks,
    clips,
    placed,
    pieces: pieces.map((p) => ({ from: p.from, to: p.to, start: p.start, screen: [] })),
    roles,
    duration: pieces.reduce((sum, p) => sum + p.to - p.from, 0),
    at: start,
  };
}
