import { piece } from "./pieces.ts";
import type { ScriptDoc } from "./script.ts";
import { clipEnd, projectDuration } from "./timeline.ts";
import type { Project } from "./types.ts";

/**
 * Parts of a lesson: a stretch of the timeline as a lesson of its own (export_video with `range`
 * or with several parts), and the project of one part of the script ("Um projeto por parte").
 */

/**
 * The stretch [from, to) of a lesson as a lesson of its own: the clips inside it, cut at its
 * borders and moved to start at 0:00. What belongs to the whole lesson's timeline (proposals,
 * the exported voice maps, chapters, the reviewed seams, the preparation, translations) is left out.
 */
export function rangeProject(project: Project, from: number, to: number): Project {
  const start = Math.max(0, from);
  const end = Math.min(to, projectDuration(project));
  const clips = project.clips.flatMap((c) => {
    const a = Math.max(c.start, start);
    const b = Math.min(clipEnd(c), end);
    if (b - a < 1e-3) return [];
    const part = a > c.start + 1e-6 || b < clipEnd(c) - 1e-6 ? piece(c, a, b) : c;
    // The clip keeps its own id when it is whole; a piece of it is another clip.
    return [{ ...part, start: part.start - start }];
  });
  const used = new Set(clips.map((c) => c.assetId));
  const {
    proposals: _p,
    voiceMasters: _v,
    reviewedSeams: _r,
    prepare: _prep,
    captionTranslations: _t,
    exportedAt: _e,
    stats: _s,
    publish,
    ...rest
  } = project;
  // Chapters and the thumbnail are times of the whole lesson.
  const { chapters: _c, thumbnail: _th, ...texts } = publish ?? {};
  return {
    ...rest,
    assets: project.assets.filter((a) => used.has(a.id) || !a.generated),
    clips,
    ...(Object.keys(texts).length ? { publish: texts } : {}),
  };
}

/**
 * The script with `section` chosen and confirmed, and the section's video id and title for the
 * platform: what the project of a part recorded on its own carries.
 */
function sectionFields(
  lesson: Pick<Project, "script">,
  doc: ScriptDoc,
  section: number,
): Pick<Project, "script" | "publish"> {
  const s = doc.sections[section];
  return {
    ...(lesson.script ? { script: { text: lesson.script.text, section, confirmed: true } } : {}),
    ...(s?.videoId || s?.videoTitle
      ? {
          publish: {
            ...(s.videoId ? { videoId: s.videoId } : {}),
            ...(s.videoTitle ? { title: s.videoTitle } : {}),
          },
        }
      : {}),
  };
}

/**
 * "Um projeto por parte": the lesson recorded part by part, each part in a project of its own
 * (and packed on its own), instead of every part on one timeline. The name of part `section`'s
 * project: the lesson's name and the part, as the script heading numbers and names it.
 */
export function partProjectName(lesson: string, doc: ScriptDoc, section: number): string {
  const s = doc.sections[section];
  const number = s?.number ?? String(section + 1);
  const title = (s?.videoTitle || s?.title || "").trim();
  return `${lesson.trim()} · Parte ${number}${title ? `. ${title}` : ""}`;
}

/**
 * What part `section`'s project is made with: the whole script of the lesson with that section
 * chosen and confirmed (the recorder takes its lines and "Na tela" from it), the section's video
 * id and title, and `partOf`, which marks it as a part (its script panel does not offer to make
 * parts again). Nothing of the lesson's timeline comes along: each part is recorded on its own.
 */
export function partProjectFields(
  lesson: Pick<Project, "id" | "script">,
  doc: ScriptDoc,
  section: number,
): Pick<Project, "script" | "publish" | "partOf"> {
  return { ...sectionFields(lesson, doc, section), partOf: { lesson: lesson.id, section } };
}
