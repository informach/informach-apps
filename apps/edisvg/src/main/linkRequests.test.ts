import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { writeRequest } from "@informach/edi-link/node";
import { createLinkInbox } from "./linkRequests.ts";

let folder = "";
before(async () => {
  folder = join(await mkdtemp(join(tmpdir(), "edisvg-pedidos-")), "pedidos");
});
after(async () => {
  await rm(join(folder, ".."), { recursive: true, force: true });
});

const project = () => join(folder, "..", "Aula 3.edisvg");

test("requests waiting when EdiSVG opens are taken in order; one written while open is heard", async () => {
  await writeRequest(folder, {
    id: "pedido-0001",
    type: "open",
    from: "ediaula",
    project: project(),
    animationId: "animation-a1",
  });
  let heard = 0;
  const inbox = await createLinkInbox(folder, () => {
    heard++;
  });
  try {
    // The one there at the start is announced once.
    assert.equal(heard, 1);
    const first = await inbox.next();
    assert.equal(first?.id, "pedido-0001");
    // Taken: not handed again, and its project path stays the main process's.
    assert.equal(await inbox.next(), null);
    assert.equal(inbox.taken("pedido-0001").project, project());
    assert.throws(() => inbox.taken("pedido-9999"), /não encontrado/);
    // A request written while open is heard (watched, no polling).
    await writeRequest(folder, {
      id: "pedido-0002",
      type: "link",
      from: "ediaula",
      project: project(),
      animationId: "animation-b2",
    });
    const deadline = Date.now() + 5000;
    while (heard < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.equal(heard, 2);
    assert.equal((await inbox.next())?.id, "pedido-0002");
    // Done: its file goes.
    await inbox.done("pedido-0001");
    await inbox.done("pedido-0002");
    assert.deepEqual(await readdir(folder), []);
  } finally {
    inbox.close();
  }
});
