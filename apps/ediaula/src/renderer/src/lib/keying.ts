import { type ChromaKey, keyId } from "@shared/chroma";
import { isPersonKey } from "@shared/personKey";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { renderPersonKey } from "./personKey";

/**
 * Keeps every media with background removal backed by an up-to-date transparent video.
 * Watches the project, so imports, slider changes, undo and AI edits all trigger it.
 */

const running = new Map<string, { jobId: string; id: string; promise: Promise<void> }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Waits after a change before rendering, so dragging a slider renders once. */
const SETTLE_MS = 700;

export const keyIsCurrent = (a: Asset): boolean =>
  !!a.key && a.keyStatus === "ready" && !!a.keyed && a.keyedId === keyId(a.key);

/**
 * The transparent video of `asset` with `key`: by color in the main process, or by the local AI
 * (lib/personKey.ts), whose progress is shown here like the main process's is.
 */
export function renderKeyFile(jobId: string, asset: Asset, key: ChromaKey): Promise<string> {
  if (isPersonKey(key))
    return renderPersonKey(jobId, asset, (ratio) => {
      const { jobs, set } = useApp.getState();
      const job = jobs[jobId];
      if (job) set({ jobs: { ...jobs, [jobId]: { ...job, ratio } } });
    });
  return window.api.renderKeyed(
    jobId,
    asset.path,
    asset.width,
    asset.height,
    asset.fps,
    asset.duration,
    key,
  );
}

function render(asset: Asset): Promise<void> {
  const key = asset.key!;
  const id = keyId(key);
  const current = running.get(asset.id);
  if (current?.id === id) return current.promise;
  if (current) void window.api.cancelJob(current.jobId);

  const jobId = newId("job");
  const { startJob, endJob, toast } = useApp.getState();
  const promise = (async () => {
    useProject.getState().patchAsset(asset.id, { keyStatus: "pending" });
    startJob(jobId, `Removendo fundo: ${asset.name}`);
    try {
      const path = await renderKeyFile(jobId, asset, key);
      // Only keep the result if the key was not changed again in the meantime.
      const now = useProject.getState().project?.assets.find((a) => a.id === asset.id);
      if (now?.key && keyId(now.key) === id)
        useProject
          .getState()
          .patchAsset(asset.id, { keyed: path, keyedId: id, keyStatus: "ready" });
    } catch (err) {
      const msg = (err as Error).message;
      if (!/Cancelado/.test(msg)) {
        useProject.getState().patchAsset(asset.id, { keyStatus: "error" });
        toast(`Não foi possível remover o fundo de ${asset.name}: ${msg}`, "error");
      }
    } finally {
      endJob(jobId);
      if (running.get(asset.id)?.jobId === jobId) running.delete(asset.id);
    }
  })();
  running.set(asset.id, { jobId, id, promise });
  return promise;
}

function sync(): void {
  const project = useProject.getState().project;
  if (!project) return;
  for (const a of project.assets) {
    if (!a.key || a.missing || keyIsCurrent(a)) continue;
    if (running.get(a.id)?.id === keyId(a.key)) continue;
    clearTimeout(timers.get(a.id));
    timers.set(
      a.id,
      setTimeout(() => {
        timers.delete(a.id);
        const fresh = useProject.getState().project?.assets.find((x) => x.id === a.id);
        if (fresh?.key && !keyIsCurrent(fresh)) void render(fresh);
      }, SETTLE_MS),
    );
  }
}

let started = false;
export function startKeying(): void {
  if (started) return;
  started = true;
  let last: unknown = null;
  useProject.subscribe((s) => {
    if (s.project?.assets === last) return;
    last = s.project?.assets;
    sync();
  });
  sync();
}

/** Before exporting: renders whatever background removal is still missing for clips in use. */
export async function ensureKeyed(onStatus?: (text: string) => void): Promise<void> {
  const project = useProject.getState().project;
  if (!project) return;
  const used = new Set(project.clips.map((c) => c.assetId));
  const todo = project.assets.filter(
    (a) => used.has(a.id) && a.key && !a.missing && !keyIsCurrent(a),
  );
  for (const a of todo) {
    onStatus?.(`Removendo fundo: ${a.name}…`);
    clearTimeout(timers.get(a.id));
    await render(a);
  }
}
