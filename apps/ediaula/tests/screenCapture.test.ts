import assert from "node:assert/strict";
import { test } from "node:test";
import { screenCaptureProblem } from "../src/shared/systemAudio.ts";

test("the screen is recorded only where Windows leaves the recorder's window out of the capture", () => {
  assert.equal(screenCaptureProblem("win32", "10.0.19041"), null);
  assert.equal(screenCaptureProblem("win32", "10.0.26200"), null);
  assert.match(screenCaptureProblem("win32", "10.0.18363") ?? "", /2004/);
  assert.match(screenCaptureProblem("win32", "desconhecida") ?? "", /2004/);
  assert.equal(screenCaptureProblem("linux", "6.1.0"), null);
});
