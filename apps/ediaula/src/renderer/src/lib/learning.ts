import { draftLearning, type Learning, proposalLearning } from "@shared/learning";
import { cleanupChoices } from "@/lib/cleanupPlan";
import { useProject } from "@/state/project";
import { onReviewResolved } from "./review";

/**
 * "Aprender com a aula anterior" in the editor: each proposal and draft the person resolves in a
 * lesson of a course is written to the course's aprendizado.json (main/learning.ts), and the
 * course template offered to the next lesson comes adjusted by it (lib/courseTemplate.ts).
 */

const known = new Map<string, Promise<Learning>>();

/** What the person decided in the course so far (read once per session, then kept fresh). */
export function courseLearning(course: string): Promise<Learning> {
  let p = known.get(course);
  if (!p) {
    p = window.api.getLearning(course);
    p.catch(() => known.delete(course));
    known.set(course, p);
  }
  return p;
}

export function listenLearning(): () => void {
  return onReviewResolved((r) => {
    const project = useProject.getState().project;
    const course = project?.course?.trim();
    if (!project || !course) return;
    const now = Date.now();
    const applied = r.outcome === "applied";
    const events = r.proposalItems
      ? proposalLearning(
          r.proposalItems,
          applied,
          cleanupChoices(project.cleanup).keepPause,
          now,
          project.id,
        )
      : r.draftItems
        ? draftLearning(r.draftItems, applied, now, project.id)
        : [];
    if (!events.length) return;
    known.delete(course);
    window.api.recordLearning(course, events).catch((err: unknown) => {
      // The lesson goes on; only this decision is not remembered for the next one.
      console.error("[ediaula] learning_not_recorded", err instanceof Error ? err.message : err);
    });
  });
}
