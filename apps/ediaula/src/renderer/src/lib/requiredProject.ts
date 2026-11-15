import type { Project } from "@shared/types";

/** Panels that edit a lesson require the project that owns their state. */
export function requireOpenProject(project: Project | null): Project {
  if (!project) throw new Error("Abra uma aula para continuar.");
  return project;
}
