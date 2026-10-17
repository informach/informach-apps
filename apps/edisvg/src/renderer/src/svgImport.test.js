import assert from "node:assert/strict";
import { test } from "node:test";
import { importSvg } from "./svgImport.js";

test("imports dimensioned SVG roots while retaining shape dimensions and inherited fill", () => {
  const element = (localName, values, children = []) => ({
    localName,
    namespaceURI: "http://www.w3.org/2000/svg",
    attributes: Object.entries(values).map(([name, value]) => ({ name, value })),
    getAttribute: (name) => values[name] ?? null,
    children,
    textContent: "",
  });
  const root = element("svg", { width: "640px", height: "480", fill: "#123456" }, [
    element("rect", { id: "box", x: "10", width: "80", height: "40" }),
  ]);
  class ParsedDocument {
    parseFromString() {
      return { querySelector: () => null, documentElement: root };
    }
  }
  const scene = importSvg("<svg/>", ParsedDocument);
  assert.deepEqual(scene.viewBox, [0, 0, 640, 480]);
  assert.deepEqual(scene.nodes[0].attrs, { fill: "#123456" });
  assert.equal(scene.nodes[0].children[0].attrs.width, "80");
  assert.equal(scene.nodes[0].children[0].name, "box");
});
test("rejects declarations and oversized sources before parsing XML", () => {
  class ForbiddenParser {
    constructor() {
      throw new Error("Parser must not be called");
    }
  }
  assert.throws(
    () => importSvg('<!DOCTYPE svg SYSTEM "file:///private"><svg/>', ForbiddenParser),
    /entidades/,
  );
  assert.throws(() => importSvg('<!ENTITY x "test">', ForbiddenParser), /entidades/);
  assert.throws(() => importSvg("x".repeat(1500001), ForbiddenParser), /grande/);
});
