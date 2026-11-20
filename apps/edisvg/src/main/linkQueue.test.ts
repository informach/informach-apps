import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LinkedAnimation } from "@informach/edi-link/contract";
import { newProject } from "../shared/project";
import { serializeProject } from "../shared/projectPolicy";
import { createLinkQueue } from "./linkQueue";

const linked: LinkedAnimation = {
  animationId: "animation-1",
  artboardId: "artboard-1",
  name: "Parte 1",
  updatedAt: 1,
};

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "edisvg-fila-"));
  const project = (name: string) => {
    const value = newProject();
    return { path: join(folder, `${name}.edisvg`), id: value.id, text: serializeProject(value) };
  };
  const aula1 = project("Aula 1"),
    aula2 = project("Aula 2"),
    solto = project("Sem vínculo");
  for (const p of [aula1, aula2, solto]) await writeFile(p.path, p.text);
  const links = async (path: string) => (path === solto.path ? [] : [linked]);
  return {
    folder,
    aula1,
    aula2,
    solto,
    file: join(folder, "fila-de-renders.json"),
    links,
    done: () => rm(folder, { recursive: true, force: true }),
  };
}

test("saves of linked projects queue in order, once each, and the window never sees a path", async () => {
  const f = await fixture();
  try {
    const queue = createLinkQueue({ file: f.file, links: f.links });
    await queue.init();
    assert.equal(await queue.add(f.solto.path), null, "a project without links renders nothing");
    const first = await queue.add(f.aula1.path);
    const second = await queue.add(f.aula2.path);
    assert.ok(first && second && first !== second);
    // Saved again (same file, any case on Windows): it keeps its place and its id.
    assert.equal(await queue.add(f.aula1.path.toUpperCase()), first);
    assert.deepEqual(queue.view(), [
      { id: first, name: "Aula 1" },
      { id: second, name: "Aula 2" },
    ]);
    assert.ok(!JSON.stringify(queue.view()).includes(f.folder));
  } finally {
    await f.done();
  }
});

test("an item renders from its saved file, into its own project, whatever is open", async () => {
  const f = await fixture();
  try {
    const queue = createLinkQueue({ file: f.file, links: f.links });
    await queue.init();
    const id = await queue.add(f.aula1.path);
    assert.throws(() => queue.target(id), /ainda não começou/);
    const loaded = await queue.load(id);
    assert.equal(loaded.project.id, f.aula1.id);
    assert.deepEqual(loaded.links, [linked]);
    assert.deepEqual(queue.target(id), { path: f.aula1.path, projectId: f.aula1.id });
    await queue.remove(id);
    assert.deepEqual(queue.view(), []);
    assert.throws(() => queue.target(id), /saiu da fila/);
    await assert.rejects(queue.load(id), /saiu da fila/);
    await assert.rejects(queue.load("outro"), /saiu da fila/);
  } finally {
    await f.done();
  }
});

test("the queue survives EdiSVG closing, and a project gone meanwhile says so", async () => {
  const f = await fixture();
  try {
    const before = createLinkQueue({ file: f.file, links: f.links });
    await before.init();
    const first = await before.add(f.aula1.path);
    const second = await before.add(f.aula2.path);
    await before.remove(first);
    const after = createLinkQueue({ file: f.file, links: f.links });
    await after.init();
    assert.deepEqual(after.view(), [{ id: second, name: "Aula 2" }]);
    await rm(f.aula2.path);
    await assert.rejects(after.load(second), /Aula 2\.edisvg não foi encontrado/);
  } finally {
    await f.done();
  }
});

test("an unreadable queue file starts an empty queue, and a bad stored path is refused", async () => {
  const f = await fixture();
  try {
    await writeFile(f.file, "{ isto não é json");
    const broken = createLinkQueue({ file: f.file, links: f.links });
    await broken.init();
    assert.deepEqual(broken.view(), []);
    await writeFile(
      f.file,
      JSON.stringify({ version: 1, items: [{ id: "x", path: "", name: "", addedAt: 0 }] }),
    );
    const invalid = createLinkQueue({ file: f.file, links: f.links });
    await invalid.init();
    assert.deepEqual(invalid.view(), []);
    // A new item rewrites the file whole.
    const id = await invalid.add(f.aula1.path);
    const stored = JSON.parse(await readFile(f.file, "utf8"));
    assert.deepEqual(
      stored.items.map((i: { id: string }) => i.id),
      [id],
    );
  } finally {
    await f.done();
  }
});

test("each window has its queue; one that closed with renders left gives them to the next window", async () => {
  const f = await fixture();
  try {
    const closed = join(f.folder, "fila-de-renders-janela-2.json");
    const left = createLinkQueue({ file: closed, links: f.links });
    await left.init();
    await left.add(f.aula1.path);
    await left.add(f.aula2.path);
    // Window 1 had queued Aula 2 too: it stays once.
    const queue = createLinkQueue({ file: f.file, links: f.links });
    await queue.init();
    await queue.add(f.aula2.path);
    const adopting = createLinkQueue({ file: f.file, links: f.links, orphans: () => [closed] });
    await adopting.init();
    assert.deepEqual(
      adopting.view().map((i) => i.name),
      ["Aula 2", "Aula 1"],
    );
    // Adopted: the closed window's file is gone, and the queue kept for the next opening.
    await assert.rejects(readFile(closed, "utf8"));
    const again = createLinkQueue({ file: f.file, links: f.links });
    await again.init();
    assert.equal(again.view().length, 2);
    // Another window adopting at the same time gets nothing twice.
    const late = createLinkQueue({
      file: join(f.folder, "fila-de-renders-janela-3.json"),
      links: f.links,
      orphans: () => [closed],
    });
    await late.init();
    assert.deepEqual(late.view(), []);
  } finally {
    await f.done();
  }
});
