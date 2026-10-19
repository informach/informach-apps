import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION } from "@informach/edi-motion/runtime";
import { imageFixture } from "../../tests/assetFixtures";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { flattenScene } from "./scene.js";

test("image authoring rejects vector no-op paint, supports hierarchy/typed slicing and migrates v15 without dropping resources", () => {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    asset = imageFixture(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
      return result;
    };
  run([{ type: "asset", operation: "put", value: asset }]);
  const image = run([{ type: "asset", operation: "insert-image", assetId: asset.id }]).selected;
  assert.ok(image);
  const original = JSON.stringify(project);
  assert.throws(
    () => run([{ type: "scene", operation: "attrs", targetId: image, value: { fill: "red" } }]),
    /Imagem não aceita/,
  );
  assert.equal(JSON.stringify(project), original);
  run([
    {
      type: "appearance",
      operation: "save-style",
      style: { id: "style-test", name: "Cor", attrs: { fill: "blue" } },
    },
  ]);
  assert.throws(
    () =>
      run([
        { type: "appearance", operation: "apply-style", styleId: "style-test", targetIds: [image] },
      ]),
    /Imagem não aceita/,
  );
  const group = run([
    { type: "composition", operation: "group", targetIds: [image], name: "Grupo" },
  ]).selected;
  assert.ok(group);
  run([
    {
      type: "scene",
      operation: "attrs",
      targetId: group,
      value: { fill: "red", visibility: "hidden" },
    },
  ]);
  run([{ type: "composition", operation: "reparent", targetId: image, parentId: null, index: 1 }]);
  const node = flattenScene(project.artboards[0]?.scene).find(
    ({ node }) => node.id === image,
  )?.node;
  assert.ok(node);
  assert.equal(node.attrs.visibility, "hidden");
  assert.equal(node.attrs.fill, undefined);
  assert.equal(parseProject({ ...project, version: 15 }).version, PROJECT_VERSION);
  run([
    {
      type: "scene",
      operation: "image-slice",
      targetId: image,
      value: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  ]);
  assert.throws(() => parseProject({ ...project, version: 15 }), /v16/);
  assert.throws(
    () =>
      run([
        {
          type: "scene",
          operation: "image-slice",
          targetId: image,
          value: { top: 1, right: 0, bottom: 0, left: 0 },
        },
      ]),
    /centro/,
  );
  const compiled = compileInteractiveArtboard(project, project.defaultArtboardId ?? "");
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.match(compiled.svg, /data-edi-slice="1"/);
  assert.equal(compiled.svg.match(/<use /g)?.length, 9);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});
