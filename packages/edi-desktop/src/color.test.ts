import { expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "./color.ts";

it("accepts short hex and keeps colors through the visual picker", () => {
  expect(normalizeHex(" #F3A ")).toBe("#ff33aa");
  expect(normalizeHex("red")).toBeNull();
  for (const color of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#4fe3c1", "#7a8193"])
    expect(hsvToHex(hexToHsv(color))).toBe(color);
});

it("wraps the hue and keeps saturation and brightness in range", () => {
  expect(hsvToHex({ hue: 360, saturation: 100, value: 100 })).toBe("#ff0000");
  expect(hsvToHex({ hue: 120, saturation: 100, value: 100 })).toBe("#00ff00");
  expect(hsvToHex({ hue: 240, saturation: 100, value: 100 })).toBe("#0000ff");
  expect(hsvToHex({ hue: 45, saturation: 0, value: 50 })).toBe("#808080");
  expect(hsvToHex({ hue: 45, saturation: 100, value: 0 })).toBe("#000000");
});
