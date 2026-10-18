import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { newProject, parseProject } from "../shared/project.js";
import { createRecoveryStore } from "./recoveryStore.ts";

test("recovery persists a validated draft and a durable clean/discard marker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-recovery-"));
  try {
    const path = join(directory, "recovery.json");
    const store = createRecoveryStore(path, parseProject);
    assert.deepEqual(await store.load(), { exists: false, project: null });
    const project = { ...newProject(), name: "Recuperável" };
    await store.save(project);
    assert.deepEqual((await createRecoveryStore(path, parseProject).load()).project, project);
    await Promise.all([
      store.save({ ...project, name: "Primeiro" }),
      store.save({ ...project, name: "Último" }),
    ]);
    assert.equal((await store.load()).project?.name, "Último");
    await store.save(null);
    assert.deepEqual(await store.load(), { exists: true, project: null });
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("invalid or incompatible recovery is never replaced on read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-corrupt-"));
  try {
    const path = join(directory, "recovery.json");
    const store = createRecoveryStore(path, parseProject);
    for (const content of [
      "truncated{",
      '{"version":99,"document":null}',
      '{"version":1,"document":{"version":99}}',
    ]) {
      await writeFile(path, content);
      await assert.rejects(store.load(), /preservada/);
      assert.equal(await readFile(path, "utf8"), content);
    }
    await assert.rejects(store.save({ ...newProject(), name: "" }), /incompatível/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
