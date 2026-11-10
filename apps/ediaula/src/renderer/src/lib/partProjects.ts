import { partProjectFields, partProjectName } from "@shared/lessonParts";
import type { ScriptDoc } from "@shared/script";
import type { Project } from "@shared/types";

/**
 * "Um projeto por parte" (pedido de 09/11/2026): one project per section of the script, beside
 * the other projects, each with the lesson's script and its own part chosen, so every part is
 * recorded, edited and packed on its own. A part whose project file is already in the projects
 * folder is left as it is, so asking again only makes the ones missing. When one fails, `failed`
 * says why, and the parts made before it stay made.
 */
export async function projectPerPart(
  lesson: Project,
  doc: ScriptDoc,
): Promise<{ made: string[]; existing: string[]; failed?: string }> {
  const made: string[] = [];
  const existing: string[] = [];
  for (let section = 0; section < doc.sections.length; section++) {
    const name = partProjectName(lesson.name, doc, section);
    try {
      const r = await window.api.createPartProject(
        name,
        lesson.course,
        lesson.settings,
        partProjectFields(lesson, doc, section),
      );
      ("existing" in r ? existing : made).push(name);
    } catch (err) {
      return { made, existing, failed: err instanceof Error ? err.message : String(err) };
    }
  }
  return { made, existing };
}
