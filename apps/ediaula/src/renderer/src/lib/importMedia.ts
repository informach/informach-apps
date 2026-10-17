import { DEFAULT_KEY } from "@shared/chroma";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { baseName } from "./format";

/** Sources above this height (or not H.264) get a 720p proxy for smooth playback. */
const PROXY_ABOVE_HEIGHT = 1080;

export function needsProxy(a: Asset, codec?: string): boolean {
  return (
    a.kind === "video" &&
    (a.height > PROXY_ABOVE_HEIGHT || (!!codec && codec !== "h264") || !!a.vfr)
  );
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
  if (needsProxy(asset, codec)) void makeProxy(asset);
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

/** Marks assets whose files disappeared and resumes proxies interrupted by closing the app. */
export async function checkAssets(): Promise<void> {
  const project = useProject.getState().project;
  if (!project?.assets.length) return;
  const exists = await window.api.exists(project.assets.map((a) => a.path));
  project.assets.forEach((a, i) => {
    const missing = !exists[i];
    if (!!a.missing !== missing) useProject.getState().patchAsset(a.id, { missing });
    if (!missing && a.proxyStatus === "pending") void makeProxy(a);
    // A transcription interrupted by closing the app has to be started again.
    if (a.transcriptStatus === "pending")
      useProject.getState().patchAsset(a.id, { transcriptStatus: undefined });
  });
}
