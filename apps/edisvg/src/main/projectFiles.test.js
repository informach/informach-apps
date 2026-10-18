import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { newProject, PROJECT_VERSION } from "../shared/project.js";
import { atomicWrite, createProjectFiles } from "./projectFiles.js";

const project = {
  version: 1,
  name: "Zezé",
  animation: "Acenar",
  transforms: { x: 0 },
  keys: [0, 72],
};
for (const sourceVersion of [19, 20, 21])
  test(`v${sourceVersion} upgrade saves the current version only after preserving exact original bytes in its migration backup`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `edisvg-v${sourceVersion}-migration-`));
    try {
      const path = join(directory, "original.edisvg"),
        original = Buffer.from(
          `\uFEFF${JSON.stringify({ ...newProject(), version: sourceVersion })}\r\n`,
          "utf8",
        ),
        files = createProjectFiles({
          chooseOpen: async () => path,
          chooseSave: async () => path,
          confirm: async () => "discard",
        });
      await writeFile(path, original);
      const opened = await files.open();
      assert.equal(opened.project.version, PROJECT_VERSION);
      await files.changed({ ...opened.project, name: "Migrado" });
      await files.save();
      const backups = (await readdir(directory)).filter((name) => name.endsWith(".bak"));
      assert.equal(backups.length, 1);
      assert.deepEqual(await readFile(join(directory, backups[0])), original);
      assert.equal(JSON.parse(await readFile(path, "utf8")).version, PROJECT_VERSION);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
test("v1/v2 migration backs up the exact original bytes before replacement and detects external edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-migration-"));
  try {
    const path = join(directory, "original.edisvg");
    const original = Buffer.from(`\uFEFF${JSON.stringify({ ...project, version: 2 })}\r\n`, "utf8");
    await writeFile(path, original);
    let destination = path;
    const files = createProjectFiles({
      chooseOpen: async () => path,
      chooseSave: async () => destination,
      confirm: async () => "discard",
    });
    const opened = await files.open();
    assert.equal(opened.project.version, PROJECT_VERSION);
    assert.equal(files.status().dirty, false);
    await files.changed({ ...opened.project, name: "Migrado" });
    await files.save();
    const backups = (await readdir(directory)).filter((name) => name.endsWith(".bak"));
    assert.equal(backups.length, 1);
    assert.deepEqual(await readFile(join(directory, backups[0])), original);
    assert.equal(JSON.parse(await readFile(path, "utf8")).name, "Migrado");
    const foreign = "external contents, intentionally incompatible";
    await writeFile(path, foreign);
    await files.changed({ ...opened.project, name: "Outra edição" });
    await assert.rejects(files.save(), /alterado fora/);
    assert.equal(await readFile(path, "utf8"), foreign);
    destination = join(directory, "separate.edisvg");
    await files.save(true);
    assert.equal(await readFile(path, "utf8"), foreign);
    assert.equal(JSON.parse(await readFile(destination, "utf8")).name, "Outra edição");
  } finally {
    await rm(directory, { recursive: true });
  }
});
test("migration backup failure prevents overwriting the original", async () => {
  const disk = new Map([["old.edisvg", JSON.stringify(project)]]);
  const files = createProjectFiles({
    chooseOpen: async () => "old.edisvg",
    chooseSave: async () => "old.edisvg",
    confirm: async () => "discard",
    read: async (path) => disk.get(path),
    write: async (path, value) => disk.set(path, value),
    backup: async () => {
      throw new Error("Backup unavailable");
    },
  });
  const opened = await files.open();
  const original = disk.get("old.edisvg");
  await files.changed({ ...opened.project, name: "Edited" });
  await assert.rejects(files.save(), /Backup unavailable/);
  assert.equal(disk.get("old.edisvg"), original);
  assert.equal(files.status().dirty, true);
});
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
test("failed atomic replacement preserves an existing destination and removes staging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-write-failure-"));
  try {
    const destination = join(directory, "existing");
    await mkdir(destination);
    await writeFile(join(destination, "original.edisvg"), "original");
    await assert.rejects(atomicWrite(destination, "replacement"));
    assert.deepEqual(await readdir(directory), ["existing"]);
    assert.equal(await readFile(join(destination, "original.edisvg"), "utf8"), "original");
  } finally {
    await rm(directory, { recursive: true });
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
  assert.deepEqual(created.project.artboards[0].scene.nodes, []);
  assert.equal(disk.get("a.edisvg"), original);
});
test("edits arriving while a discard confirmation is pending cancel document replacement", async () => {
  let decide;
  const files = createProjectFiles({
    chooseOpen: async () => null,
    chooseSave: async () => null,
    confirm: () =>
      new Promise((resolve) => {
        decide = resolve;
      }),
  });
  await files.changed(project);
  const replacing = files.new();
  await files.changed({ ...project, name: "Concurrent edit" });
  decide("discard");
  assert.equal(await replacing, null);
  assert.equal(files.status().dirty, true);
});
test("a recovered draft can be saved elsewhere when local checkpoint storage is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-save-rescue-"));
  try {
    const destination = join(directory, "rescued.edisvg");
    const files = createProjectFiles({
      chooseOpen: async () => null,
      chooseSave: async () => destination,
      confirm: async () => "cancel",
      checkpoint: async () => {
        throw new Error("checkpoint unavailable");
      },
    });
    await files.recover(project, { persist: false });
    const result = await files.save();
    assert.equal(result.saved, true);
    assert.match(result.warning, /arquivo foi salvo/);
    assert.equal(JSON.parse(await readFile(destination, "utf8")).name, project.name);
    assert.equal(files.status().dirty, false);
  } finally {
    await rm(directory, { recursive: true });
  }
});
test("restored work is detached and remains recoverable when a save fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-recover-flow-"));
  try {
    const { createRecoveryStore } = await import("./recoveryStore.ts");
    const { parseProject } = await import("../shared/project.js");
    const store = createRecoveryStore(join(directory, "checkpoint.json"), parseProject);
    const destination = join(directory, "original.edisvg");
    let fail = false;
    const files = createProjectFiles({
      chooseSave: async () => destination,
      chooseOpen: async () => destination,
      confirm: async () => "cancel",
      checkpoint: (value) => store.save(value),
      write: async (path, text) => {
        if (fail) throw new Error("disk full");
        await atomicWrite(path, text);
      },
    });
    await files.changed(project);
    await files.save();
    assert.equal((await store.load()).project, null);
    const previous = await readFile(destination, "utf8");
    await files.changed({ ...project, name: "Pending" });
    const checkpoint = await store.load();
    const restored = await files.recover(checkpoint.project);
    assert.equal(restored.status.path, null);
    assert.equal(restored.status.dirty, true);
    fail = true;
    await assert.rejects(files.save(), /disk full/);
    assert.equal((await store.load()).project.name, "Pending");
    assert.equal(await readFile(destination, "utf8"), previous);
  } finally {
    await rm(directory, { recursive: true });
  }
});
