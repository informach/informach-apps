import type { PlaybackCaps } from "@shared/types";

/** The one <video> of the window, registered by the stage. */
let element: HTMLVideoElement | null = null;
export const setVideo = (v: HTMLVideoElement | null): void => {
  element = v;
};
export const video = (): HTMLVideoElement | null => element;

export function seek(t: number): void {
  const v = element;
  if (!v || !Number.isFinite(v.duration)) return;
  v.currentTime = Math.max(0, Math.min(v.duration, t));
}

export function togglePlay(): void {
  const v = element;
  if (!v) return;
  if (v.paused) void v.play().catch(() => undefined);
  else v.pause();
}

/** What this Chromium decodes, asked once: HEVC and AV1 depend on the machine. */
export function playbackCaps(): PlaybackCaps {
  const probe = document.createElement("video");
  const can = (type: string) => probe.canPlayType(type) !== "";
  return {
    hevc: can('video/mp4; codecs="hvc1.1.6.L93.B0"') || can('video/mp4; codecs="hev1.1.6.L93.B0"'),
    av1: can('video/mp4; codecs="av01.0.05M.08"'),
    mkvH264: can('video/x-matroska; codecs="avc1.42E01E"'),
  };
}

/**
 * Volume up to 200% and "Realçar volume" go through Web Audio: the element's sound passes a
 * gain and, when boosted, a compressor that lifts quiet speech. The element itself stays at 1.
 */
interface AudioGraph {
  context: AudioContext;
  gain: GainNode;
  compressor: DynamicsCompressorNode;
}
/**
 * One graph per <video> for its whole life: an element can be routed into Web Audio only once,
 * so the graph is never closed and rebuilt (React's development double mount would leave the
 * element routed into a closed context, silent).
 */
const graphs = new WeakMap<HTMLVideoElement, AudioGraph>();

function graphOf(v: HTMLVideoElement): AudioGraph | null {
  const known = graphs.get(v);
  if (known) return known;
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(v);
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -36;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    source.connect(gain);
    const graph = { context, gain, compressor };
    graphs.set(v, graph);
    return graph;
  } catch {
    return null;
  }
}

export function applyVolume(volume: number, muted: boolean, boost: boolean): void {
  const v = element;
  if (!v) return;
  const g = graphOf(v);
  if (!g) {
    // Without Web Audio the element's own volume still works up to 100%.
    v.volume = Math.min(1, volume);
    v.muted = muted;
    return;
  }
  g.gain.disconnect();
  g.compressor.disconnect();
  if (boost) {
    g.gain.connect(g.compressor);
    g.compressor.connect(g.context.destination);
  } else g.gain.connect(g.context.destination);
  g.gain.gain.value = muted ? 0 : volume * (boost ? 1.6 : 1);
  if (g.context.state === "suspended") void g.context.resume();
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;
export const folderOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, "");
