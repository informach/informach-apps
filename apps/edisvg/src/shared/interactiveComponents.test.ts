import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { independentComponentsFixture } from "../../tests/componentFixture";
import { buildExport } from "../renderer/src/export.js";
import { compileInteractiveArtboard } from "./interactive";
import { hasInteractiveFeatures } from "./interactiveCapabilities";
import { PROJECT_VERSION, parseProject } from "./project";

test("independent components compile scoped identities, data, tracks and listeners without changing the authored project", () => {
  const fixture = independentComponentsFixture(),
    before = structuredClone(fixture.project);
  const compiled = compileInteractiveArtboard(fixture.project, fixture.rootId),
    children = compiled.document.components;
  assert.equal(children?.length, 2);
  assert.equal(hasInteractiveFeatures(fixture.project, fixture.rootId), true);
  assert.throws(
    () =>
      buildExport(
        { ...fixture.project, activeArtboardId: fixture.rootId },
        { format: "svg", alt: "Fixture" },
      ),
    /confirme/,
  );
  assert.deepEqual(fixture.project, before);
  const ids = new Set(compiled.document.content.map((object) => object.id));
  for (const child of children ?? []) {
    assert.equal(child.document.behavior.defaultMachineId, "machine-main");
    assert.deepEqual(child.document.behavior.data?.instances[0]?.value, { "field-name": "Ana" });
    const targets = new Set(child.document.content.map((object) => object.id));
    for (const id of targets) {
      assert.ok(!ids.has(id));
      ids.add(id);
    }
    for (const binding of child.document.behavior.bindings)
      assert.ok(targets.has(binding.targetId));
    for (const clip of child.document.playback.motion.animations)
      for (const track of clip.tracks) assert.ok(targets.has(track.targetId));
    assert.ok(child.document.playback.sources.every((source) => source.instancePath.length === 0));
  }
  assert.deepEqual(
    parseInteractiveDocument(JSON.parse(JSON.stringify(compiled.document))),
    compiled.document,
  );
  const bad = structuredClone(compiled.document),
    first = bad.components?.[0];
  if (!first) throw new Error("Missing component");
  first.instancePath = ["node-missing"];
  assert.throws(() => parseInteractiveDocument(bad), /caminho/);
  first.instancePath = [...(children?.[0]?.instancePath ?? [])];
  first.document.content[0] = {
    ...first.document.content[0],
    id: first.rootId,
    name: "duplicate",
    tag: "rect",
  };
  assert.throws(() => parseInteractiveDocument(bad), /dois escopos/);
});

test("instance input overrides are local, update two-way data and survive migration/roundtrip while invalid references fail", () => {
  const fixture = independentComponentsFixture(),
    root = fixture.project.artboards.find((board) => board.id === fixture.rootId),
    node = root?.scene.nodes[0];
  if (!node?.instance) throw new Error("Missing instance");
  node.instance.inputOverrides = [{ inputId: "input-name", value: "Local" }];
  node.instance.machineId = "machine-main";
  const restored = parseProject(JSON.parse(JSON.stringify(fixture.project))),
    compiled = compileInteractiveArtboard(restored, fixture.rootId);
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.deepEqual(
    compiled.document.components?.map((child) => child.document.behavior.data?.instances[0]?.value),
    [{ "field-name": "Local" }, { "field-name": "Ana" }],
  );
  assert.equal(
    fixture.project.artboards.find((board) => board.id === fixture.masterId)?.behavior?.inputs[1]
      ?.kind,
    "string",
  );
  node.instance.inputOverrides = [{ inputId: "input-name", value: 123 }];
  assert.throws(() => parseProject(fixture.project), /Input|input|Valor|valor|texto|string/);
  node.instance.inputOverrides = [];
  node.instance.machineId = "machine-missing";
  assert.throws(() => parseProject(fixture.project), /Máquina/);
  const legacy = independentComponentsFixture().project;
  const { assets: _assets, ...legacyFields } = legacy;
  assert.equal(parseProject({ ...legacyFields, version: 11 }).version, PROJECT_VERSION);
});
