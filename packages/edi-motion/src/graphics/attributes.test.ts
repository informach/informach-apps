import { expect, test } from "vitest";
import { isXmlText } from "../xmlText";
import { svgAttributesSchema, validAttributes } from "./attributes";
import { parseSvgOpacity } from "./svgValidation";

test("SVG alpha parsing shares the numeric policy and never treats blank/unsupported CSS as zero", () => {
  expect(parseSvgOpacity(undefined)).toBe(1);
  expect(parseSvgOpacity("50%")).toBe(0.5);
  expect(parseSvgOpacity(" .25 ")).toBe(0.25);
  expect(parseSvgOpacity("1e-2")).toBe(0.01);
  for (const value of [
    "",
    " ",
    "inherit",
    "NaN",
    "Infinity",
    "1px",
    "101%",
    "-1",
    "2",
    "0x1",
    "1".repeat(81),
  ])
    expect(() => parseSvgOpacity(value)).toThrow();
});

test("portable visual attributes share the safe authoring whitelist, numeric bounds and XML Unicode policy", () => {
  const values = { x: "12px", fill: "#123456", "font-family": "Fonte 🦊", transform: "rotate(12)" };
  expect(validAttributes(values)).toEqual(values);
  expect(svgAttributesSchema.parse(values)).toEqual(values);
  for (const invalid of [
    { onload: "alert(1)" },
    { href: "https://unsafe.test" },
    { fill: "url(#typed-only)" },
    { fill: "var(--external-paint)" },
    { width: "-1" },
    { opacity: "2" },
    { "font-family": "\u0000" },
    { "font-family": "\ud800" },
    { "font-family": "\ufffe" },
  ]) {
    expect(() => validAttributes(invalid)).toThrow();
    expect(svgAttributesSchema.safeParse(invalid).success).toBe(false);
  }
  expect(isXmlText("Açúcar\n🦊\tمرحبا")).toBe(true);
  expect(isXmlText("\ud800")).toBe(false);
  const large = Object.fromEntries(
    Array.from({ length: 10000 }, (_, index) => [`key-${index}`, "value"]),
  );
  expect(() => validAttributes(large)).toThrow(/excessivos/);
  expect(svgAttributesSchema.safeParse(large).success).toBe(false);
});
