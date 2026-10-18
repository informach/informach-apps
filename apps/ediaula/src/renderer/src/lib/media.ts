import type { Asset } from "@shared/types";

/** URL for a local file, served by the main process with range support. */
export const mediaUrl = (path: string): string => `media://local/${encodeURIComponent(path)}`;

/** Prefer the 720p proxy for playback once it is ready. */
export const playbackPath = (a: Asset): string =>
  a.proxyStatus === "ready" && a.proxy ? a.proxy : a.path;

export interface Waveform {
  peaksPerSecond: number;
  peaks: number[];
}

const cache = new Map<string, Promise<Waveform>>();

export function loadWaveform(path: string): Promise<Waveform> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(mediaUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`A forma de onda não foi encontrada (${r.status}).`);
      return r.json() as Promise<Waveform>;
    });
    cache.set(path, p);
    // A failed load is not kept: the file may be made (or reconnected) later.
    const loading = p;
    loading.catch(() => {
      if (cache.get(path) === loading) cache.delete(path);
    });
  }
  return p;
}
