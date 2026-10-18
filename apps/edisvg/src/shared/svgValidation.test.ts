import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSvgNumbers } from "./svgValidation.ts";

test("numeric SVG validation rejects nonfinite, malformed, out-of-budget and negative dimensions", () => {
  for (const [name, value] of [
    ["x", "1e999"],
    ["width", "-1"],
    ["height", "1..2"],
    ["r", "Infinity"],
    ["opacity", "2"],
    ["opacity", "2px"],
    ["points", "1 2 3"],
    ["points", "1,,2"],
    ["transform", "translate( )"],
    ["transform", "translate(1,,2)"],
    ["transform", "matrix(1e999 0 0 1 0 0)"],
    ["transform", "constructor(1)"],
    ["transform", "rotate(1 2)"],
  ]) {
    if (!name || value === undefined) throw new Error("Invalid test case");
    assert.throws(() => validateSvgNumbers(name, value), name + ": " + value);
  }
  for (const [name, value] of [
    ["x", "-2.5%"],
    ["width", "10px"],
    ["opacity", "50%"],
    ["points", "0, 1 2,3"],
    ["transform", "matrix(1 0 0 1 0 0) rotate(45 10 20)"],
  ]) {
    if (!name || value === undefined) throw new Error("Invalid test case");
    validateSvgNumbers(name, value);
  }
});
