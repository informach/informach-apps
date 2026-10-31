import { describe, expect, it } from "vitest";
import {
  ANIMATION_ARTIFACT_BYTES,
  animationControls,
  parseAnimationArtifact,
  serializeAnimationArtifact,
} from "./animationArtifact";
import { emptyBehavior } from "./behavior/model";
import { INTERACTIVE_VERSION } from "./interactiveDocument";
import { emptyMotion, identityTransform } from "./model";

function artifact() {
  return {
    format: "edi-animation",
    version: 1,
    title: "Desenho de teste",
    fit: "contain",
    autoplay: false,
    respectReducedMotion: true,
    pauseOffscreen: true,
    document: {
      version: INTERACTIVE_VERSION,
      playback: {
        version: 3,
        motion: emptyMotion(),
        objects: [
          {
            id: "node-square",
            tag: "rect",
            parentId: null,
            transform: identityTransform(),
            basis: [1, 0, 0, 1, 0, 0],
            attributeMatrix: [1, 0, 0, 1, 0, 0],
          },
        ],
        drivers: [],
        sources: [
          {
            id: "node-square",
            objectId: "node-square",
            artboardId: "artboard-main",
            instancePath: [],
          },
        ],
        rigScopes: [],
      },
      behavior: emptyBehavior(),
      content: [
        {
          id: "node-square",
          name: "Quadrado",
          tag: "rect",
          parentId: null,
          visual: {
            attrs: { x: "0", y: "0", width: "10", height: "10", fill: "#112233" },
            text: "",
            visible: true,
          },
        },
      ],
      visual: {
        viewBox: [0, 0, 100, 100],
        preserveAspectRatio: "xMidYMid meet",
        globalTransform: identityTransform(),
      },
      assets: [],
    },
  };
}

describe("portable animation artifact", () => {
  it("round trips the whole declarative document deterministically without an editor or DOM", () => {
    const source = artifact(),
      before = structuredClone(source);
    const text = serializeAnimationArtifact(source);
    expect(serializeAnimationArtifact(parseAnimationArtifact(text))).toBe(text);
    expect(parseAnimationArtifact(text).document.visual?.viewBox).toEqual([0, 0, 100, 100]);
    expect(source).toEqual(before);
  });

  it("rejects editor projects, newer envelopes, unexpected code and incomplete geometry", () => {
    expect(() => parseAnimationArtifact({ version: 25, artboards: [] })).toThrow();
    expect(() => parseAnimationArtifact({ ...artifact(), version: 2 })).toThrow();
    expect(() => parseAnimationArtifact({ ...artifact(), script: "alert(1)" })).toThrow();
    const missing = artifact();
    Reflect.deleteProperty(missing.document, "visual");
    expect(() => parseAnimationArtifact(missing)).toThrow(/metadados|visual/);
    const empty = artifact();
    empty.document.content = [];
    empty.document.playback.objects = [];
    empty.document.playback.sources = [];
    expect(() => parseAnimationArtifact(empty)).toThrow(/vazia/);
  });

  it("bounds bytes, depth and cycles before schema traversal", () => {
    expect(() => parseAnimationArtifact(" ".repeat(ANIMATION_ARTIFACT_BYTES + 1))).toThrow(
      /tamanho/,
    );
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => parseAnimationArtifact(cycle)).toThrow(/circular/);
    let nested: unknown = 0;
    for (let i = 0; i < 140; i++) nested = { nested };
    expect(() => parseAnimationArtifact(nested)).toThrow(/profundidade/);
  });

  it("publishes unambiguous input names and event names without trusting aliases from uploads", () => {
    const source = artifact();
    const behavior = {
      ...emptyBehavior(),
      inputs: [
        { id: "input-open", name: "open", kind: "trigger" as const },
        { id: "input-opened", name: "opened", kind: "boolean" as const, initial: false },
      ],
    };
    const parsed = parseAnimationArtifact({
      ...source,
      document: { ...source.document, behavior },
    });
    expect(animationControls(parsed).inputs).toEqual([
      { name: "open", id: "input-open", kind: "trigger" },
      { name: "opened", id: "input-opened", kind: "boolean" },
    ]);
    expect(animationControls(parsed).events).toEqual([]);
    behavior.inputs[1] = { id: "input-another", name: "open", kind: "trigger" };
    expect(() =>
      parseAnimationArtifact({ ...source, document: { ...source.document, behavior } }),
    ).toThrow(/nomes repetidos/);
  });
});
