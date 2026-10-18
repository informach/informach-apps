import { ANNOTATION_PRESETS } from "@shared/annotation";
import { clipLayout } from "@shared/compose";
import {
  type CourseTemplate,
  courseTemplateFrom,
  directionRules,
  lessonCards,
  presenterClips,
  startPending,
  templateLook,
} from "@shared/courseTemplate";
import { type Learning, learnedDefaults } from "@shared/learning";
import type { PrepareStep } from "@shared/prepare";
import {
  type AvoidBox,
  capPerMinute,
  type DirectionAnnotation,
  type PointTarget,
  pointOnFrame,
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
import { basisOf, type Commit, draftCommit, useProject } from "@/state/project";
import { addAnnotation, addCard } from "./annotations";
import { courseLearning } from "./learning";
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

function savedTemplate(course: string): Promise<CourseTemplate | null> {
  let p = known.get(course);
  if (!p) {
    p = window.api.getCourseTemplate(course);
    p.catch(() => known.delete(course));
    known.set(course, p);
  }
  return p;
}

/**
 * The course's template as the next lesson gets it: the one saved, adjusted by what the person
 * decided in the course's lessons so far (shared/learning.ts learnedDefaults).
 */
export async function courseTemplate(course: string | undefined): Promise<CourseTemplate | null> {
  return (await learnedTemplate(course)).template;
}

/** The adjusted template and, in words, what the course's lessons changed in it. */
async function learnedTemplate(
  course: string | undefined,
): Promise<{ template: CourseTemplate | null; notes: string[] }> {
  if (!course?.trim()) return { template: null, notes: [] };
  const template = await savedTemplate(course);
  if (!template) return { template: null, notes: [] };
  let learning: Learning | null = null;
  try {
    learning = await courseLearning(course);
  } catch (err) {
    // Without what was learned, the template as it was saved.
    console.warn("[ediaula] learning_unreadable", err instanceof Error ? err.message : err);
  }
  return learnedDefaults(learning, template);
}

/** Where the recording pointed: clicks of the screen recordings, in timeline seconds. */
export async function clickTargets(p: Project): Promise<PointTarget[]> {
  const out: PointTarget[] = [];
  for (const a of p.assets) {
    if (!a.cursor || a.cursorMissing) continue;
    const clips = p.clips.filter((c) => c.assetId === a.id && !c.annotation);
    if (!clips.length) continue;
    const data = await loadCursorData(a.cursor);
    for (const c of clips) {
      for (const [t, x, y] of data.clicks) {
        if (t < c.in || t >= sourceEnd(c)) continue;
        const u = x / data.width;
        const v = y / data.height;
        const at = timelineAt(c, t);
        const [fx, fy] = pointOnFrame(c, a, p.settings, u, v, at);
        out.push({
          t: at,
          x: fx,
          y: fy,
          seenAt: (when) => pointOnFrame(c, a, p.settings, u, v, when),
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
  // A direction already annotated (by an earlier run, or by the course template) is not again.
  const done = new Set(
    p.clips.flatMap((c) => (c.annotation?.direction ? [c.annotation.direction] : [])),
  );
  const list = screenDirections(view.section, view.alignment, {
    words: view.words,
    targets: await clickTargets(p),
    rules: directionRules(template),
    avoid: presenterBoxes(p),
  }).filter((d) => !done.has(d.id));
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
        direction: d.id,
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
  // Every part is worked out on what `commit` writes on: the draft as it grows, part by part.
  const p = basisOf(commit);
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
    const now = basisOf(commit) ?? p;
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
    const { list } = await directionAnnotations(basisOf(commit) ?? p, template);
    const n = await addDirectionAnnotations(list, template, commit);
    if (n) done.push(n === 1 ? "1 anotação do Na tela" : `${n} anotações do Na tela`);
  }
  // A lesson started from the template gets its cards with its first media (lib/courseStart.ts);
  // cards already there, of either kind, are not made twice.
  if (parts.includes("cards") && template.cards && !startPending(p)) {
    const has = lessonCards(basisOf(commit) ?? p);
    if (template.cards.opening && !has.opening) {
      await addCard("start", {}, commit);
      done.push("cartela de abertura");
    }
    if (template.cards.closing && !has.closing) {
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
  /** What the earlier lessons of the course changed in the template. */
  notes?: string[];
}>(() => ({ projectId: null, template: null }));

/** The author of the draft the course template makes from its offer. */
export const TEMPLATE_AUTHOR = "modelo";

/** The steps of "Preparar aula" the template's draft covers, once it is applied. */
export const TEMPLATE_STEPS: readonly PrepareStep[] = [
  "template",
  "zoom",
  "annotations",
  "captions",
  "cards",
];

/**
 * When a lesson of a course with a saved template opens, or a new one gets its first clips, the
 * template is offered, unless the lesson already went through that step of "Preparar aula" or
 * the person already answered the offer for this course (Project.templateOffer, kept with the
 * lesson).
 */
export function watchCourseOffer(): () => void {
  let last: string | null = null;
  return useProject.subscribe((s) => {
    const p = s.project;
    const key = p ? `${p.id}:${p.course ?? ""}:${p.clips.length > 0}` : null;
    if (!p || key === last) return;
    const sameLesson = last?.startsWith(`${p.id}:`);
    last = key;
    if (!sameLesson) useCourseOffer.setState({ projectId: null, template: null });
    // A lesson started from the template (Novo projeto) already has it.
    if (!p.course || !p.clips.length || p.prepare?.decisions.template || startPending(p)) return;
    if (p.templateOffer?.course === p.course) return;
    void learnedTemplate(p.course).then(
      ({ template, notes }) => {
        const now = useProject.getState().project;
        if (template && now?.id === p.id && now.templateOffer?.course !== now.course)
          useCourseOffer.setState({ projectId: p.id, template, notes });
      },
      (err: unknown) =>
        useApp.getState().toast(`O modelo salvo do curso não abriu: ${cleanError(err)}`, "error"),
    );
  });
}

/** Keeps the answer to the offer with the lesson (outside the undo history, like the review). */
function answerOffer(answer: "applied" | "declined"): void {
  const { projectId } = useCourseOffer.getState();
  useCourseOffer.setState({ projectId: null, template: null });
  useProject
    .getState()
    .patch((q) =>
      q.id === projectId && q.course ? { ...q, templateOffer: { course: q.course, answer } } : q,
    );
}

/** "Agora não": the template is not offered again for this lesson and course. */
export const dismissCourseOffer = (): void => answerOffer("declined");

/**
 * "Aplicar como rascunho": every part of the template as one draft. Applying it in the review
 * bar marks the steps of "Preparar aula" it covered (lib/prepare.ts), so they are not done twice.
 */
export async function acceptCourseOffer(): Promise<void> {
  const { toast } = useApp.getState();
  const { projectId, template } = useCourseOffer.getState();
  const waiting = useProject.getState().draft;
  if (!template || !projectId) return;
  if (waiting && waiting.projectId === projectId) {
    toast(
      `Há um rascunho esperando revisão ("${waiting.title}"). Aplique ou descarte antes.`,
      "error",
    );
    return;
  }
  answerOffer("applied");
  try {
    const done = await applyTemplateParts(
      template,
      ["look", "zoom", "annotations", "captions", "cards"],
      draftCommit(TEMPLATE_AUTHOR, "Modelo do curso", projectId),
    );
    toast(
      done.length && useProject.getState().draft?.author === TEMPLATE_AUTHOR
        ? `Rascunho do modelo do curso pronto: ${done.join(", ")}. Revise na barra acima da timeline.`
        : "A aula já segue o modelo do curso.",
      "info",
    );
  } catch (err) {
    toast(`O modelo do curso não pôde ser aplicado: ${cleanError(err)}`, "error");
  }
}
