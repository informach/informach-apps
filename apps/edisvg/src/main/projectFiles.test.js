import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { atomicWrite, createProjectFiles } from "./projectFiles.js";

const project = {
  version: 1,
  name: "Zezé",
  animation: "Acenar",
  transforms: { x: 0 },
  keys: [0, 72],
};
function fixture() {
  const disk = new Map(),
    state = {
      save: "a.edisvg",
      open: "b.edisvg",
      choice: "cancel",
      fail: false,
      choices: 0,
      discarded: false,
    };
  const files = createProjectFiles({
    onDiscard: async () => {
      state.discarded = true;
    },
    chooseSave: async () => {
      state.choices++;
      return state.save;
    },
    chooseOpen: async () => state.open,
    confirm: async () => state.choice,
    read: async (p) => disk.get(p),
    write: async (p, text) => {
      if (state.fail) throw new Error("Disk full");
      disk.set(p, text);
    },
  });
  files.changed(project);
  return { files, state, disk };
}
test("save uses current file; Save As changes path only on success", async () => {
  const { files, state, disk } = fixture();
  await files.save();
  assert.equal(files.status().dirty, false);
  files.changed({ ...project, name: "Outro" });
  await files.save();
  assert.equal(state.choices, 1);
  assert.equal(JSON.parse(disk.get("a.edisvg")).name, "Outro");
  state.save = null;
  assert.equal((await files.save(true)).saved, false);
  assert.equal(files.status().path, "a.edisvg");
  state.save = "c.edisvg";
  state.fail = true;
  await assert.rejects(files.save(true));
  assert.equal(files.status().path, "a.edisvg");
});
test("cancel open and cancel save during close preserve document", async () => {
  const { files, state, disk } = fixture();
  disk.set("b.edisvg", JSON.stringify({ ...project, name: "B" }));
  assert.equal(await files.open(), null);
  assert.equal(files.status().path, null);
  state.choice = "save";
  state.save = null;
  assert.equal(await files.canClose(), false);
  assert.equal(files.status().dirty, true);
  assert.equal(state.discarded, false);
  state.choice = "discard";
  const opened = await files.open();
  assert.equal(opened.project.name, "B");
  assert.equal(files.status().dirty, false);
  assert.equal(state.discarded, true);
});
test("a failed save retains original file and dirty state", async () => {
  const { files, state, disk } = fixture();
  await files.save();
  const previous = disk.get("a.edisvg");
  files.changed({ ...project, name: "Modified" });
  state.fail = true;
  await assert.rejects(files.save());
  assert.equal(disk.get("a.edisvg"), previous);
  assert.equal(files.status().dirty, true);
  state.choice = "save";
  await assert.rejects(files.canClose());
  assert.equal(files.status().dirty, true);
});
test("atomic write replaces contents and cleans the temporary file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "edisvg-files-"));
  try {
    const path = join(dir, "project.edisvg");
    await writeFile(path, "old");
    await atomicWrite(path, "new");
    assert.equal(await readFile(path, "utf8"), "new");
    assert.deepEqual(await readdir(dir), ["project.edisvg"]);
  } finally {
    await unlink(join(dir, "project.edisvg")).catch(() => {});
    await rmdir(dir);
  }
});
test("new cancels safely or creates a blank detached document", async () => {
  const { files, state, disk } = fixture();
  await files.save();
  const original = disk.get("a.edisvg");
  files.changed({ ...project, name: "Pending" });
  assert.equal(await files.new(), null);
  assert.equal(files.status().path, "a.edisvg");
  state.choice = "discard";
  const created = await files.new();
  assert.equal(created.status.path, null);
  assert.equal(created.status.dirty, true);
  assert.deepEqual(created.project.scene.nodes, []);
  assert.equal(disk.get("a.edisvg"), original);
});
