import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceleratorFromKey,
  activeHotkeys,
  DEFAULT_HOTKEYS,
  hotkeyConflicts,
  hotkeyLabel,
  OPEN_HOTKEYS,
  parseAccelerator,
  REQUIRED_HOTKEYS,
  sessionHotkeys,
  toKeyFilter,
} from "../src/shared/hotkeys.ts";

const CTRL_SHIFT = 1 | 4;

test("accelerators become the virtual key and the helper's modifier flags", () => {
  assert.deepEqual(parseAccelerator("F9"), { vk: 0x78, mods: 0, label: "F9" });
  assert.deepEqual(parseAccelerator("CommandOrControl+Shift+M"), {
    vk: 0x4d,
    mods: CTRL_SHIFT,
    label: "Ctrl+Shift+M",
  });
  assert.deepEqual(parseAccelerator("Ctrl+Shift+Down"), {
    vk: 0x28,
    mods: CTRL_SHIFT,
    label: "Ctrl+Shift+↓",
  });
  assert.deepEqual(parseAccelerator("PageDown"), { vk: 0x22, mods: 0, label: "PgDn" });
  assert.deepEqual(parseAccelerator("Super+Alt+7"), { vk: 0x37, mods: 8 | 2, label: "Win+Alt+7" });
  // Plain typing is never taken over, and an accelerator has exactly one key.
  for (const bad of ["M", "Shift+M", "7", "Ctrl+Ctrl+M", "Ctrl+M+N", "Ctrl+;", "", "Ctrl+"])
    assert.equal(parseAccelerator(bad), null, bad);
});

test("the defaults: F9, F10 and F8 while open; marker, redo and the teleprompter only during a take", () => {
  assert.equal(hotkeyLabel(DEFAULT_HOTKEYS.marker), "Ctrl+Shift+M");
  assert.equal(hotkeyLabel(DEFAULT_HOTKEYS.retake), "Ctrl+Shift+R");
  assert.deepEqual([...OPEN_HOTKEYS], ["toggle", "stop", "guidedTarget"]);
  assert.deepEqual([...REQUIRED_HOTKEYS], ["toggle", "stop"]);
  assert.deepEqual(sessionHotkeys(false), ["marker", "retake", "lineNext", "linePrev"]);
  assert.deepEqual(sessionHotkeys(true).slice(-2), ["clickerNext", "clickerPrev"]);
  assert.deepEqual(hotkeyConflicts(DEFAULT_HOTKEYS, true), []);
});

test("the helper hides every shortcut in use from the keys on screen, the clicker's only when on", () => {
  const off = toKeyFilter(DEFAULT_HOTKEYS, false);
  assert.deepEqual(off, [
    { vk: 0x78, m: 0 },
    { vk: 0x79, m: 0 },
    { vk: 0x77, m: 0 },
    { vk: 0x4d, m: CTRL_SHIFT },
    { vk: 0x52, m: CTRL_SHIFT },
    { vk: 0x28, m: CTRL_SHIFT },
    { vk: 0x26, m: CTRL_SHIFT },
  ]);
  const on = toKeyFilter(DEFAULT_HOTKEYS, true);
  assert.deepEqual(on.slice(-2), [
    { vk: 0x22, m: 0 },
    { vk: 0x21, m: 0 },
  ]);
  // Ctrl+R and Ctrl+M of other programs are not blocked any more.
  assert.ok(!off.some((k) => k.m === 1 && (k.vk === 0x52 || k.vk === 0x4d)));
});

test("a shortcut that repeats another or does not parse is reported, not registered twice", () => {
  const map = { ...DEFAULT_HOTKEYS, marker: "F9", retake: "R" };
  assert.deepEqual(hotkeyConflicts(map, false), [
    { action: "marker", accelerator: "F9", problem: "duplicate", other: "toggle" },
    { action: "retake", accelerator: "R", problem: "invalid" },
  ]);
  // The clicker's keys only count when it is on.
  const clicker = { ...DEFAULT_HOTKEYS, clickerNext: "F9" };
  assert.deepEqual(hotkeyConflicts(clicker, false), []);
  assert.equal(hotkeyConflicts(clicker, true)[0]?.other, "toggle");
  assert.equal(activeHotkeys(false).length, 7);
});

test("a key pressed in the options becomes an accelerator by its place on the keyboard", () => {
  assert.equal(acceleratorFromKey("KeyM", { ctrl: true, shift: true }), "CommandOrControl+Shift+M");
  assert.equal(acceleratorFromKey("Digit1", { ctrl: true }), "CommandOrControl+1");
  assert.equal(acceleratorFromKey("F9", {}), "F9");
  assert.equal(
    acceleratorFromKey("ArrowDown", { ctrl: true, shift: true }),
    "CommandOrControl+Shift+Down",
  );
  assert.equal(acceleratorFromKey("PageDown", {}), "PageDown");
  assert.equal(acceleratorFromKey("ShiftLeft", { shift: true }), null);
  assert.equal(acceleratorFromKey("KeyM", {}), null);
  assert.equal(acceleratorFromKey("Semicolon", { ctrl: true }), null);
});
