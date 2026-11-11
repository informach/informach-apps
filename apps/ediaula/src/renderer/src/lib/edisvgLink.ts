import {
  adoptAnimation,
  applyRender,
  linkedEntry,
  linkedProjects,
  placeLinked,
  renderBehind,
} from "@shared/linkedMedia";
import { newId } from "@shared/timeline";
import type { Asset, LinkProjectState } from "@shared/types";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { duration as clock } from "./format";
import { mediaPictures, preparePlayback, probeMedia } from "./importMedia";
import { cleanError } from "./transcripts";

/**
 * EdiSVG animations as linked clips of the lesson (packages/edi-link, shared/linkedMedia.ts):
 * - "Nova animação do EdiSVG": EdiSVG makes the animation in the lesson's project, at the
 *   lesson's size and rate and as long as the stretch; a placeholder picture holds its place
 *   until the first render comes;
 * - "Importar animação do EdiSVG…": an animation of any project, linked the same way;
 * - "Editar no EdiSVG": opens it there;
 * - each save in EdiSVG renders the animation, and the clip shows the new render by itself
 *   (the renders folder is watched; also looked at when the lesson opens and the window comes
 *   to the front). The edit of the lesson around it stays; undo never brings an old picture back.
 */

/** Where each linked project stands, for the clip's menu and inspector. */
export interface LinkStatus {
  exists: boolean;
  /** Its animation's last render failed (EdiSVG says why). */
  errors: Map<string, string>;
}
export const useLinkStatus = create<{ projects: Map<string, LinkStatus> }>(() => ({
  projects: new Map(),
}));

/** The picture a linked animation shows until its first render: transparent, with a label. */
async function placeholderPicture(
  name: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Não foi possível desenhar o lugar da animação.");
  const unit = Math.max(12, Math.round(height / 36));
  g.font = `600 ${unit}px system-ui, sans-serif`;
  const label = `${name} · aguardando o EdiSVG`;
  const w = g.measureText(label).width + unit * 2;
  g.fillStyle = "rgba(20, 16, 40, 0.78)";
  g.beginPath();
  g.roundRect(unit, unit, w, unit * 2.2, unit * 0.6);
  g.fill();
  g.fillStyle = "#e9e4ff";
  g.textBaseline = "middle";
  g.fillText(label, unit * 2, unit * 2.1);
  g.strokeStyle = "rgba(155, 123, 255, 0.9)";
  g.setLineDash([unit, unit * 0.6]);
  g.lineWidth = Math.max(2, unit / 6);
  g.strokeRect(g.lineWidth, g.lineWidth, width - g.lineWidth * 2, height - g.lineWidth * 2);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/** A linked animation's place in the lesson, until its first render: a placeholder picture. */
async function placeholderAsset(
  name: string,
  width: number,
  height: number,
  link: Asset["link"],
): Promise<Asset> {
  const bytes = await placeholderPicture(name, width, height);
  const path = await window.api.saveGenerated(bytes, "png");
  return {
    id: newId("a"),
    name,
    path,
    kind: "image",
    duration: 0,
    width,
    height,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: bytes.length,
    proxyStatus: "none",
    alpha: true,
    ...(link ? { link } : {}),
  };
}

/** "Nova animação do EdiSVG": over the stretch marked on the ruler, or 5 s from the cursor. */
export async function newEdisvgAnimation(): Promise<void> {
  const { toast } = useApp.getState();
  try {
    if (!(await useProject.getState().saveNow())) {
      toast("Salve a aula antes de criar uma animação do EdiSVG.", "error");
      return;
    }
    const { project: p, path } = useProject.getState();
    if (!p || !path) return;
    const interval = useApp.getState().interval;
    const start = interval ? interval.start : usePlayback.getState().time;
    const duration = interval ? Math.max(0.5, interval.end - interval.start) : 5;
    const name = `Animação ${clock(start)}`;
    // What a linked render can be (packages/edi-link): sides up to 3840, proportion kept, and
    // up to 60 FPS; the clip is scaled to the lesson like any other video.
    const scale = Math.min(1, 3840 / Math.max(p.settings.width, p.settings.height));
    const width = Math.max(16, Math.round(p.settings.width * scale));
    const height = Math.max(16, Math.round(p.settings.height * scale));
    const fps = Math.min(60, Math.max(1, Math.round(p.settings.fps)));
    const made = await window.api.linkCreate(path, { name, width, height, fps, duration });
    const asset = await placeholderAsset(name, width, height, {
      app: "edisvg",
      project: made.project,
      requestId: made.requestId,
    });
    useProject.getState().commit((q) => placeLinked(q, asset, start, duration));
    void refreshLinks();
    toast(
      made.opened
        ? `"${name}" está sendo criada no EdiSVG. Anime e salve lá: o clipe se atualiza aqui.`
        : `"${name}" espera no EdiSVG: abra o EdiSVG, anime e salve. O clipe se atualiza aqui.`,
      "success",
    );
  } catch (err) {
    toast(`A animação do EdiSVG não foi criada: ${cleanError(err)}`, "error");
  }
}

/** The project and animations "Importar animação do EdiSVG…" offers, while the dialog is open. */
export const useLinkImport = create<{
  pick: Awaited<ReturnType<typeof window.api.linkImportPick>>;
}>(() => ({ pick: null }));

export async function importEdisvgAnimation(): Promise<void> {
  try {
    const pick = await window.api.linkImportPick();
    if (!pick) return;
    if (!pick.animations.length) {
      useApp.getState().toast("Esse projeto do EdiSVG não tem animações.", "error");
      return;
    }
    useLinkImport.setState({ pick });
  } catch (err) {
    useApp.getState().toast(`O projeto do EdiSVG não abriu: ${cleanError(err)}`, "error");
  }
}

/** Links the animation picked in the dialog and places it at the cursor. */
export async function linkPicked(animationId: string): Promise<void> {
  const { toast } = useApp.getState();
  const pick = useLinkImport.getState().pick;
  useLinkImport.setState({ pick: null });
  const animation = pick?.animations.find((a) => a.id === animationId);
  const p = useProject.getState().project;
  if (!pick || !animation || !p) return;
  try {
    const made = await window.api.linkLink(pick.project, animation.id);
    const asset = await placeholderAsset(animation.name, p.settings.width, p.settings.height, {
      app: "edisvg",
      project: pick.project,
      animationId: animation.id,
      requestId: made.requestId,
    });
    const start = usePlayback.getState().time;
    useProject
      .getState()
      .commit((q) => placeLinked(q, asset, start, Math.max(0.5, animation.duration || 5)));
    void refreshLinks();
    toast(
      animation.linked
        ? `"${animation.name}" está na aula, vinculada ao EdiSVG.`
        : `"${animation.name}" está sendo renderizada no EdiSVG${made.opened ? "" : " (abra o EdiSVG)"}. O clipe se atualiza aqui.`,
      "success",
    );
  } catch (err) {
    toast(`A animação não foi vinculada: ${cleanError(err)}`, "error");
  }
}

/** "Editar no EdiSVG": the clip's animation opened there. */
export async function editInEdisvg(assetId: string): Promise<void> {
  const { toast } = useApp.getState();
  const asset = useProject.getState().project?.assets.find((a) => a.id === assetId);
  if (!asset?.link) return;
  try {
    const done = await window.api.linkEdit(asset.link);
    if (!done.opened) toast("Abra o EdiSVG: a animação abre lá para editar.", "info");
  } catch (err) {
    toast(`O EdiSVG não abriu a animação: ${cleanError(err)}`, "error");
  }
}

/** Refreshes run one after the other: two saves in a row never apply out of order. */
let chain: Promise<void> = Promise.resolve();

/**
 * Brings the lesson's linked clips up to their projects' renders: each asset whose animation
 * has a newer render takes it (probed, then applied to the lesson and its whole history). With
 * `project`, only that project (its renders folder just changed); without, every linked project
 * (the lesson opened, the window came to the front), which also sets what is watched.
 */
export function refreshLinks(project?: string): Promise<void> {
  chain = chain.then(() => refresh(project)).catch(() => undefined);
  return chain;
}

async function refresh(only?: string): Promise<void> {
  const p = useProject.getState().project;
  if (!p) return;
  const projectId = p.id;
  const projects = linkedProjects(p);
  const states: LinkProjectState[] = only
    ? projects.some((x) => x.toLowerCase() === only.toLowerCase())
      ? [await window.api.linkState(only)]
      : []
    : await window.api.linkWatch(projects);
  const status = new Map(useLinkStatus.getState().projects);
  for (const state of states) {
    status.set(state.project.toLowerCase(), {
      exists: state.exists,
      errors: new Map(state.items.flatMap((i) => (i.error ? [[i.animationId, i.error]] : []))),
    });
    for (const asset of useProject.getState().project?.assets ?? []) {
      if (asset.link?.project.toLowerCase() !== state.project.toLowerCase()) continue;
      const entry = linkedEntry(asset.link, state.items);
      if (entry && !asset.link.animationId)
        useProject.getState().rewriteMedia((q) => adoptAnimation(q, asset.id, entry));
      if (!entry?.renderPath || !renderBehind(asset, entry)) continue;
      const probed = await probeMedia(entry.renderPath);
      // Another lesson opened meanwhile: that one looks for itself.
      if (useProject.getState().project?.id !== projectId) return;
      const facts = {
        path: entry.renderPath,
        size: probed.asset.size,
        duration: probed.asset.duration,
        width: probed.asset.width,
        height: probed.asset.height,
        fps: probed.asset.fps,
      };
      useProject.getState().rewriteMedia((q) => applyRender(q, asset.id, entry, facts));
      const updated = useProject.getState().project?.assets.find((a) => a.id === asset.id);
      if (!updated) continue;
      const pictures = await mediaPictures(updated);
      if (pictures.thumb !== undefined || pictures.waveform !== undefined)
        useProject.getState().patchAsset(updated.id, pictures);
      preparePlayback(updated, probed.codec);
    }
  }
  useLinkStatus.setState({ projects: status });
}
