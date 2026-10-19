import assert from "node:assert/strict";
import type { Project } from "../src/shared/project";
/** These tests explicitly operate on the first board of their own fixture. */
export function firstScene(project: Project) {
  const board = project.artboards[0];
  assert.ok(board, "Fixture needs an artboard");
  return board.scene;
}
