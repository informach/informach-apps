import assert from "node:assert/strict";
import { test } from "node:test";
import { topologyKey } from "./capture-geometry.ts";
import {
  captureProfileSchema,
  normalizeShortcut,
  validateSavedRegion,
} from "./capture-preferences.ts";

const displays = [
  { id: "1", bounds: { x: -100, y: 0, width: 100, height: 100 }, scaleFactor: 2, rotation: 0 },
];
test("presets reject ephemeral authority and stale or empty saved regions", () => {
  const profile = captureProfileSchema.parse({});
  assert.equal(profile.version, 1);
  assert.throws(() =>
    captureProfileSchema.parse({
      ...profile,
      defaults: { ...profile.defaults, source: "window:99:0" },
    }),
  );
  const saved = { topology: topologyKey(displays), rect: { x: -90, y: 10, width: 20, height: 20 } };
  assert.deepEqual(validateSavedRegion(saved, displays), saved.rect);
  assert.throws(() =>
    validateSavedRegion(
      saved,
      displays.map((d) => ({ ...d, rotation: 90 })),
    ),
  );
  assert.throws(() => validateSavedRegion({ ...saved, rect: { ...saved.rect, x: 0 } }, displays));
  assert.equal(normalizeShortcut("shift+ctrl+k"), "Control+Shift+K");
  assert.throws(() => normalizeShortcut("Ctrl+Shift+S"));
});
