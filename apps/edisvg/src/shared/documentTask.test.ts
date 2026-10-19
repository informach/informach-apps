import assert from "node:assert/strict";
import { test } from "node:test";
import { readDocumentTaskResult } from "./documentTask";
import { newProject } from "./project";

test("document worker responses validate the project and metadata, preserve source and disclose truncated errors", () => {
  const project = newProject(),
    before = structuredClone(project);
  assert.deepEqual(
    readDocumentTaskResult({ ok: true, result: { project, changed: false, revision: 0 } }).project,
    project,
  );
  assert.deepEqual(project, before);
  assert.throws(
    () =>
      readDocumentTaskResult({
        ok: true,
        result: { project: { ...project, version: 999 }, changed: true, revision: 1 },
      }),
    /incompatível/,
  );
  assert.throws(() =>
    readDocumentTaskResult({
      ok: true,
      result: { project, changed: true, revision: 1, selected: "invalid" },
    }),
  );
  assert.throws(
    () => readDocumentTaskResult({ ok: false, message: "Falha", truncated: true }),
    /abreviado/,
  );
  for (const metadata of [
    { selected: "node-missing" },
    { selectedIds: ["node-missing"] },
    { selectedArtboard: "artboard-missing" },
  ])
    assert.throws(() =>
      readDocumentTaskResult({
        ok: true,
        result: { project, changed: false, revision: 0, ...metadata },
      }),
    );
});
