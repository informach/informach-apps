import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { cursorSpritePath } from "../src/main/cursor-sprite-path.ts";
import { cursorFxId, DEFAULT_CURSOR_FX } from "../src/shared/cursor.ts";

test("cursor cache accepts generated decimal keys, never renderer-supplied paths", () => {
  const directory = join(process.cwd(), "test-cache");
  const id = `${cursorFxId(DEFAULT_CURSOR_FX)}_140_29.97`;
  assert.equal(cursorSpritePath(directory, id), join(directory, `cursor-${id}.webm`));
  for (const invalid of [
    "a/../../outside",
    "a\\..\\..\\outside",
    "C:outside",
    "",
    "x\0",
    "x".repeat(201),
  ]) {
    assert.throws(() => cursorSpritePath(directory, invalid));
  }
});
