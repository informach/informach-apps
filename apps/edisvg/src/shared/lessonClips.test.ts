import assert from "node:assert/strict";
import { test } from "node:test";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";

const animation = (id: string) => ({
  type: "motion",
  command: {
    type: "create-animation",
    animation: { id, name: id, fps: 30, frames: 300, mode: "once", tracks: [] },
  },
});
const stretch = (clipId: string, kind = "screen-demo", phrases = ["Tá vendo?"]) => ({
  clipId,
  kind,
  lessonId: "pgte1jhfsnary",
  section: 5,
  start: 489.717,
  end: 601.167,
  phrases,
});

test("the lesson stretch of an animation lives on its artboard, round-trips in v26, and no export draws it", () => {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
    };
  run([animation("animation-cena"), animation("animation-demo")]);
  run([{ type: "lesson-clip", value: stretch("animation-cena", "game-scene") }]);
  run([{ type: "lesson-clip", value: stretch("animation-demo") }]);
  // Again for the same animation: replaced, not added.
  run([{ type: "lesson-clip", value: stretch("animation-demo", "screen-demo", ["Funcionou?"]) }]);
  const board = () => project.artboards[0];
  assert.deepEqual(
    board()?.lessonClips?.map((clip) => [clip.clipId, clip.kind, clip.phrases]),
    [
      ["animation-cena", "game-scene", ["Tá vendo?"]],
      ["animation-demo", "screen-demo", ["Funcionou?"]],
    ],
  );
  const saved = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(saved.artboards[0]?.lessonClips, board()?.lessonClips);
  assert.throws(
    () => parseProject({ ...project, version: 25 }),
    /Trechos da aula requerem projeto v26/,
  );
  // A file saved before v26 (no stretches) still opens.
  assert.equal(parseProject({ ...newProject(), version: 25 }).artboards.length, 1);
  assert.doesNotMatch(JSON.stringify(compileArtboard(project, board()?.id ?? "")), /pgte1jhfsnary/);

  // An animation that does not exist, or a stretch that ends before it starts, is refused.
  assert.throws(
    () => run([{ type: "lesson-clip", value: stretch("animation-nenhuma") }]),
    /Animação não encontrada/,
  );
  assert.throws(() =>
    run([{ type: "lesson-clip", value: { ...stretch("animation-cena"), start: 10, end: 5 } }]),
  );

  // A copy of the artboard is not those stretches; a deleted animation takes its stretch away.
  run([
    {
      type: "artboard",
      operation: "duplicate",
      id: board()?.id,
      newId: "artboard-copia",
      name: "Cópia",
    },
  ]);
  assert.equal(project.artboards.find((b) => b.id === "artboard-copia")?.lessonClips, undefined);
  run([{ type: "motion", command: { type: "delete-animation", animationId: "animation-demo" } }]);
  assert.deepEqual(
    board()?.lessonClips?.map((clip) => clip.clipId),
    ["animation-cena"],
  );
  run([{ type: "motion", command: { type: "delete-animation", animationId: "animation-cena" } }]);
  assert.equal(board()?.lessonClips, undefined);
});
