import assert from "node:assert/strict";
import { test } from "node:test";
import type { Track } from "@informach/edi-motion";
import { TIMELINE_KEY_SPACING, timelineWindow } from "./timelineWindow";

test("timeline bounds glyphs by pixels without removing keys and prioritizes selection", () => {
  const track: Track = {
    id: "track-a",
    targetId: "node-a",
    property: "x",
    keys: Array.from({ length: 10000 }, (_, index) => ({
      id: `key-${index}`,
      frame: index,
      value: index,
      easing: "linear",
    })),
  };
  const window = timelineWindow(track, 4000, 5000, 1000, 10000, new Set(["key-4011"]));
  assert.equal(window.total, 1001);
  assert.ok(window.entries.length <= 14);
  assert.ok(window.entries.some((entry) => entry.key.id === "key-4011"));
  assert.equal(track.keys.length, 10000);
});

test("cluster representatives keep real button spacing even when selection shifts a representative across a bucket boundary", () => {
  const keys: Track["keys"] = Array.from({ length: 1000 }, (_, index) => ({
    id: `key-spacing-${index}`,
    frame: index,
    value: index,
    easing: "linear",
  }));
  for (const selected of [
    new Set<string>(),
    new Set(["key-spacing-23", "key-spacing-24", "key-spacing-49", "key-spacing-500"]),
  ]) {
    const result = timelineWindow({ keys }, 0, 999, 1000, 1000, selected);
    assert.equal(result.total, keys.length);
    assert.equal(
      result.entries.reduce((sum, entry) => sum + entry.count, 0),
      keys.length,
    );
    result.entries.forEach((entry, index) => {
      const previous = result.entries[index - 1];
      if (previous) assert.ok(entry.pixel - previous.pixel >= TIMELINE_KEY_SPACING);
    });
    assert.ok(result.entries.length <= Math.ceil(1000 / TIMELINE_KEY_SPACING));
    if (selected.size) assert.ok(result.entries.some((entry) => selected.has(entry.key.id)));
  }
  assert.equal(keys.length, 1000);
});
