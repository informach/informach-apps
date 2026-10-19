import { expect, test } from "vitest";
import { parseSolidSvgColor } from "./color";

test("solid SVG color conversion preserves alpha and basic/numeric notation without DOM", () => {
  expect(parseSolidSvgColor(" RED ")).toEqual({ color: "#ff0000", alpha: 1 });
  expect(parseSolidSvgColor("#f008")).toEqual({ color: "#ff0000", alpha: 136 / 255 });
  expect(parseSolidSvgColor("#ABCDEF80")).toEqual({ color: "#abcdef", alpha: 128 / 255 });
  expect(parseSolidSvgColor("rgba(10, 20, 30, .5)")).toEqual({
    color: "#0a141e",
    alpha: 128 / 255,
  });
  for (const alpha of [0.1, 0.25, 0.75, 0.9])
    expect(parseSolidSvgColor(`rgba(10,20,30,${alpha})`).alpha).toBe(Math.round(alpha * 255) / 255);
  expect(parseSolidSvgColor("rgb(255,0,4)")).toEqual({ color: "#ff0004", alpha: 1 });
  expect(parseSolidSvgColor("transparent")).toEqual({ color: "#000000", alpha: 0 });
});
test("solid color profile rejects dynamic/external, ambiguous, invalid and excessive values", () => {
  for (const input of [
    "none",
    "__proto__",
    "constructor",
    "inherit",
    "currentColor",
    "var(--color)",
    "url(#color)",
    "rgb(300,0,0)",
    "rgba(1,2,3,1.5)",
    "rgba(1,2,3,0..5)",
    "rgba(1,2,3)",
    "rgb(1,2,3,.5)",
    "color(display-p3 1 0 0)",
    " ".repeat(501),
  ])
    expect(() => parseSolidSvgColor(input)).toThrow();
});
