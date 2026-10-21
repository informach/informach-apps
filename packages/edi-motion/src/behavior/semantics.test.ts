import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { semanticAttributes } from "../visual/semantics";
import {
  createBehaviorContext,
  createBehaviorSession,
  evaluateBehavior,
  setBehaviorInput,
} from "./engine";
import { type Behavior, emptyBehavior, semanticValue } from "./model";

const objects = new Map([
  [
    "node-score",
    {
      tag: "g",
      transform: identityTransform(),
      semantics: {
        kind: "group" as const,
        label: "Placar",
        description: "Pontos da partida",
        live: "polite" as const,
      },
    },
  ],
  ["node-plain", { tag: "rect", transform: identityTransform() }],
]);
function behavior(bindings: Behavior["bindings"]): Behavior {
  return {
    ...emptyBehavior(),
    inputs: [
      { id: "input-points", name: "Pontos", kind: "number", min: 0, max: 100000, initial: 0 },
      { id: "input-done", name: "Fim", kind: "boolean", initial: false },
      { id: "input-go", name: "Ir", kind: "trigger" },
    ],
    bindings,
  };
}
const label = {
  id: "binding-label",
  kind: "semantics" as const,
  inputId: "input-points",
  targetId: "node-score",
  property: "label" as const,
  template: "Placar: {valor} pontos",
  direction: "one-way" as const,
};

test("bound names and descriptions follow inputs through their template", () => {
  const context = createBehaviorContext(
    behavior([
      label,
      {
        ...label,
        id: "binding-description",
        inputId: "input-done",
        property: "description",
        template: "Partida encerrada: {valor}",
      },
    ]),
    [],
    objects,
  );
  let session = createBehaviorSession(context);
  expect(evaluateBehavior(context, session).semantics.get("node-score")).toEqual({
    label: "Placar: 0 pontos",
    description: "Partida encerrada: não",
  });
  session = setBehaviorInput(context, session, "input-points", 1234.5);
  session = setBehaviorInput(context, session, "input-done", true);
  expect(evaluateBehavior(context, session).semantics.get("node-score")).toEqual({
    label: "Placar: 1.234,5 pontos",
    description: "Partida encerrada: sim",
  });
  expect(semanticValue("texto")).toBe("texto");
});

test("semantic bindings need a named object, a single slot and a value input", () => {
  const refuse = (bindings: unknown[], message: RegExp) =>
    expect(() => createBehaviorContext({ ...behavior([]), bindings }, [], objects)).toThrow(
      message,
    );
  refuse([{ ...label, targetId: "node-plain" }], /nome acessível/);
  refuse([{ ...label, inputId: "input-go" }], /input de texto/);
  refuse([{ ...label, template: "sem espaço" }], /único \{valor\}/);
  refuse([{ ...label, template: "{valor} e {valor}" }], /único \{valor\}/);
  refuse([label, { ...label, id: "binding-again" }], /conflitantes/);
  expect(semanticAttributes(objects.get("node-score")?.semantics, true)["aria-live"]).toBe(
    "polite",
  );
  expect(semanticAttributes(objects.get("node-score")?.semantics, false)["aria-live"]).toBe(
    undefined,
  );
});
