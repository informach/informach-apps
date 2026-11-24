import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { clearRun, loadRun, RUN_RECORD_MAX, saveRun } from "./pipelineRuns.ts";

test("where a run stopped is kept by project, read back and cleared", async () => {
  const userData = await mkdtemp(join(tmpdir(), "edisvg-runs-"));
  try {
    const id = "project-d9420deb-88a6-4fc5-a593-05c82edc98bc";
    assert.equal(await loadRun(userData, id), null);
    await saveRun(userData, id, { version: 1, done: ["narration"] });
    assert.deepEqual(await loadRun(userData, id), { version: 1, done: ["narration"] });
    await clearRun(userData, id);
    assert.equal(await loadRun(userData, id), null);
    await clearRun(userData, id);
    // Unreadable: started over.
    await saveRun(userData, id, { version: 1 });
    await writeFile(join(userData, "pipeline-runs", `${id}.json`), "{nope");
    assert.equal(await loadRun(userData, id), null);
    for (const bad of ["../x", "project-a/../b", 5, "outro-1"])
      await assert.rejects(saveRun(userData, bad, {}), /Projeto inválido/);
    await assert.rejects(saveRun(userData, id, []), /inválido/);
    await assert.rejects(
      saveRun(userData, id, { text: "x".repeat(RUN_RECORD_MAX) }),
      /grande demais/,
    );
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});
