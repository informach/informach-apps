import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { visualContentSchema, visualSceneSchema } from "./model";

test("portable visual content separates spatial data and rejects unsafe text, attrs and scene metadata", () => {
  expect(
    visualContentSchema.parse({
      attrs: { fill: "#112233", x: "3" },
      text: "Açúcar 🦊",
      visible: true,
      textLayout: { lineHeight: 1.2 },
    }).textLayout?.lineHeight,
  ).toBe(1.2);
  for (const attrs of [
    { d: "M0 0L1" },
    { transform: "translate(1)" },
    { href: "https://unsafe.test" },
    { style: "color:red" },
  ])
    expect(visualContentSchema.safeParse({ attrs, text: "", visible: true }).success).toBe(false);
  expect(visualContentSchema.safeParse({ attrs: {}, text: "\ud800", visible: true }).success).toBe(
    false,
  );
  expect(
    visualSceneSchema.parse({
      viewBox: [0, 0, 100, 100],
      preserveAspectRatio: "xMidYMid meet",
      globalTransform: identityTransform(),
    }).viewBox,
  ).toEqual([0, 0, 100, 100]);
  expect(
    visualSceneSchema.safeParse({
      viewBox: [0, 0, 0, 100],
      preserveAspectRatio: "none",
      globalTransform: identityTransform(),
    }).success,
  ).toBe(false);
});
