import type { Artboard } from "../../shared/project";
import type { Scene } from "../../shared/sceneTypes";

interface Workspace {
  artboards: Artboard[];
  defaultArtboardId: string | null;
  activeArtboardId?: string | null;
  scene?: Scene | null;
}
/** The legacy canvas receives a view of the selected board. There is only one
 * persisted scene per board; the workspace's scene is a reference, not a copy. */
export function bindActiveArtboard(state: Workspace, id = state.activeArtboardId) {
  const board =
    state.artboards.find((board) => board.id === id) ??
    state.artboards.find((board) => board.id === state.defaultArtboardId);
  state.activeArtboardId = board?.id ?? null;
  state.scene = board?.scene ?? null;
}
export function replaceActiveScene(state: Workspace, scene: Scene) {
  const board = state.artboards.find((board) => board.id === state.activeArtboardId);
  if (board) board.scene = scene;
  else {
    const id = `artboard-${crypto.randomUUID()}`;
    state.artboards.push({ id, name: "Prancheta 1", scene });
    state.defaultArtboardId = id;
    state.activeArtboardId = id;
  }
  state.scene = scene;
}
