import { ANNOTATION_PRESETS } from "@shared/annotation";
import { clipLayout } from "@shared/compose";
import {
  type CourseTemplate,
  courseTemplateFrom,
  directionRules,
  presenterClips,
  templateLook,
} from "@shared/courseTemplate";
import {
  type AvoidBox,
  capPerMinute,
  type DirectionAnnotation,
  screenDirections,
} from "@shared/screenDirections";
import { clipEnd, sourceEnd, timelineAt } from "@shared/timeline";
import type { Project } from "@shared/types";
import { DEFAULT_AUTO_ZOOM } from "@shared/zoom";
import { create } from "zustand";
import { setCaptions } from "@/editor/CaptionSettings";
import { loadCursorData } from "@/editor/CursorLayer";
import { applyAutoZoom } from "@/editor/RecordingProps";
import { useApp } from "@/state/app";
import { type Commit, shownProject, useProject } from "@/state/project";
import { addAnnotation, addCard } from "./annotations";
import { applyPalette } from "./palettes";
import { currentView } from "./script";
import { cleanError } from "./transcripts";

/**
 * The course template in the editor: saved from a finished lesson for the course's next ones
 * (userData/cursos/<curso>/modelo.json), offered when one of them opens, and applied as drafts
 * the person reviews (shared/courseTemplate.ts).
 */

/** Each course's template, read once per session (null: the course has none). */
const known = new Map<string, Promise<CourseTemplate | null>>();

export function courseTemplate(course: string | undefined): Promise<CourseTemplate | null> {
  if (!course?.trim()) return Promise.resolve(null);
  let p = known.get(course);
  if (!p) {
    p = window.api.getCourseTemplate(course);
    p.catch(() => known.delete(course));
    known.set(course, p);
  }
  return p;
}

/** Where the recording pointed: clicks of the screen recordings, timeline seconds and frame fractions. */
async function clickTargets(p: Project): Promise<{ t: number; x: number; y: number }[]> {
  const out: { t: number; x: number; y: number }[] = [];
  for (const a of p.assets) {
    if (!a.cursor || a.cursorMissing) continue;
    const clips = p.clips.filter((c) => c.assetId === a.id && !c.annotation);
    if (!clips.length) continue;
    const data = await loadCursorData(a.cursor);
    for (const c of clips) {
      const lay = clipLayout(c, a, p.settings);
      for (const [t, x, y] of data.clicks) {
        if (t < c.in || t >= sourceEnd(c)) continue;
        out.push({
          t: timelineAt(c, t),
          x: (lay.full.x + (x / data.width) * lay.full.w) / p.settings.width,
          y: (lay.full.y + (y / data.height) * lay.full.h) / p.settings.height,
        });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Where the presenter stands while it is on screen: annotations keep out of it. */
function presenterBoxes(p: Project): AvoidBox[] {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  return presenterClips(p).flatMap((c) => {
    const a = assets.get(c.assetId);
    if (!a) return [];
    const v = clipLayout(c, a, p.settings).visible;
    return [
      {
        start: c.start,
        end: clipEnd(c),
        x0: v.x / p.settings.width,
        y0: v.y / p.settings.height,
        x1: (v.x + v.w) / p.settings.width,
        y1: (v.y + v.h) / p.settings.height,
      },
    ];
  });
}

/** The "Na tela" directions of the lesson's section as annotations, placed (screenDirections). */
export async function directionAnnotations(
  p: Project,
  template: CourseTemplate | null,
): Promise<{ list: DirectionAnnotation[]; problem?: string }> {
  const view = await currentView(p);
  if (!view) return { list: [], problem: "A aula não tem roteiro colado." };
  if (!view.words.length)
    return { list: [], problem: "Transcreva a aula para saber quando cada fala começa." };
  if (!view.confirmed)
    return {
      list: [],
      problem: `Confirme na aba Roteiro que esta gravação é da seção ${view.section.number}.`,
    };
  const list = screenDirections(view.section, view.alignment, {
    words: view.words,
    targets: await clickTargets(p),
    rules: directionRules(template),
    avoid: presenterBoxes(p),
  });
  return { list: capPerMinute(list, template?.annotations?.maxPerMinute ?? 0) };
}

/** Adds the direction annotations through `commit` (a draft); returns how many. */
export async function addDirectionAnnotations(
  list: readonly DirectionAnnotation[],
  template: CourseTemplate | null,
  commit: Commit,
): Promise<number> {
  let n = 0;
  for (const d of list) {
    const preset = template?.annotations?.presets.find((s) => s.kind === d.kind);
    const id = await addAnnotation(
      d.kind,
      {
        ...(preset?.color ? { color: preset.color } : {}),
        ...(preset?.fill ? { fill: preset.fill } : {}),
        ...(preset?.fontFamily ? { fontFamily: preset.fontFamily } : {}),
        ...(preset?.fontSize ? { fontSize: preset.fontSize } : {}),
        ...d.style,
        ...(d.kind === "highlight" ? { boxWidth: 260, boxHeight: 150 } : {}),
        text: d.text ?? ANNOTATION_PRESETS.find((x) => x.kind === d.kind)?.spec.text ?? "",
      },
      { at: d.at, duration: d.duration, x: d.x, y: d.y },
      commit,
    );
    if (id) n++;
  }
  return n;
}

/** Parts of a template applied at once ("Preparar aula" applies them one step at a time). */
export type TemplatePart = "look" | "zoom" | "annotations" | "captions" | "cards";

/** Applies parts of the template through `commit` (a draft); returns what each part did. */
export async function applyTemplateParts(
  template: CourseTemplate,
  parts: readonly TemplatePart[],
  commit: Commit,
): Promise<string[]> {
  const done: string[] = [];
  const p = shownProject();
  if (!p) return done;
  if (parts.includes("look")) {
    if (
      template.palette &&
      (template.palette !== p.palette || !!template.fonts !== !!p.paletteFonts)
    ) {
      await applyPalette(
        template.palette,
        { recolor: true, fonts: template.fonts ?? false },
        commit,
      );
      done.push("paleta do curso");
    }
    commit((q) => templateLook(q, template));
    done.push("posição do apresentador, cursor, música e escolhas da limpeza");
  }
  if (parts.includes("zoom") && template.zoom?.auto !== false) {
    const scale =
      template.rules?.find((r) => r.when.event === "click")?.do.zoom?.scale ??
      template.zoom?.scale ??
      DEFAULT_AUTO_ZOOM.scale;
    let n = 0;
    const now = shownProject() ?? p;
    for (const c of now.clips) {
      const a = now.assets.find((x) => x.id === c.assetId);
      if (a?.cursor && !a.cursorMissing && !c.annotation)
        n += await applyAutoZoom(c, a, scale, commit);
    }
    done.push(n === 1 ? "1 zoom nos cliques" : `${n} zooms nos cliques`);
  }
  if (parts.includes("captions") && template.captions) {
    setCaptions({ ...template.captions }, commit);
    done.push("legenda do curso");
  }
  if (parts.includes("annotations")) {
    const { list } = await directionAnnotations(shownProject() ?? p, template);
    const n = await addDirectionAnnotations(list, template, commit);
    if (n) done.push(n === 1 ? "1 anotação do Na tela" : `${n} anotações do Na tela`);
  }
  if (parts.includes("cards") && template.cards) {
    const now = shownProject() ?? p;
    const cards = now.clips.filter((c) => c.annotation?.kind === "card");
    const end = now.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
    if (template.cards.opening && !cards.some((c) => c.start <= 0.1)) {
      await addCard("start", {}, commit);
      done.push("cartela de abertura");
    }
    if (template.cards.closing && !cards.some((c) => Math.abs(clipEnd(c) - end) < 0.2)) {
      await addCard(
        "end",
        template.cards.closingText ? { text: template.cards.closingText } : {},
        commit,
      );
      done.push("cartela de encerramento");
    }
  }
  return done;
}

/** Saves the open lesson as the template of its course (Arquivo › Salvar como modelo do curso). */
export async function saveCourseTemplateFromLesson(): Promise<void> {
  const { toast } = useApp.getState();
  const p = useProject.getState().project;
  if (!p) return;
  if (!p.course?.trim()) {
    toast("Esta aula não tem curso: o modelo é guardado por curso.", "error");
    return;
  }
  try {
    const view = await currentView(p);
    const directions =
      view?.confirmed && view.words.length
        ? screenDirections(view.section, view.alignment, { words: view.words })
        : [];
    const template = courseTemplateFrom(p, { directions });
    await window.api.saveCourseTemplate(p.course, template);
    known.set(p.course, Promise.resolve(template));
    toast(
      `Modelo do curso ${p.course} salvo. As próximas aulas do curso podem aplicá-lo como rascunho.`,
      "success",
    );
  } catch (err) {
    toast(`Não foi possível salvar o modelo do curso: ${cleanError(err)}`, "error");
  }
}

/** A course template offered to the lesson just opened ("Este curso tem um modelo salvo"). */
export const useCourseOffer = create<{
  projectId: string | null;
  template: CourseTemplate | null;
  dismissed: string[];
}>(() => ({ projectId: null, template: null, dismissed: [] }));

/**
 * When a lesson of a course with a saved template opens, or a new one gets its first clips, the
 * template is offered, unless the lesson already went through that step of "Preparar aula" or
 * the person said not now.
 */
export function watchCourseOffer(): () => void {
  let last: string | null = null;
  return useProject.subscribe((s) => {
    const p = s.project;
    const key = p ? `${p.id}:${p.clips.length > 0}` : null;
    if (!p || key === last) return;
    const sameLesson = last?.startsWith(`${p.id}:`);
    last = key;
    if (!sameLesson) useCourseOffer.setState({ projectId: null, template: null });
    if (!p.course || !p.clips.length || p.prepare?.decisions.template) return;
    if (useCourseOffer.getState().dismissed.includes(p.id)) return;
    void courseTemplate(p.course).then(
      (template) => {
        if (template && useProject.getState().project?.id === p.id)
          useCourseOffer.setState({ projectId: p.id, template });
      },
      (err: unknown) =>
        useApp.getState().toast(`O modelo salvo do curso não abriu: ${cleanError(err)}`, "error"),
    );
  });
}

export function dismissCourseOffer(): void {
  const { projectId, dismissed } = useCourseOffer.getState();
  useCourseOffer.setState({
    projectId: null,
    template: null,
    dismissed: projectId ? [...dismissed, projectId] : dismissed,
  });
}
