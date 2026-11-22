import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, unlockSync } from "proper-lockfile";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  holdRuntimeLock,
  MAX_TOOL_INSTANCES,
  type RuntimeLockEvent,
  runtimeLockName,
} from "./runtime-lock";

describe("holding the runtime lock while the tool runs", () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
  const setup = () => {
    const folder = mkdtempSync(join(tmpdir(), "edi-runtime-lock-"));
    folders.push(folder);
    const file = join(folder, runtimeLockName("edisvg"));
    const events: RuntimeLockEvent[] = [];
    return { file, events, report: (event: RuntimeLockEvent) => events.push(event) };
  };
  // proper-lockfile's shortest: renewed every second, stale after two.
  const timing = { stale: 2_000, update: 1_000 };

  it("a lock removed from the folder is reported and taken again, without an uncaught error", async () => {
    // EdiSVG, 22/11/2026: the lock vanished from the suite folder and the next renewal threw in
    // its timer, an error box over the tool that stopped answering.
    const { file, events, report } = setup();
    await holdRuntimeLock(file, report, timing);
    rmSync(`${file}.lock`, { recursive: true });
    await vi.waitFor(() => expect(events).toEqual(["runtime_lock_lost"]), { timeout: 5_000 });
    await vi.waitFor(async () => expect(await check(file, { realpath: false })).toBe(true), {
      timeout: 5_000,
    });
    unlockSync(file, { realpath: false });
  }, 10_000);

  it("a lock someone else holds now is reported and left to them", async () => {
    const { file, events, report } = setup();
    await holdRuntimeLock(file, report, timing);
    // Another holder replaced it: a fresh lock that is not ours.
    rmSync(`${file}.lock`, { recursive: true });
    mkdirSync(`${file}.lock`);
    await vi.waitFor(
      () => expect(events).toEqual(["runtime_lock_lost", "runtime_lock_retake_failed"]),
      { timeout: 5_000 },
    );
    expect(existsSync(`${file}.lock`)).toBe(true);
  }, 10_000);
});

describe("runtime lock of a tool open in several windows", () => {
  it("keeps the tool's own name for window 1 and gives the others one each", () => {
    expect(runtimeLockName("edisvg")).toBe("edisvg.runtime");
    expect(runtimeLockName("edisvg", 1)).toBe("edisvg.runtime");
    expect(runtimeLockName("edisvg", 2)).toBe("edisvg.janela-2.runtime");
    expect(MAX_TOOL_INSTANCES).toBe(8);
  });
});
