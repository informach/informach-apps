import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { describeVisualScene } from "./describe";
import { serializeVisualElement } from "./serialize";
import { resolveTextDirection } from "./textDirection";

test("the first strong character outside isolates sets the base direction", () => {
  expect(resolveTextDirection("שלום abc")).toBe("rtl");
  expect(resolveTextDirection("abc مرحبا")).toBe("ltr");
  expect(resolveTextDirection("123 — مرحبا")).toBe("rtl");
  expect(resolveTextDirection("  ")).toBe("ltr");
  expect(resolveTextDirection("⁧abc⁩ ש")).toBe("rtl");
  expect(resolveTextDirection("‏abc")).toBe("rtl");
  expect(resolveTextDirection("‎שלום")).toBe("ltr");
  expect(resolveTextDirection("ܫܠܡܐ")).toBe("rtl");
});

test("auto text writes the resolved direction on the text element", () => {
  const svg = (text: string) =>
    serializeVisualElement(
      describeVisualScene(
        {
          viewBox: [0, 0, 100, 100],
          nodes: [
            {
              id: "node-text",
              tag: "text",
              attrs: { x: "10", y: "20" },
              text,
              transform: identityTransform(),
              visible: true,
              children: [],
              textDirection: "auto",
            },
          ],
        },
        [],
        { mode: "static" },
      ),
    );
  expect(svg("שלום")).toMatch(/<text[^>]* direction="rtl"/);
  expect(svg("Olá")).toMatch(/<text[^>]* direction="ltr"/);
});
