import { partProject, partProjectName } from "@shared/courseSplit";
import type { ScriptDoc } from "@shared/script";
import type { Project } from "@shared/types";

/**
 * "Um projeto por parte" (pedido de 09/11/2026): one project per section of the script, beside
 * the other projects, each with the lesson's script and its own part chosen, so every part is
 * recorded, edited and packed on its own. A part whose project already exists (same name and
 * course) is left as it is, so asking again only makes the ones missing.
 */
export async function projectPerPart(
  lesson: Project,
  doc: ScriptDoc,
): Promise<{ made: string[]; existing: string[] }> {
  const recent = await window.api.recentProjects();
  const taken = new Set(
    recent
      .filter((r) => (r.course ?? "") === (lesson.course ?? ""))
      .map((r) => r.name.trim().toLowerCase()),
  );
  const made: string[] = [];
  const existing: string[] = [];
  for (let section = 0; section < doc.sections.length; section++) {
    const name = partProjectName(lesson.name, doc, section);
    if (taken.has(name.toLowerCase())) {
      existing.push(name);
      continue;
    }
    const created = await window.api.createProject(name, lesson.course, lesson.settings);
    const project = partProject(created.project, lesson, doc, section);
    await window.api.saveProject(created.path, JSON.stringify(project));
    made.push(name);
  }
  return { made, existing };
}
