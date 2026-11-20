import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { writeRequest } from "@informach/edi-link/node";
import type { WindowEntry } from "./instances.ts";
import {
  createLinkInbox,
  decide,
  IDLE_GRACE_MS,
  type InboxWindow,
  NEW_WINDOW_AFTER_MS,
  onlyNudged,
} from "./linkRequests.ts";

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

const otherWindow = (slot: number, path: string | null, idle = false): WindowEntry => ({
  slot,
  pid: 1000 + slot,
  startedAt: 0,
  path,
  dirty: false,
  idle,
});

test("a request goes to the window with its project, else to an empty one, else a new one", () => {
  const request = {
    version: 1 as const,
    id: "pedido-0003",
    type: "open" as const,
    from: "ediaula" as const,
    project: project(),
    animationId: "animation-c3",
  };
  const here = (
    openPath: string | null,
    idle: boolean,
    others: WindowEntry[],
    slot = 1,
    openedFor: string | null = null,
  ) => ({ slot, openPath: () => openPath, idle: () => idle, others: () => others, openedFor });
  // Its project open here: at once, even busy.
  assert.equal(decide(request, 0, here(project().toUpperCase(), false, [])), "take");
  // Open in another window: that one takes it.
  assert.equal(decide(request, 9000, here(null, true, [otherWindow(2, project())])), "leave");
  // Opened for it: at once.
  assert.equal(decide(request, 0, here(null, false, [], 3, "pedido-0003")), "take");
  // An empty window waits a moment (the window with the project goes first), then takes it.
  assert.equal(decide(request, IDLE_GRACE_MS - 1, here(null, true, [])), "leave");
  assert.equal(decide(request, IDLE_GRACE_MS, here(null, true, [])), "take");
  // Busy, another window empty: that one takes it.
  assert.equal(
    decide(request, 9000, here("C:\\outra.edisvg", false, [otherWindow(2, null, true)])),
    "leave",
  );
  // All busy: the lowest-numbered window opens a new one for it, after a moment.
  const busy = [otherWindow(3, "C:\\c.edisvg")];
  assert.equal(
    decide(request, NEW_WINDOW_AFTER_MS - 1, here("C:\\a.edisvg", false, busy)),
    "leave",
  );
  assert.equal(
    decide(request, NEW_WINDOW_AFTER_MS, here("C:\\a.edisvg", false, busy)),
    "new-window",
  );
  assert.equal(
    decide(request, 9000, here("C:\\b.edisvg", false, [otherWindow(1, "C:\\a.edisvg")], 2)),
    "leave",
  );
});

test("one window takes a request (its file renamed); one taken by a closed window comes back", async () => {
  const folder2 = join(folder, "..", "pedidos-janelas");
  await writeRequest(folder2, {
    id: "pedido-0004",
    type: "open",
    from: "ediaula",
    project: project(),
    animationId: "animation-d4",
  });
  const window = (slot: number, others: WindowEntry[]): InboxWindow => ({
    slot,
    openPath: () => (slot === 1 ? project() : null),
    idle: () => false,
    others: () => others,
    openWindowFor: () => assert.fail("no window to open"),
  });
  // Window 2 (busy, the project not here) leaves it; window 1 has the project.
  const second = await createLinkInbox(
    folder2,
    () => undefined,
    window(2, [otherWindow(1, project())]),
  );
  const first = await createLinkInbox(folder2, () => undefined, window(1, [otherWindow(2, null)]));
  try {
    assert.equal(await second.next(), null);
    assert.equal((await first.next())?.id, "pedido-0004");
    assert.deepEqual(await readdir(folder2), ["pedido-0004.janela-1"]);
  } finally {
    first.close();
    second.close();
  }
  // Window 1 closed before it was done: the next window to open gives it back to everyone.
  let opened: string | null = null;
  const third = await createLinkInbox(folder2, () => undefined, {
    slot: 3,
    openPath: () => "C:\\outra.edisvg",
    idle: () => false,
    others: () => [],
    openWindowFor: (id) => {
      opened = id;
    },
    // Old enough for a window of its own.
    now: () => Date.now() + NEW_WINDOW_AFTER_MS,
  });
  try {
    assert.deepEqual(await readdir(folder2), ["pedido-0004.json"]);
    assert.equal(await third.next(), null);
    assert.equal(opened, "pedido-0004");
    // The window opened for it takes it at once.
    const fourth = await createLinkInbox(folder2, () => undefined, {
      slot: 4,
      openPath: () => null,
      idle: () => false,
      others: () => [otherWindow(3, "C:\\outra.edisvg")],
      openedFor: "pedido-0004",
      openWindowFor: () => assert.fail("no window to open"),
    });
    try {
      assert.equal((await fourth.next())?.id, "pedido-0004");
      await fourth.done("pedido-0004");
      assert.deepEqual(await readdir(folder2), []);
    } finally {
      fourth.close();
    }
  } finally {
    third.close();
  }
});

test("EdiSVG opened only to wake the window that has the project leaves at once", async () => {
  const folder3 = join(folder, "..", "pedidos-cutucada");
  await writeRequest(folder3, {
    id: "pedido-0005",
    type: "open",
    from: "ediaula",
    project: project(),
    animationId: "animation-e5",
  });
  assert.equal(await onlyNudged(folder3, []), false);
  assert.equal(await onlyNudged(folder3, [otherWindow(1, project())]), true);
  assert.equal(await onlyNudged(folder3, [otherWindow(1, "C:\\outra.edisvg")]), false);
  // An old request is not why EdiSVG was opened now.
  assert.equal(await onlyNudged(folder3, [otherWindow(1, project())], Date.now() + 60_000), false);
});
