import assert from "node:assert/strict";
import { test } from "node:test";
import { documentAudioAssets, INTERACTIVE_VERSION } from "@informach/edi-motion/runtime";
import { audioProjectFixture } from "../../tests/audioFixture";
import { inspectAudio, inspectAudioValue } from "./audioInspection";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { requiresInteractiveExport } from "./interactiveCapabilities";
import { parseProject } from "./project";

test("audio event bindings persist, compile a shared catalog and reject resource/event deletion atomically", () => {
  const fixture = audioProjectFixture(),
    project = parseProject(fixture.project),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: "animation-tone",
    });
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.equal(documentAudioAssets(compiled.document).length, 1);
  assert.equal(compiled.document.audioAssets, undefined);
  assert.equal(compiled.document.audio?.bindings[0]?.caption, "Tom de confirmação");
  assert.equal(requiresInteractiveExport(project), true);
  assert.deepEqual(inspectAudio(project.artboards[0]?.audio, { offset: 0, limit: 1 }).items, [
    {
      id: "audio-tone",
      eventId: "event-tone",
      assetId: fixture.asset.id,
      captionLength: 18,
    },
  ]);
  assert.equal(
    JSON.parse(inspectAudioValue(project.artboards[0]?.audio, { id: "audio-tone" }).value).caption,
    "Tom de confirmação",
  );
  const before = JSON.stringify(project),
    sessionId = crypto.randomUUID(),
    context = { project, sessionId, revision: 0 },
    request = { projectId: project.id, sessionId, revision: 0 };
  assert.throws(
    () =>
      executeDocumentTransaction(context, {
        ...request,
        commands: [{ type: "asset", operation: "remove", assetId: fixture.asset.id }],
      }),
    /vínculos de áudio/,
  );
  const board = project.artboards[0];
  assert.ok(board?.behavior);
  assert.throws(
    () =>
      executeDocumentTransaction(context, {
        ...request,
        commands: [
          { type: "behavior", operation: "replace", value: { ...board.behavior, events: [] } },
        ],
      }),
    /evento ausente/,
  );
  assert.equal(JSON.stringify(project), before);
  const removed = executeDocumentTransaction(context, {
    ...request,
    commands: [
      { type: "audio", operation: "disable" },
      { type: "asset", operation: "remove", assetId: fixture.asset.id },
    ],
  }).project;
  assert.equal(removed.assets.length, 0);
  assert.equal(removed.artboards[0]?.audio, undefined);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});
