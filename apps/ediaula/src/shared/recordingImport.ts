import { clipEnd, newId } from "./clipTime.ts";
import type { Transform } from "./compose.ts";
import { alignedAt, type GuidedLapse, lapseSpans } from "./guidedLapse.ts";
import type { RecordingPiece, RecordingResult } from "./recording.ts";
import { keptRanges } from "./recordingJournal.ts";
import { videoTrackSlot } from "./timeline.ts";
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
  /**
   * "Errei, voltar": the earlier attempts left out (take seconds `from` to `to` at `speed`, once
   * at timeline second `start`), each with the take second `later` that took its place.
   */
  attempts?: { from: number; to: number; start: number; speed?: number; later: number }[];
}

export interface LayoutOptions {
  /** Where the camera sits in the frame. */
  cameraTransform?: (asset: Asset) => Transform;
  /** "Voz e câmera": where the presenter (the camera) sits; absent fills the frame. */
  presenterTransform?: (asset: Asset) => Transform | undefined;
  /**
   * A guided take's "Tela sem voz" (guided-run.json): those stretches of the screen go in sped
   * up under the line, so the narration stays on the actions. Only a take of the screen and the
   * narration has them (the lesson window records nothing else).
   */
  lapses?: readonly GuidedLapse[];
}

/** The track of a guided take's page sound. */
export const PAGE_SOUND_TRACK = "Som da página";

/** The track a "Voz e câmera" take puts the presenter on, above the lesson. */
export const PRESENTER_TRACK = "Apresentador";

/** The shortest clip worth placing. */
const MIN = 1 / 30;
const EPS = 1e-6;
/** Seconds left empty between one part of a guided recording and the next on the timeline. */
export const PART_GAP = 2;

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

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
  const withAssets = (list: readonly RecordingPiece[] | undefined) =>
    (list ?? []).flatMap((p) => {
      const asset = find(p.path);
      return asset ? [{ ...p, asset }] : [];
    });
  const cameras = withAssets(result.cameraParts);
  const mic = find(result.microphone);
  const micParts = mic ? [] : withAssets(result.microphoneParts);
  const system = find(result.systemAudio);
  const systemParts = system ? [] : withAssets(result.systemParts);
  const narration = find(result.narration);
  // A guided take's page sound follows the screen (it is on the take's time) and keeps the
  // "Tela sem voz" of a take of the screen and the narration.
  const pageSound = find(result.pageSound);

  let tracks = [...project.tracks];
  const clips = [...project.clips];
  const placed: Clip[] = [];
  const kept = keptRanges(result.pauses, result.duration);
  const alone = !cameras.length && !mic && !micParts.length && !system && !systemParts.length;
  const lapses = alone ? (options.lapses ?? []) : [];
  /** Seconds of the timeline that take seconds `a` to `b` fill (less where they are sped up). */
  const fill = (a: number, b: number): number =>
    lapses.length ? alignedAt(lapses, b) - alignedAt(lapses, a) : b - a;
  const duration = kept.reduce((sum, [a, b]) => sum + fill(a, b), 0);

  // The main track is the bottom video track. When it is locked (or missing) the screen gets a
  // track of its own below the others, after everything the lesson already has: a track above
  // would cover the lesson, and a locked one must not change.
  let main = tracks.filter((t) => t.kind === "video").at(-1);
  let start = at;
  if ((!main || main.locked) && screens.length) {
    main = newTrack("video", "Tela");
    tracks.splice(videoTrackSlot(tracks), 0, main);
    start ??= clips.reduce((last, c) => Math.max(last, clipEnd(c)), 0);
  }
  if (main?.locked) main = undefined;
  const mainId = main?.id;
  if (start === undefined) {
    const last = clips.reduce(
      (end, c) => (c.trackId === mainId ? Math.max(end, clipEnd(c)) : end),
      0,
    );
    // A part of a guided recording (a take with its narration) after what the lesson already
    // has starts a little later: in the edit, the gap shows where one part ends and the next
    // begins. A take that carries on an interrupted one gets its `at` and goes right there.
    start = result.narration && last > EPS ? last + PART_GAP : last;
  }
  const end = start + duration;
  const free = (track: Track): boolean =>
    !track.locked &&
    !clips.some((c) => c.trackId === track.id && c.start < end - EPS && clipEnd(c) > start + EPS);

  // "Voz e câmera": the camera is the presenter, on a track of its own above the lesson (the
  // voice goes to "Voz" like any voice take, and the camera plays muted).
  const presenter = result.mode === "voicecam";
  let cameraTrack: Track | undefined;
  if (cameras.length && presenter) {
    cameraTrack = tracks.find((t) => t.kind === "video" && t.name === PRESENTER_TRACK && free(t));
    if (!cameraTrack) {
      cameraTrack = newTrack("video", PRESENTER_TRACK);
      tracks.splice(0, 0, cameraTrack);
    }
  } else if (cameras.length && main) {
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
  const voiceTrack = mic || micParts.length ? audioTrack("Voz") : undefined;
  const systemTrack = system || systemParts.length ? audioTrack("Áudio do PC") : undefined;
  const narrationTrack = narration ? audioTrack("Narração guiada") : undefined;
  const pageTrack = pageSound ? audioTrack(PAGE_SOUND_TRACK) : undefined;

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
      start: cursor + fill(from, srcFrom),
      duration: fill(srcFrom, srcTo),
    });
    if (main)
      for (const s of screens) {
        const a = Math.max(from, s.at);
        const b = Math.min(to, s.at + s.duration);
        if (b - a < MIN) continue;
        // A "Tela sem voz" is a clip of its own, sped up: the edit makes it what it should be.
        for (const span of lapseSpans(lapses, a, b)) {
          const clip = add({
            assetId: s.asset.id,
            trackId: main.id,
            ...place(span.from, span.to),
            in: s.in + (span.from - s.at),
            volume: 1,
            ...(span.speed
              ? {
                  speed: round4(span.speed),
                  timelapse: {
                    under: round3(fill(span.from, span.to)),
                    source: round3(span.to - span.from),
                  },
                }
              : {}),
          });
          if (clip) piece.screen.push(clip);
        }
      }
    /** Files placed on the take's clock as recorded (the camera, or sound kept in parts). */
    const placeAll = (
      list: readonly (RecordingPiece & { asset: Asset })[],
      track: Track,
      extra: (asset: Asset) => Pick<Clip, "volume" | "transform">,
    ): void => {
      for (const c of list) {
        // A file without a known length (MediaRecorder's WebM) lasts as long as its piece.
        const length = c.asset.duration > 0 ? c.asset.duration - c.in : c.duration;
        const a = Math.max(from, c.at);
        const b = Math.min(to, c.at + c.duration, c.at + length);
        if (b - a < MIN) continue;
        add({
          assetId: c.asset.id,
          trackId: track.id,
          ...place(a, b),
          in: c.in + (a - c.at),
          ...extra(c.asset),
        });
      }
    };
    if (cameraTrack)
      placeAll(cameras, cameraTrack, (asset) => {
        if (!presenter)
          return { volume: 0, transform: options.cameraTransform?.(asset) ?? defaultCamera() };
        const transform = options.presenterTransform?.(asset);
        return transform ? { volume: 0, transform } : { volume: 0 };
      });
    if (voiceTrack) placeAll(micParts, voiceTrack, () => ({ volume: 1 }));
    if (systemTrack) placeAll(systemParts, systemTrack, () => ({ volume: 0.8 }));
    // The microphone and the computer's sound start at the take's second 0.
    const sound = (asset: Asset, track: Track, volume: number): Clip | undefined => {
      const b = Math.min(to, asset.duration);
      if (b - from < MIN) return undefined;
      return add({ assetId: asset.id, trackId: track.id, ...place(from, b), in: from, volume });
    };
    // The page's sound at normal speed only: a "Tela sem voz" goes in sped up without it.
    if (pageSound && pageTrack)
      for (const span of lapseSpans(lapses, from, Math.min(to, pageSound.duration || to))) {
        if (span.speed) continue;
        add({
          assetId: pageSound.id,
          trackId: pageTrack.id,
          ...place(span.from, span.to),
          in: span.from,
          volume: 1,
        });
      }
    if (mic && voiceTrack) piece.voice = sound(mic, voiceTrack, 1);
    if (system && systemTrack) sound(system, systemTrack, 0.8);
    pieces.push(piece);
    cursor += fill(from, to);
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
    ...micParts.map((c) => ({ assetId: c.asset.id, role: "mic" as const })),
    ...(system ? [{ assetId: system.id, role: "system" as const }] : []),
    ...systemParts.map((c) => ({ assetId: c.asset.id, role: "system" as const })),
    ...(narration ? [{ assetId: narration.id, role: "narration" as const }] : []),
    // Sound of the computer (the page's), never a voice: not transcribed nor cleaned.
    ...(pageSound ? [{ assetId: pageSound.id, role: "system" as const }] : []),
  ].filter((r, i, all) => all.findIndex((o) => o.assetId === r.assetId) === i);

  return { tracks, clips, placed, pieces, roles, duration, at: start };
}
