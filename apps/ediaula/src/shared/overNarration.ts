import { clipEnd, newId } from "./clipTime.ts";
import type { Transform } from "./compose.ts";
import type { RecordingPiece, RecordingResult } from "./recording.ts";
import type { RecordingLayout } from "./recordingImport.ts";
import { keptRanges } from "./recordingJournal.ts";
import { overwriteRange, videoTrackSlot } from "./timeline.ts";
import type { Asset, Clip, Project, RecordingRole, Track } from "./types.ts";
import { voiceTracks } from "./voiceMaster.ts";

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

/**
 * Timeline second where the take's last kept stretch ends, as the layout puts it: where the next
 * part of a lesson recorded in parts goes on. Null when nothing of the take is kept.
 */
export function overEnd(
  result: Pick<RecordingResult, "duration" | "pauses" | "over">,
): number | null {
  const last = overPieces(result).at(-1);
  return last ? round(last.start + (last.to - last.from)) : null;
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
 * What a redo over [start, end] clears besides the screen: the other sources of the takes whose
 * screen it replaces (their camera, the computer's sound, the drawing), on unlocked tracks, so
 * nothing of the old take plays under the new screen. A microphone of those takes goes too only
 * when another voice covers the stretch: when it is the lesson's voice itself (a screen take with
 * its narration), it is what the teacher heard in the headphones and it stays.
 */
function clearReplacedTakes(
  project: Pick<Project, "tracks" | "clips" | "assets">,
  clips: Clip[],
  screenTrack: string,
  start: number,
  end: number,
): Clip[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const overlaps = (c: Clip): boolean => c.start < end - 1e-3 && clipEnd(c) > start + 1e-3;
  const takes = new Set(
    clips.flatMap((c) => {
      const recording = assets.get(c.assetId)?.recording;
      return c.trackId === screenTrack && recording?.role === "screen" && overlaps(c)
        ? [recording.id]
        : [];
    }),
  );
  if (!takes.size) return clips;
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const voice = new Set(voiceTracks(project).map((t) => t.id));
  const otherVoice = clips.some((c) => {
    const recording = assets.get(c.assetId)?.recording;
    return voice.has(c.trackId) && overlaps(c) && !(recording && takes.has(recording.id));
  });
  const goes = (c: Clip): boolean => {
    const recording = assets.get(c.assetId)?.recording;
    if (!recording || !takes.has(recording.id)) return false;
    if (c.trackId === screenTrack || locked.has(c.trackId) || !overlaps(c)) return false;
    if (recording.role === "mic") return otherVoice;
    return (
      recording.role === "camera" || recording.role === "system" || recording.role === "drawing"
    );
  };
  let out = clips;
  for (const trackId of new Set(clips.filter(goes).map((c) => c.trackId))) {
    const stays = new Set(out.filter((c) => c.trackId === trackId && !goes(c)).map((c) => c.id));
    out = overwriteRange(out, trackId, start, end, stays);
  }
  return out;
}

/**
 * The take on the timeline: its screen on the main video track (on a "Tela" track above it when
 * the main one is taken there and nothing is being replaced), the camera above, and the sound
 * (the computer's, a microphone if one was on) on tracks of their own, all at the voice's time.
 * A redo first clears the screen track over [from, to], with the old take's other sources there.
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
  /**
   * A file of the take on the take's clock: the whole file from second 0, or the parts it was
   * kept in (no room to join them), each where it was recorded. Either way every stretch goes
   * where the voice heard during it is, by the anchors.
   */
  const onTakeClock = (
    whole: string | undefined,
    parts: readonly RecordingPiece[] | undefined,
  ): (RecordingPiece & { asset: Asset })[] => {
    const one = find(whole);
    if (one) return [{ path: one.path, at: 0, in: 0, duration: result.duration, asset: one }];
    return (parts ?? []).flatMap((p) => {
      const asset = find(p.path);
      return asset ? [{ ...p, asset }] : [];
    });
  };
  const screens = onTakeClock(result.screen, result.screenParts);
  const start = pieces[0]?.start ?? plan?.from ?? 0;
  const last = pieces.at(-1);
  const end = last ? last.start + (last.to - last.from) : start;
  const free = (t: Track): boolean =>
    !t.locked &&
    !clips.some((c) => c.trackId === t.id && c.start < end - 1e-3 && clipEnd(c) > start + 1e-3);

  let main = tracks.filter((t) => t.kind === "video" && !t.locked).at(-1);
  // A redo replaces the screen where it is: the unlocked track with a recording's screen in the
  // stretch, else the main one. Only what the new take covers goes (a take stopped early leaves
  // the rest of the stretch as it was).
  const roleOf = new Map(project.assets.map((a) => [a.id, a.recording?.role]));
  const holder =
    plan?.replace && pieces.length
      ? tracks.find(
          (t) =>
            t.kind === "video" &&
            !t.locked &&
            clips.some(
              (c) =>
                c.trackId === t.id &&
                roleOf.get(c.assetId) === "screen" &&
                c.start < end - 1e-3 &&
                clipEnd(c) > start + 1e-3,
            ),
        )
      : undefined;
  // A part recorded "over" what is there, without an interval (the recorder's own rule), with no
  // screen recorded in its stretch has nothing to replace: it goes in as any part, never over a
  // picture or a video that happens to be on the main track.
  const replacing = !!plan?.replace && pieces.length > 0 && (!!holder || plan.to !== undefined);
  if (replacing) {
    if (holder) main = holder;
    if (main) {
      clips = clearReplacedTakes(project, clips, main.id, start, end);
      clips = overwriteRange(clips, main.id, start, end);
    }
  } else if (main && !free(main)) {
    const named = tracks.find((t) => t.kind === "video" && t.name === "Tela" && free(t));
    if (named) main = named;
    else {
      const track = newTrack("video", "Tela");
      tracks.splice(tracks.indexOf(main), 0, track);
      main = track;
    }
  }
  if (!main && screens.length) {
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
  const systems = onTakeClock(result.systemAudio, result.systemParts);
  const mics = onTakeClock(result.microphone, result.microphoneParts);
  const systemTrack = systems.length ? audioTrack("Áudio do PC") : undefined;
  const micTrack = mics.length ? audioTrack("Microfone") : undefined;
  /** The stretch [from, to] of the take from each file on it, at the piece's place. */
  const lay = (
    p: OverPiece,
    files: readonly (RecordingPiece & { asset: Asset })[],
    track: Track,
    extra: Pick<Clip, "volume"> & Partial<Pick<Clip, "transform">>,
  ): Clip[] =>
    files.flatMap((f) => {
      // A file of unknown length (MediaRecorder's WebM) lasts as long as its piece.
      const length = f.asset.duration > 0 ? f.asset.duration - f.in : f.duration;
      const a = Math.max(p.from, f.at);
      const b = Math.min(p.to, f.at + f.duration, f.at + length);
      if (b - a < 1 / 30) return [];
      const clip = add({
        assetId: f.asset.id,
        trackId: track.id,
        start: p.start + (a - p.from),
        in: f.in + (a - f.at),
        duration: b - a,
        ...extra,
      });
      return clip ? [clip] : [];
    });

  // The screen clips of each piece: the drawing of the take goes over them (lib/drawing.ts).
  const shown: Clip[][] = pieces.map(() => []);
  for (const [i, p] of pieces.entries()) {
    if (main) shown[i].push(...lay(p, screens, main, { volume: 1 }));
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
    if (systemTrack) lay(p, systems, systemTrack, { volume: 0.8 });
    if (micTrack) lay(p, mics, micTrack, { volume: 1 });
  }

  const roles: { assetId: string; role: RecordingRole }[] = [
    ...screens.map((f) => ({ assetId: f.asset.id, role: "screen" as const })),
    ...cameras.map((c) => ({ assetId: c.asset.id, role: "camera" as const })),
    ...mics.map((f) => ({ assetId: f.asset.id, role: "mic" as const })),
    ...systems.map((f) => ({ assetId: f.asset.id, role: "system" as const })),
  ].filter((r, i, all) => all.findIndex((o) => o.assetId === r.assetId) === i);
  return {
    tracks,
    clips,
    placed,
    pieces: pieces.map((p, i) => ({ from: p.from, to: p.to, start: p.start, screen: shown[i] })),
    roles,
    duration: pieces.reduce((sum, p) => sum + p.to - p.from, 0),
    at: start,
  };
}
