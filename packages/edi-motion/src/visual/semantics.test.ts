import { expect, test } from "vitest";
import {
  type SemanticNode,
  semanticAttributes,
  semanticSchema,
  validateSemanticInteractions,
} from "./semantics";

test("semantics are strict bounded XML text and static exports never advertise inactive buttons", () => {
  const metadata = semanticSchema.parse({
    kind: "button",
    label: 'Ativar <texto> & "ação"',
    description: "Uma ação real",
  });
  if (metadata.kind !== "button") throw new Error("Expected button fixture");
  expect(semanticAttributes(metadata, true)).toEqual({
    role: "button",
    "aria-label": metadata.label,
  });
  expect(semanticAttributes(metadata, false).role).toBe("group");
  expect(semanticAttributes({ kind: "decorative" }, true)).toEqual({ "aria-hidden": "true" });
  for (const input of [
    { kind: "button", label: " " },
    { kind: "image", label: "x".repeat(501) },
    { kind: "group", label: "x", description: "x".repeat(2001) },
    { kind: "image", label: "bad\u0001" },
    { kind: "decorative", label: "hidden" },
    { kind: "button", label: "x", tabindex: "1" },
  ])
    expect(semanticSchema.safeParse(input).success).toBe(false);
});
test("expanded semantic ancestry rejects hidden/flattened controls and buttons without activation", () => {
  const nodes: SemanticNode[] = [
    { id: "node-parent", parentId: null, semantics: { kind: "group", label: "Grupo" } },
    { id: "node-viewport", parentId: "node-parent" },
    { id: "node-child", parentId: "node-viewport", semantics: { kind: "button", label: "Ação" } },
  ];
  const targets = new Set(["node-child"]),
    activated = new Set(["node-child"]);
  expect(() => validateSemanticInteractions(nodes, targets, activated)).not.toThrow();
  expect(() => validateSemanticInteractions(nodes, targets, new Set())).toThrow(/ativação/);
  expect(() =>
    validateSemanticInteractions(
      [{ id: "node-parent", parentId: null }, ...nodes.slice(1)],
      targets,
      new Set(["node-parent", "node-child"]),
    ),
  ).toThrow(/esconderia/);
  for (const semantics of [
    semanticSchema.parse({ kind: "decorative" }),
    semanticSchema.parse({ kind: "image", label: "Imagem" }),
    semanticSchema.parse({ kind: "button", label: "Pai" }),
  ]) {
    expect(() =>
      validateSemanticInteractions(
        [{ id: "node-parent", parentId: null, semantics }, ...nodes.slice(1)],
        targets,
        new Set([...activated, "node-parent"]),
      ),
    ).toThrow(/esconderia/);
  }
  expect(() =>
    validateSemanticInteractions(
      nodes,
      new Set(["node-parent"]),
      new Set(["node-parent", "node-child"]),
    ),
  ).toThrow(/configurado como botão/);
});
test("semantic traversal is bounded and fails on missing targets/parents and excessive text", () => {
  expect(() => validateSemanticInteractions([], new Set(["node-missing"]), new Set())).toThrow(
    /ausente/,
  );
  expect(() =>
    validateSemanticInteractions(
      [{ id: "node-a", parentId: "node-a" }],
      new Set(["node-a"]),
      new Set(),
    ),
  ).toThrow(/cíclica/);
  expect(() =>
    validateSemanticInteractions(
      [{ id: "node-a", parentId: "node-missing" }],
      new Set(["node-a"]),
      new Set(),
    ),
  ).toThrow(/Pai/);
  const excessive = Array.from({ length: 1000 }, (_, index) => ({
    id: `node-${index}`,
    parentId: null,
    semantics: semanticSchema.parse({
      kind: "group",
      label: "x".repeat(500),
      description: "x".repeat(2000),
    }),
  }));
  expect(() => validateSemanticInteractions(excessive, new Set(), new Set())).toThrow(/textual/);
});
