import assert from "node:assert/strict";
import test from "node:test";
import { hexToHsv, hsvToHex, normalizeHex } from "./paint-color";

test("aceita hex curto e preserva as cores ao percorrer o seletor visual", () => {
  assert.equal(normalizeHex(" #F3A "), "#ff33aa");
  assert.equal(normalizeHex("red"), null);
  for (const color of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#4fe3c1", "#7a8193"])
    assert.equal(hsvToHex(hexToHsv(color)), color);
});

test("matiz circular, saturação e luminosidade respeitam os limites do seletor", () => {
  assert.equal(hsvToHex({ hue: 360, saturation: 100, value: 100 }), "#ff0000");
  assert.equal(hsvToHex({ hue: 120, saturation: 100, value: 100 }), "#00ff00");
  assert.equal(hsvToHex({ hue: 240, saturation: 100, value: 100 }), "#0000ff");
  assert.equal(hsvToHex({ hue: 45, saturation: 0, value: 50 }), "#808080");
  assert.equal(hsvToHex({ hue: 45, saturation: 100, value: 0 }), "#000000");
});
