import assert from "node:assert/strict";
import { test } from "node:test";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";

test("guides belong to the artboard, round-trip in v25 and never reach an export", () => {
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
  const guides = [
    { id: "guide-left", axis: "x", position: 120 },
    { id: "guide-top", axis: "y", position: 64.5 },
  ];
  run([{ type: "guides", guides }]);
  assert.deepEqual(project.artboards[0]?.guides, guides);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))).artboards[0]?.guides, guides);
  assert.throws(() => parseProject({ ...project, version: 24 }), /Guias requerem projeto v25/);
  assert.throws(
    () => run([{ type: "guides", guides: [guides[0], { ...guides[1], id: "guide-left" }] }]),
    /identificador repetido/,
  );
  const compiled = compileArtboard(project, project.artboards[0]?.id ?? "");
  assert.doesNotMatch(JSON.stringify(compiled), /guide-left/);
  run([{ type: "guides", guides: [] }]);
  assert.equal(project.artboards[0]?.guides, undefined);
});
