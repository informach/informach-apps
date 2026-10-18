import { rigOwners } from "@informach/edi-motion/rig";
import type { Project } from "./project";
import { flattenScene } from "./scene.js";

/** Capabilities belong to the whole reachable composition, not just its root. */
function inspectComposition(
  project: Pick<Project, "artboards" | "defaultArtboardId">,
  artboardId?: string | null,
  includeRig = true,
): boolean {
  const boards = new Map(project.artboards.map((board) => [board.id, board])),
    visited = new Set<string>();
  function visit(id: string): boolean {
    if (visited.has(id)) return false;
    visited.add(id);
    const board = boards.get(id);
    if (!board) throw new Error("Prancheta de capacidade interativa ausente.");
    const behavior = board.behavior;
    if (
      board.layout ||
      board.audio?.bindings.length ||
      flattenScene(board.scene).some(({ node }) => node.effects !== undefined) ||
      (includeRig &&
        (rigOwners(board.rig).size ||
          flattenScene(board.scene).some(({ node }) => node.semantics !== undefined))) ||
      (behavior &&
        (behavior.inputs.length ||
          behavior.machines.length ||
          behavior.bindings.length ||
          behavior.listeners.length ||
          behavior.events.length ||
          behavior.data?.models.length ||
          behavior.data?.instances.length ||
          behavior.data?.links.length))
    )
      return true;
    return flattenScene(board.scene).some(
      ({ node }) => node.instance && visit(node.instance.artboardId),
    );
  }
  const id = artboardId ?? project.defaultArtboardId;
  return id ? visit(id) : false;
}
export function hasInteractiveFeatures(
  project: Pick<Project, "artboards" | "defaultArtboardId">,
  artboardId?: string | null,
) {
  return inspectComposition(project, artboardId, true);
}
export function requiresInteractiveExport(
  project: Pick<Project, "artboards" | "defaultArtboardId">,
  artboardId?: string | null,
) {
  return inspectComposition(project, artboardId, false);
}
