import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explainSaveError,
  saveErrorDetail,
  saveErrorKind,
  saveErrorShort,
} from "../src/shared/saveError.ts";

const ipc = (text: string): string => `Error invoking remote method 'project:save': Error: ${text}`;

test("a failed save is told in words by the kind of error, with the detail kept apart", () => {
  const cases: [string, ReturnType<typeof saveErrorKind>][] = [
    [ipc("EPERM: operation not permitted, rename 'a.tmp' -> 'a.ediaula'"), "permission"],
    [ipc("EACCES: permission denied, open 'C:aulasa.ediaula'"), "permission"],
    [ipc("ENOSPC: no space left on device, write"), "full"],
    [ipc("EBUSY: resource busy or locked, rename 'a.tmp' -> 'a.ediaula'"), "busy"],
    [ipc("ENOENT: no such file or directory, open 'E:aula.ediaula'"), "drive"],
    [ipc("UNKNOWN: unknown error, open '\\servidoraulasa.ediaula'"), "drive"],
    [ipc("Projeto inválido: clips.3.start"), "other"],
  ];
  for (const [raw, kind] of cases) {
    assert.equal(saveErrorKind(raw), kind, raw);
    const sentence = explainSaveError(raw);
    assert.doesNotMatch(sentence, /E[A-Z]{3,}|Error|—/, "no code, no English, no dash");
    assert.ok(saveErrorShort(raw).length < 40);
  }
  assert.equal(
    saveErrorDetail(ipc("EPERM: operation not permitted, rename 'a' -> 'b'")),
    "EPERM: operation not permitted, rename 'a' -> 'b'",
  );
});
