import assert from "node:assert/strict";
import { test } from "node:test";
import { agree, plural } from "../src/shared/plural.ts";

test("counts agree with their words, without (s)", () => {
  assert.equal(plural(1, "arquivo", "arquivos"), "1 arquivo");
  assert.equal(plural(2, "arquivo", "arquivos"), "2 arquivos");
  assert.equal(plural(0, "corte", "cortes"), "0 cortes");
  assert.equal(`${1} de 1 ${agree(1, "pronta", "prontas")}`, "1 de 1 pronta");
  assert.equal(`0 de 3 ${agree(3, "pronta", "prontas")}`, "0 de 3 prontas");
});
