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
    // The atomic write's rename refused: another program holds the lesson's file.
    [ipc("EPERM: operation not permitted, rename 'a.tmp' -> 'a.ediaula'"), "busy"],
    [ipc("EBUSY: resource busy or locked, rename 'a.tmp' -> 'a.ediaula'"), "busy"],
    [ipc("EPERM: operation not permitted, open 'C:/aulas/.a.ediaula.tmp'"), "permission"],
    [ipc("EACCES: permission denied, open 'C:/aulas/a.ediaula'"), "permission"],
    [ipc("ENOSPC: no space left on device, write"), "full"],
    [ipc("ENOENT: no such file or directory, open 'E:/aula.ediaula'"), "drive"],
    [ipc("UNKNOWN: unknown error, open '//servidor/aulas/a.ediaula'"), "drive"],
    [ipc("Unexpected token in JSON"), "other"],
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

test("the app's own words, already in Portuguese, are shown as they are", () => {
  const raw = ipc("O projeto passou do limite de 100 mil itens por chamada.");
  assert.equal(saveErrorKind(raw), "message");
  assert.equal(explainSaveError(raw), "O projeto passou do limite de 100 mil itens por chamada.");
  assert.equal(saveErrorShort(raw), "O projeto passou do limite de 100 mil itens por chamada.");
});
