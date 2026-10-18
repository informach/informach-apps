import { expect, test } from "vitest";
import { type Animation, identityTransform } from "../model";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  evaluateBehavior,
} from "./engine";
import { emptyBehavior } from "./model";

test("animation-only scenes use the real clip/driver clocks and emit timeline events without fabricated states or layers", () => {
  const animation: Animation = {
      id: "animation-main",
      name: "Movimento",
      fps: 10,
      frames: 10,
      mode: "loop",
      tracks: [
        {
          id: "track-x",
          targetId: "node-a",
          property: "x",
          keys: [
            { id: "key-a", frame: 0, value: 0, easing: "linear" },
            { id: "key-b", frame: 10, value: 100, easing: "linear" },
          ],
        },
      ],
    },
    objects = new Map([["node-a", { tag: "rect", transform: identityTransform() }]]);
  const behavior = {
    ...emptyBehavior(),
    events: [
      { id: "event-zero", animationId: animation.id, frame: 0, name: "Início", data: {} },
      { id: "event-half", animationId: animation.id, frame: 5, name: "Metade", data: {} },
    ],
  };
  const context = createBehaviorContext(behavior, [animation], objects, {
      animationId: animation.id,
    }),
    source = createBehaviorSession(context),
    first = advanceBehavior(context, source, 0.5);
  expect(first.frame.poses.get("node-a")?.x).toBe(50);
  expect(first.events.map((value) => [value.name, value.layerId, value.stateId])).toEqual([
    ["Início", null, null],
    ["Metade", null, null],
  ]);
  expect(advanceBehavior(context, first.session, 0).events).toEqual([]);
  expect(evaluateBehavior(context, source).poses.get("node-a")?.x).toBe(0);
  expect(advanceBehavior(context, first.session, 0.6).events.map((value) => value.name)).toEqual([
    "Início",
  ]);
  expect(source.animationEntered).toBe(true);
});
