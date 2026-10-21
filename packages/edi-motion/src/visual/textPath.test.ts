import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { describeVisualScene } from "./describe";
import { serializeVisualElement } from "./serialize";
import { textPathCost, textPathLength, textPathSchema } from "./textPath";

test("a text path renders its own curve definition and the text inside textPath", () => {
  const svg = serializeVisualElement(
    describeVisualScene(
      {
        viewBox: [0, 0, 200, 100],
        nodes: [
          {
            id: "node-label",
            tag: "text",
            attrs: { "font-size": "12" },
            text: "Ao longo & da curva",
            transform: identityTransform(),
            visible: true,
            children: [],
            textPath: { d: "M10 80 C60 10 140 10 190 80", startOffset: 25 },
          },
        ],
      },
      [],
      { mode: "runtime" },
    ),
  );
  expect(svg).toContain(
    '<defs><path id="edi-text-path-node-label" d="M10 80 C60 10 140 10 190 80"></path></defs>',
  );
  expect(svg).toMatch(
    /<text font-size="12"><textPath href="#edi-text-path-node-label" startOffset="25%">Ao longo &amp; da curva<\/textPath><\/text>/,
  );
});

test("curves are validated, bounded and measurable", () => {
  expect(() => textPathSchema.parse({ d: "M0 0 Q", startOffset: 0 })).toThrow();
  expect(() => textPathSchema.parse({ d: "M0 0 L10 0", startOffset: 101 })).toThrow();
  const long = `M0 0${" L1 1".repeat(4000)}`;
  expect(() => textPathSchema.parse({ d: long, startOffset: 0 })).toThrow(/4000/);
  expect(textPathCost({ d: "M0 0 L30 0 L30 40", startOffset: 0 })).toBe(3);
  expect(textPathLength("M0 0 L30 0 L30 40")).toBeCloseTo(70, 6);
});
