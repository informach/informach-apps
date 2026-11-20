import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  askToFront,
  claimSlot,
  createWindowRegister,
  liveWindows,
  MAX_WINDOWS,
  ownerOf,
  requestArgument,
  windowArguments,
} from "./instances.ts";

const withFolder = async (run: (folder: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), "edisvg-janelas-"));
  try {
    await run(join(root, "janelas"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const entry = (slot: number, pid: number, path: string | null = null, idle = false) =>
  JSON.stringify({ slot, pid, startedAt: 1, path, dirty: false, idle });

test("each window takes the lowest free number; a dead window's number is taken over", () =>
  withFolder(async (folder) => {
    const running = new Set([101, 102]);
    const alive = (pid: number) => running.has(pid);
    assert.equal(claimSlot(folder, { pid: 101, alive }), 1);
    assert.equal(claimSlot(folder, { pid: 102, alive }), 2);
    // Window 1 closed without its register file going (a crash): its number is free again.
    running.delete(101);
    running.add(103);
    assert.equal(claimSlot(folder, { pid: 103, alive }), 1);
    assert.equal(JSON.parse(readFileSync(join(folder, "1.json"), "utf8")).pid, 103);
    assert.equal(existsSync(join(folder, "1.json.troca")), false);
    // A file half written a moment ago is a window being born: its number is not taken.
    writeFileSync(join(folder, "3.json"), "");
    running.add(104);
    assert.equal(claimSlot(folder, { pid: 104, alive }), 4);
    // All taken: none.
    for (let pid = 105; pid < 105 + MAX_WINDOWS; pid++) running.add(pid);
    let last: number | null = 0;
    for (let pid = 105; last !== null; pid++) last = claimSlot(folder, { pid, alive });
    assert.equal(liveWindows(folder, { alive }).length, MAX_WINDOWS - 1);
  }));

test("a window says what it has open; the others find its project and call it forward", () =>
  withFolder(async (folder) => {
    mkdirSync(folder, { recursive: true });
    const project = join(folder, "..", "Aula 1.edisvg");
    writeFileSync(join(folder, "2.json"), entry(2, 202, project));
    writeFileSync(join(folder, "3.json"), entry(3, 303));
    const alive = (pid: number) => pid !== 303;
    assert.deepEqual(
      liveWindows(folder, { alive }).map((w) => w.slot),
      [2],
    );
    // Case does not matter (Windows paths); the window asking is never its own owner.
    assert.equal(ownerOf(folder, project.toUpperCase(), null, { alive })?.slot, 2);
    assert.equal(ownerOf(folder, project, 2, { alive }), null);

    const register = createWindowRegister(folder, 1, { pid: 101, now: () => 5 });
    await register.publish({ path: null, dirty: false, idle: true });
    assert.deepEqual(JSON.parse(readFileSync(join(folder, "1.json"), "utf8")), {
      slot: 1,
      pid: 101,
      startedAt: 5,
      path: null,
      dirty: false,
      idle: true,
    });
    let fronts = 0;
    register.watchFront(() => {
      fronts++;
    });
    askToFront(folder, 1);
    const deadline = Date.now() + 5000;
    while (fronts === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    assert.equal(fronts, 1);
    assert.equal(existsSync(join(folder, "1.frente")), false);
    // Closing frees the number; a file another process wrote meanwhile is left.
    register.release();
    assert.equal(existsSync(join(folder, "1.json")), false);
    writeFileSync(join(folder, "1.json"), entry(1, 999));
    register.release();
    assert.equal(existsSync(join(folder, "1.json")), true);
  }));

test("a new window starts with this one's arguments, without its files and its request", () => {
  const dev = ["electron.exe", "-r", "C:\\fixture\\native-vault.cjs", "C:\\repo\\apps\\edisvg"];
  assert.deepEqual(windowArguments([...dev, "C:\\Aulas\\Aula 1.edisvg", "--pedido", "abc12345"]), [
    "-r",
    "C:\\fixture\\native-vault.cjs",
    "C:\\repo\\apps\\edisvg",
  ]);
  assert.deepEqual(windowArguments(["EdiSVG.exe"], ["--pedido", "pedido-0001"]), [
    "--pedido",
    "pedido-0001",
  ]);
  assert.equal(requestArgument(["EdiSVG.exe", "--pedido", "pedido-0001"]), "pedido-0001");
  assert.equal(requestArgument(["EdiSVG.exe", "--pedido", "../x"]), null);
  assert.equal(requestArgument(["EdiSVG.exe"]), null);
});
