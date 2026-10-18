import { clipEnd, newId } from "./clipTime.ts";
import type { Transform } from "./compose.ts";
import type { RecordingResult } from "./recording.ts";
import { keptRanges } from "./recordingJournal.ts";
import type { Asset, Clip, Project, RecordingRole, Track } from "./types.ts";

/**
 * Where a finished take goes in the project. Pauses stay in the files and become cuts here: the
 * stretches kept are laid end to end from `at`, every source cut at the same moments, so the
 * screen, the camera, the microphone and the computer's sound stay together. Each source gets a
 * track of its own: the screen on the main video track, the camera on the one above it, the
 * microphone on "Voz", the computer's sound on "Áudio do PC" and the guided narration on its own
 * track. Existing tracks are reused when they are free over the take.
 */

/** A stretch of the take that was kept, where it went, and its screen and voice clips. */
export interface RecordingPieceLayout {
  /** Seconds of the take. */
  from: number;
  to: number;
  /** Where it starts on the timeline. */
  start: number;
  screen: Clip[];
  voice?: Clip;
}

export interface RecordingLayout {
  tracks: Track[];
  clips: Clip[];
  /** The clips this take added. */
  placed: Clip[];
  pieces: RecordingPieceLayout[];
  /** Which source of the take each media is (Asset.recording.role). */
  roles: { assetId: string; role: RecordingRole }[];
  /** Seconds of the take kept on the timeline. */
  duration: number;
  /** Seconds of the timeline where the take starts. */
  at: number;
}

export interface LayoutOptions {
  /** Where the camera sits in the frame. */
  cameraTransform?: (asset: Asset) => Transform;
}

/** The shortest clip worth placing. */
const MIN = 1 / 30;
const EPS = 1e-6;

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const newTrack = (kind: Track["kind"], name: string): Track => ({
  id: newId("t"),
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});

const defaultCamera = (): Transform => ({
  x: 0.88,
  y: 0.76,
  scale: 0.28,
  opacity: 1,
  mask: "circle",
});

export function layoutRecording(
  project: Pick<Project, "tracks" | "clips">,
  assets: readonly Asset[],
  result: RecordingResult,
  at?: number,
  options: LayoutOptions = {},
): RecordingLayout {
  const find = (path: string | undefined): Asset | undefined =>
    path ? assets.find((a) => samePath(a.path, path)) : undefined;
  const screens = (
    result.screen
      ? [{ path: result.screen, at: 0, in: 0, duration: result.duration }]
      : (result.screenParts ?? [])
  ).flatMap((p) => {
    const asset = find(p.path);
    return asset ? [{ ...p, asset }] : [];
  });
  const cameras = (result.cameraParts ?? []).flatMap((p) => {
    const asset = find(p.path);
    return asset ? [{ ...p, asset }] : [];
  });
  const mic = find(result.microphone);
  const system = find(result.systemAudio);
  const narration = find(result.narration);

  let tracks = [...project.tracks];
  const clips = [...project.clips];
  const placed: Clip[] = [];
  const kept = keptRanges(result.pauses, result.duration);
  const duration = kept.reduce((sum, [a, b]) => sum + (b - a), 0);

  const videoTracks = (): Track[] => tracks.filter((t) => t.kind === "video" && !t.locked);
  let main = videoTracks().at(-1);
  if (!main && screens.length) {
    // Video tracks come before the audio ones.
    main = newTrack("video", "Tela");
    const firstAudio = tracks.findIndex((t) => t.kind === "audio");
    tracks.splice(firstAudio < 0 ? tracks.length : firstAudio, 0, main);
  }
  const mainId = main?.id;
  const start =
    at ?? clips.reduce((last, c) => (c.trackId === mainId ? Math.max(last, clipEnd(c)) : last), 0);
  const end = start + duration;
  const free = (track: Track): boolean =>
    !track.locked &&
    !clips.some((c) => c.trackId === track.id && c.start < end - EPS && clipEnd(c) > start + EPS);

  let cameraTrack: Track | undefined;
  if (cameras.length && main) {
    const index = tracks.indexOf(main);
    const above = tracks[index - 1];
    if (above && above.kind === "video" && free(above)) cameraTrack = above;
    else {
      cameraTrack = newTrack("video", "Câmera");
      tracks.splice(index, 0, cameraTrack);
    }
  }
  const audioTrack = (name: string): Track => {
    const existing = tracks.find((t) => t.kind === "audio" && t.name === name && free(t));
    if (existing) return existing;
    const track = newTrack("audio", name);
    tracks = [...tracks, track];
    return track;
  };
  const voiceTrack = mic ? audioTrack("Voz") : undefined;
  const systemTrack = system ? audioTrack("Áudio do PC") : undefined;
  const narrationTrack = narration ? audioTrack("Narração guiada") : undefined;

  const add = (clip: Omit<Clip, "id">): Clip | undefined => {
    if (clip.duration < MIN) return undefined;
    const c: Clip = { id: newId("c"), ...clip };
    clips.push(c);
    placed.push(c);
    return c;
  };

  const pieces: RecordingPieceLayout[] = [];
  let cursor = start;
  for (const [from, to] of kept) {
    const piece: RecordingPieceLayout = { from, to, start: cursor, screen: [] };
    const place = (srcFrom: number, srcTo: number) => ({
      start: cursor + (srcFrom - from),
      duration: srcTo - srcFrom,
    });
    if (main)
      for (const s of screens) {
        const a = Math.max(from, s.at);
        const b = Math.min(to, s.at + s.duration);
        if (b - a < MIN) continue;
        const clip = add({
          assetId: s.asset.id,
          trackId: main.id,
          ...place(a, b),
          in: s.in + (a - s.at),
          volume: 1,
        });
        if (clip) piece.screen.push(clip);
      }
    if (cameraTrack)
      for (const c of cameras) {
        const a = Math.max(from, c.at);
        const b = Math.min(to, c.at + c.duration, c.at + c.asset.duration - c.in);
        if (b - a < MIN) continue;
        add({
          assetId: c.asset.id,
          trackId: cameraTrack.id,
          ...place(a, b),
          in: c.in + (a - c.at),
          volume: 0,
          transform: options.cameraTransform?.(c.asset) ?? defaultCamera(),
        });
      }
    // The microphone and the computer's sound start at the take's second 0.
    const sound = (asset: Asset, track: Track, volume: number): Clip | undefined => {
      const b = Math.min(to, asset.duration);
      if (b - from < MIN) return undefined;
      return add({ assetId: asset.id, trackId: track.id, ...place(from, b), in: from, volume });
    };
    if (mic && voiceTrack) piece.voice = sound(mic, voiceTrack, 1);
    if (system && systemTrack) sound(system, systemTrack, 0.8);
    pieces.push(piece);
    cursor += to - from;
  }

  // The narration was timed by the recorder's clock, which already skipped the pauses.
  if (narration && narrationTrack && (result.narrationOffset ?? 0) < duration) {
    const offset = result.narrationOffset ?? 0;
    const skip = Math.max(0, -offset);
    add({
      assetId: narration.id,
      trackId: narrationTrack.id,
      start: start + Math.max(0, offset),
      in: skip,
      duration: Math.min(narration.duration - skip, duration - Math.max(0, offset)),
      volume: 1,
    });
  }

  const roles: { assetId: string; role: RecordingRole }[] = [
    ...screens.map((s) => ({ assetId: s.asset.id, role: "screen" as const })),
    ...cameras.map((c) => ({ assetId: c.asset.id, role: "camera" as const })),
    ...(mic ? [{ assetId: mic.id, role: "mic" as const }] : []),
    ...(system ? [{ assetId: system.id, role: "system" as const }] : []),
    ...(narration ? [{ assetId: narration.id, role: "narration" as const }] : []),
  ].filter((r, i, all) => all.findIndex((o) => o.assetId === r.assetId) === i);

  return { tracks, clips, placed, pieces, roles, duration, at: start };
}
