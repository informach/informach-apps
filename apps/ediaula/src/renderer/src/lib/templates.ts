import { ANNOTATION_MOTION, KIND_LABEL } from "@shared/annotation";
import { openGap } from "@shared/inserts";
import {
  type LessonTemplate,
  stackY,
  type TemplateContext,
  templateById,
  templateDefaults,
  templateLayers,
} from "@shared/templates";
import { newId, projectDuration } from "@shared/timeline";
import type { Asset, Clip, Project } from "@shared/types";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { naturalTransform, OVERSAMPLE, overlayTrack, renderAnnotation } from "./annotations";
import { activePalette } from "./palettes";
import { scriptDoc } from "./script";

/** Course, video title and section number from the project and its script. */
export function templateContext(p: Project): TemplateContext {
  const section = scriptDoc(p)?.sections[p.script?.section ?? 0];
  return {
    course: p.course,
    title: section?.videoTitle ?? p.publish?.title ?? p.name,
    section: section?.number,
  };
}

export function defaultValues(t: LessonTemplate): Record<string, string> {
  const p = useProject.getState().project;
  return templateDefaults(t, p ? templateContext(p) : {});
}

/** Where a template goes when the caller does not say: the start, the end or the playhead. */
export function templateStart(t: LessonTemplate, p: Project): number {
  return t.where === "start"
    ? 0
    : t.where === "end"
      ? projectDuration(p)
      : usePlayback.getState().time;
}

/**
 * Inserts a template as one annotation clip per layer, stacked on the tracks above the lesson,
 * in one undo step. Full-screen templates push the lesson forward. Returns the clip ids.
 */
export async function addTemplate(
  id: string,
  values: Record<string, string> = {},
  at?: number,
): Promise<string[]> {
  const t = templateById(id);
  const p = useProject.getState().project;
  if (!t || !p) return [];
  const v = { ...templateDefaults(t, templateContext(p)), ...values };
  const layers = templateLayers(
    t,
    v,
    activePalette(p).roles,
    p.paletteFonts ? activePalette(p).fonts : undefined,
  );
  const rendered = await Promise.all(
    layers.map((l) => renderAnnotation(l.spec, p.settings.height, p.settings.width)),
  );
  const paths = await Promise.all(rendered.map((r) => window.api.saveGenerated(r.bytes, "png")));
  // Layers without a fixed height are stacked around the template's center, by their real heights.
  const flowing = layers.map((l, i) => (l.y === undefined ? i : -1)).filter((i) => i >= 0);
  const ys = stackY(
    flowing.map((i) => rendered[i].height / OVERSAMPLE / p.settings.height),
    t.flowY,
  );
  const start = Math.max(0, at ?? templateStart(t, p));
  const ids: string[] = [];
  useProject.getState().commit((q) => {
    let next: Project = q;
    if (t.fullscreen) {
      next = {
        ...next,
        clips: openGap(next.clips, start, t.duration, new Set(next.tracks.map((tr) => tr.id)))
          .clips,
      };
    }
    layers.forEach((l, i) => {
      const r = rendered[i];
      const asset: Asset = {
        id: newId("a"),
        name: `${t.label} · ${l.spec.kind === "panel" && (l.spec.boxWidth ?? 0) >= 1920 ? "Fundo" : KIND_LABEL[l.spec.kind]}`,
        path: paths[i],
        kind: "image",
        duration: 0,
        width: r.width,
        height: r.height,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: r.bytes.length,
        proxyStatus: "none",
        generated: "annotation",
      };
      const from = start + l.at;
      const duration = Math.max(0.5, t.duration - l.at);
      const { tracks, track } = overlayTrack(next, from, from + duration, "Templates");
      const y = l.y ?? ys[flowing.indexOf(i)];
      const transform = {
        ...naturalTransform(r, next.settings, l.x, y),
        ...(l.opacity !== undefined ? { opacity: l.opacity } : {}),
      };
      const clip: Clip = {
        id: newId("c"),
        assetId: asset.id,
        trackId: track.id,
        start: from,
        in: 0,
        duration,
        volume: 1,
        annotation: l.spec,
        transform,
        fadeIn: l.enter === "fade" ? 0.5 : ANNOTATION_MOTION.enter,
        fadeOut: 0.4,
        enter: l.enter,
        exit: l.exit,
      };
      ids.push(clip.id);
      next = { ...next, tracks, assets: [...next.assets, asset], clips: [...next.clips, clip] };
    });
    return next;
  });
  useProject.getState().select(ids);
  return ids;
}

const thumbs = new Map<string, string>();

/** Small picture of a template's final state, over a stand-in for the lesson. */
export async function templateThumb(
  t: LessonTemplate,
  values: Record<string, string>,
): Promise<string> {
  const key = `${t.id}:${activePalette(useProject.getState().project).id}:${useProject.getState().project?.paletteFonts ? "f" : ""}:${JSON.stringify(values)}`;
  const cached = thumbs.get(key);
  if (cached) return cached;
  const W = 320;
  const H = 180;
  const canvas = document.createElement("canvas");
  canvas.width = W * OVERSAMPLE;
  canvas.height = H * OVERSAMPLE;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#3B4A5C");
  bg.addColorStop(1, "#5C6B3E");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const project = useProject.getState().project;
  const layers = templateLayers(
    t,
    values,
    activePalette(project).roles,
    project?.paletteFonts ? activePalette(project).fonts : undefined,
  );
  const rendered = await Promise.all(layers.map((l) => renderAnnotation(l.spec, H, W)));
  const flowing = layers.map((l, i) => (l.y === undefined ? i : -1)).filter((i) => i >= 0);
  const ys = stackY(
    flowing.map((i) => rendered[i].height / OVERSAMPLE / H),
    t.flowY,
  );
  for (const [i, l] of layers.entries()) {
    const r = rendered[i];
    const bmp = await createImageBitmap(new Blob([r.bytes as BlobPart], { type: "image/png" }));
    const y = (l.y ?? ys[flowing.indexOf(i)]) * canvas.height;
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.drawImage(bmp, l.x * canvas.width - r.width / 2, y - r.height / 2);
  }
  const url = canvas.toDataURL("image/png");
  thumbs.set(key, url);
  return url;
}
