import assert from "node:assert/strict";
import { test } from "node:test";
import { newProject } from "../../shared/project.js";
import { editScene } from "../../shared/scene.js";
import { bindLayerRenaming, sceneInspector, sceneSidebar } from "./sceneEditor.js";

for (const action of ["Enter", "Escape", "blur", "empty"])
  test(`inline rename handles ${action} without duplicate commits`, (t) => {
    const original = globalThis.document;
    t.after(() => {
      globalThis.document = original;
    });
    const project = newProject(),
      id = editScene(project.artboards[0].scene, null, "add", "circle");
    const state = { ...project, scene: project.artboards[0].scene, selected: id, renaming: id };
    const before = state.scene.nodes[0].name;
    let commits = 0,
      selected = false;
    const input = {
      dataset: { layerRename: id },
      value: action === "empty" ? "  " : "New name",
      focus() {},
      select() {
        selected = true;
      },
    };
    globalThis.document = {
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return input;
      },
    };
    bindLayerRenaming(state, {
      render() {},
      commit() {
        commits++;
      },
      notify(message) {
        assert.fail(message);
      },
    });
    assert.equal(selected, true);
    if (action === "blur" || action === "empty") input.onblur();
    else input.onkeydown({ key: action, preventDefault() {}, stopPropagation() {} });
    input.onblur();
    const saved = action === "Enter" || action === "blur";
    assert.equal(state.scene.nodes[0].name, saved ? "New name" : before);
    assert.equal(commits, saved ? 1 : 0);
    assert.equal(state.renaming, null);
  });

test("name click opens inline editing and inspector has no duplicate name field", (t) => {
  const original = globalThis.document;
  t.after(() => {
    globalThis.document = original;
  });
  const project = newProject(),
    state = { ...project, scene: project.artboards[0].scene },
    id = editScene(state.scene, null, "add", "circle");
  let renders = 0;
  const label = {
    dataset: { layerName: id },
    querySelector() {
      return null;
    },
  };
  globalThis.document = {
    querySelectorAll(selector) {
      return selector === "[data-layer-name]" ? [label] : [];
    },
    querySelector() {
      return null;
    },
  };
  bindLayerRenaming(state, {
    render() {
      renders++;
    },
    commit() {
      assert.fail("No edit yet");
    },
    notify(message) {
      assert.fail(message);
    },
  });
  label.onclick({ stopPropagation() {} });
  assert.equal(state.selected, id);
  assert.equal(state.renaming, id);
  assert.equal(renders, 1);
  assert.match(sceneSidebar(state), /data-layer-rename=/);
  assert.doesNotMatch(sceneInspector(state), /class="scene-name"/);
});
