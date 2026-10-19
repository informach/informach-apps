import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSvgInlineStyle } from "./svg-inline-style";

test("inline SVG importance is resolved before source order without omitting overridden values from validation", () => {
  const declarations = parseSvgInlineStyle(
    "Fill:red !IMPORTANT;fill:blue;fill:green ! important;opacity: .5;opacity:1",
    new Set(["fill", "opacity"]),
  );
  assert.deepEqual(
    declarations.map((item) => item.apply),
    [true, false, true, true, true],
  );
  assert.equal(declarations[1]?.value, "blue");
  const result = new Map<string, string>();
  for (const item of declarations) if (item.apply) result.set(item.name, item.value);
  assert.deepEqual(
    [...result],
    [
      ["fill", "green"],
      ["opacity", "1"],
    ],
  );
});
test("inline SVG refuses unknown properties and syntax/size outside its closed profile", () => {
  const allowed = new Set(["fill"]);
  for (const raw of [
    "fill:",
    "fill:red !broken",
    "fill:red/*x*/",
    "fill:red;unknown:blue",
    "--fill:red",
    "fill:red{color:blue}",
    "fill:var(\\66oo)",
    "fill:red;".repeat(257),
    " ".repeat(500001),
  ])
    assert.throws(() => parseSvgInlineStyle(raw, allowed));
  assert.deepEqual(parseSvgInlineStyle(";; fill: red; ;", allowed), [
    { name: "fill", value: "red", apply: true },
  ]);
});
