import type { TimelineWord } from "./cleanup.ts";
import type { GlossaryTerm } from "./glossary.ts";
import { piece } from "./pieces.ts";
import { type ScriptDoc, sectionLabel } from "./script.ts";
import { alignSection } from "./scriptAlign.ts";
import { clipEnd, newId, projectDuration } from "./timeline.ts";
import type { Project } from "./types.ts";

/**
 * "Lote por curso": a long recording of several sections of the script split into one lesson per
 * section. The split is a proposal of stretches the person reviews; "Produzir todas" makes one
 * project per stretch with the same media, each with its section confirmed.
 */

export interface SectionRange {
  /** Index into doc.sections. */
  section: number;
  label: string;
  /** Timeline seconds of the recording. */
  start: number;
  end: number;
  /** Share of the section's words found in the stretch. */
  coverage: number;
}

/** A section counts when at least this share of its words was found. */
export const SPLIT_COVERAGE = 0.3;
/** A line is found with this share of its words. */
const LINE_FOUND = 0.5;

/**
 * The stretch of the recording each section of `doc` is in, in recording order: a section is
 * where its lines were found, and the border between two sections is the middle of the pause
 * between the last line of one and the first of the next (or right before the next one, when they
 * overlap). The first stretch starts at 0:00 and the last one ends at `duration`, so nothing of
 * the recording is left out. Sections with less than SPLIT_COVERAGE of their words are not there.
 */
export function splitBySections(
  doc: ScriptDoc,
  words: readonly TimelineWord[],
  opts: { glossary?: readonly GlossaryTerm[]; duration?: number } = {},
): SectionRange[] {
  const said = [...words];
  const found: { section: number; first: number; last: number; coverage: number }[] = [];
  doc.sections.forEach((section, i) => {
    const a = alignSection(section, said, { glossary: opts.glossary ?? [] });
    const lines = a.lines.filter(
      (l) =>
        l.start !== undefined &&
        l.end !== undefined &&
        l.matched / Math.max(1, l.total) >= LINE_FOUND,
    );
    if (!lines.length || a.coverage < SPLIT_COVERAGE) return;
    found.push({
      section: i,
      first: Math.min(...lines.map((l) => l.start ?? 0)),
      last: Math.max(...lines.map((l) => l.end ?? 0)),
      coverage: a.coverage,
    });
  });
  found.sort((a, b) => a.first - b.first || b.coverage - a.coverage);
  // A section found inside the stretch of another (common words, not the section) is dropped.
  const kept: typeof found = [];
  for (const f of found) {
    const prev = kept[kept.length - 1];
    if (prev && f.last <= prev.last && f.coverage <= prev.coverage) continue;
    kept.push(f);
  }
  const end = Math.max(
    opts.duration ?? 0,
    said.length ? Math.max(...said.map((w) => w.end)) : 0,
    kept.length ? kept[kept.length - 1].last : 0,
  );
  return kept.map((f, i) => {
    const next = kept[i + 1];
    const prev = kept[i - 1];
    const border = (a: typeof f, b: typeof f): number =>
      a.last <= b.first ? (a.last + b.first) / 2 : Math.max(a.first, b.first - 0.25);
    return {
      section: f.section,
      label: sectionLabel(doc.sections[f.section]),
      start: prev ? border(prev, f) : 0,
      end: next ? border(f, next) : end,
      coverage: f.coverage,
    };
  });
}

/**
 * The stretch [from, to) of a lesson as a lesson of its own: the clips inside it, cut at its
 * borders and moved to start at 0:00. What belongs to the whole lesson's timeline (proposals,
 * the HeyGen voice maps, chapters, the reviewed seams, the preparation, translations) is left out.
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
 * One lesson of a split: the stretch of the recording, named after its section, with its own id,
 * the section confirmed and the section's video id kept for the platform.
 */
export function sectionProject(
  project: Project,
  doc: ScriptDoc,
  range: SectionRange,
  name: string,
  now = Date.now(),
): Project {
  const part = rangeProject(project, range.start, range.end);
  const section = doc.sections[range.section];
  const { publish: _publish, ...rest } = part;
  return {
    ...rest,
    id: newId("p"),
    name,
    createdAt: now,
    updatedAt: now,
    ...(project.script
      ? { script: { text: project.script.text, section: range.section, confirmed: true } }
      : {}),
    ...(section?.videoId || section?.videoTitle
      ? {
          publish: {
            ...(section.videoId ? { videoId: section.videoId } : {}),
            ...(section.videoTitle ? { title: section.videoTitle } : {}),
          },
        }
      : {}),
  };
}
