import { DEFAULT_KEY } from "@shared/chroma";
import { newId } from "@shared/timeline";
import type { Asset, ProbeResult } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { ensureFilmstrip } from "./filmstrip";
import { baseName } from "./format";

/** Sources above this height (or not H.264) get a 720p proxy for smooth playback. */
const PROXY_ABOVE_HEIGHT = 1080;

/**
 * Media with transparency keep it in the preview: the browser plays VP8/VP9 with alpha itself,
 * so those are played from the original unless they are large; anything else gets a VP9 proxy
 * with alpha, never an H.264 one.
 */
export function needsProxy(a: Asset, codec?: string): boolean {
  if (a.kind !== "video") return false;
  if (a.alpha)
    return a.height > PROXY_ABOVE_HEIGHT || (!!codec && codec !== "vp9" && codec !== "vp8");
  return a.height > PROXY_ABOVE_HEIGHT || (!!codec && codec !== "h264") || !!a.vfr;
}

/**
 * Probes files and adds them to the project library right away; thumbnails, waveforms and
 * proxies are filled in as they finish. Returns the assets that were added (or already existed).
 */
export async function importMedia(paths: string[]): Promise<Asset[]> {
  const { toast } = useApp.getState();
  const result: Asset[] = [];
  for (const path of paths) {
    const existing = useProject
      .getState()
      .project?.assets.find((a) => a.path.toLowerCase() === path.toLowerCase());
    if (existing) {
      result.push(existing);
      continue;
    }
    try {
      const info = await window.api.probe(path);
      // Avatars recorded on a solid blue or green screen get their background removed right away.
      const screen =
        info.kind === "video" && info.hasVideo
          ? await window.api.detectScreen(path, info.duration, info.width, info.height)
          : null;
      const asset: Asset = {
        id: newId("a"),
        name: baseName(path),
        path,
        kind: info.kind,
        duration: info.duration,
        width: info.width,
        height: info.height,
        fps: info.fps,
        hasVideo: info.hasVideo,
        hasAudio: info.hasAudio,
        size: info.size,
        vfr: info.vfr,
        ...(info.alpha ? { alpha: true } : {}),
        proxyStatus: "none",
        ...(screen ? { screen, key: { color: screen, ...DEFAULT_KEY } } : {}),
      };
      useProject.getState().patch((p) => ({ ...p, assets: [...p.assets, asset] }));
      result.push(asset);
      if (screen)
        toast(
          `${asset.name}: fundo ${screen.toUpperCase()} detectado. Removendo automaticamente.`,
          "info",
        );
      void enrich(asset, info.videoCodec);
    } catch (err) {
      toast(`Não foi possível importar ${baseName(path)}: ${(err as Error).message}`, "error");
    }
  }
  return result;
}

async function enrich(asset: Asset, codec?: string): Promise<void> {
  const { patchAsset } = useProject.getState();
  try {
    if (asset.kind !== "audio") {
      const thumb = await window.api.thumbnail(asset.path, asset.kind, asset.duration);
      patchAsset(asset.id, { thumb });
    }
    if (asset.hasAudio) {
      const waveform = await window.api.waveform(asset.path);
      patchAsset(asset.id, { waveform });
    }
  } catch (err) {
    console.warn("enrich failed", asset.path, err);
  }
  // The filmstrip decodes the proxy when there is one (a 4K original would be slow to read).
  const strip = (): void => {
    const now = useProject.getState().project?.assets.find((a) => a.id === asset.id);
    if (now) void ensureFilmstrip(now);
  };
  if (needsProxy(asset, codec)) void makeProxy(asset).then(strip);
  else strip();
}

export async function makeProxy(asset: Asset): Promise<void> {
  const { patchAsset } = useProject.getState();
  const { startJob, endJob } = useApp.getState();
  const jobId = newId("job");
  patchAsset(asset.id, { proxyStatus: "pending" });
  startJob(jobId, `Proxy: ${asset.name}`);
  try {
    const proxy = await window.api.proxy(
      jobId,
      asset.path,
      asset.duration,
      asset.vfr ? Math.round(asset.fps) || 30 : undefined,
      asset.alpha,
    );
    patchAsset(asset.id, { proxy, proxyStatus: "ready" });
  } catch (err) {
    patchAsset(asset.id, { proxyStatus: "error" });
    useApp
      .getState()
      .toast(`Falha ao gerar proxy de ${asset.name}: ${(err as Error).message}`, "error");
  } finally {
    endJob(jobId);
  }
}

/**
 * Transparency of videos added before the app looked for it: probed once when the project opens
 * (checkAssets). A transparent video keeps it in the preview: an H.264 proxy made for it is made
 * again in VP9 with alpha, or dropped when the original plays as it is.
 */
export async function checkAlpha(): Promise<void> {
  const assets = useProject.getState().project?.assets ?? [];
  for (const a of assets) {
    if (a.kind !== "video" || a.alpha !== undefined || a.missing || a.generated) continue;
    let info: ProbeResult;
    try {
      info = await window.api.probe(a.path);
    } catch (err) {
      console.warn("alpha probe failed", a.path, err);
      continue;
    }
    const { patchAsset } = useProject.getState();
    if (!info.alpha) {
      patchAsset(a.id, { alpha: false });
      if (a.proxyStatus === "pending") void makeProxy({ ...a, alpha: false });
      continue;
    }
    const asset: Asset = { ...a, alpha: true };
    patchAsset(a.id, { alpha: true });
    const opaqueProxy = !!a.proxy && !a.proxy.toLowerCase().endsWith(".webm");
    if (needsProxy(asset, info.videoCodec)) {
      if (opaqueProxy || a.proxyStatus !== "ready") void makeProxy(asset);
    } else if (opaqueProxy) patchAsset(a.id, { proxy: undefined, proxyStatus: "none" });
  }
}
