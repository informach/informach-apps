import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rendersDir } from "@informach/edi-link/node";
import * as here from "./linkRender.ts";

test("two EdiSVG windows linking animations of one project at once lose none of them", async () => {
  const folder = await mkdtemp(join(tmpdir(), "edisvg-vinculos-"));
  try {
    const project = join(folder, "Aula 1.edisvg");
    // Another window is another process: its own copy of the module, its own in-process queue.
    const copy = "./linkRender.ts?janela-2";
    const other: typeof here = await import(copy);
    const link = (module: typeof here, n: number) =>
      module.registerLink(project, "project-1", {
        animationId: `animation-${n}`,
        artboardId: `artboard-${n}`,
        name: `Parte ${n}`,
      });
    await Promise.all(Array.from({ length: 12 }, (_, i) => link(i % 2 ? other : here, i + 1)));
    const linked = await here.linkedAnimations(project);
    assert.deepEqual(
      linked.map((item) => item.animationId).sort(),
      Array.from({ length: 12 }, (_, i) => `animation-${i + 1}`).sort(),
    );
    // The lock beside the manifest is gone once the changes end.
    assert.ok(!(await readdir(rendersDir(project))).some((name) => name.endsWith(".lock")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a render left half made goes; one another window is writing stays", async () => {
  const folder = await mkdtemp(join(tmpdir(), "edisvg-partes-"));
  try {
    await mkdir(folder, { recursive: true });
    const now = Date.now();
    const old = join(folder, "animation-1-0123456789abcdef.webm.a.part.webm");
    const writing = join(folder, "animation-2-0123456789abcdef.webm.b.part.webm");
    const mine = join(folder, "animation-3-0123456789abcdef.webm.c.part.webm");
    for (const path of [old, writing, mine]) await writeFile(path, "x");
    const long = new Date(now - here.LEFT_PART_MS - 1000);
    await utimes(old, long, long);
    await utimes(mine, long, long);
    await here.removeLeftParts(folder, new Set([mine]), now);
    assert.deepEqual((await readdir(folder)).sort(), [
      "animation-2-0123456789abcdef.webm.b.part.webm",
      "animation-3-0123456789abcdef.webm.c.part.webm",
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
