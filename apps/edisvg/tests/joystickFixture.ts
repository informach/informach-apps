import assert from "node:assert/strict";
import { type Behavior, emptyBehavior } from "@informach/edi-motion/behavior";
import { rigFixture } from "./rigFixture";

export function joystickFixture(options: { animated?: boolean; bindings?: boolean } = {}) {
  const fixture = rigFixture(),
    added = fixture.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: {
          tag: "path",
          attrs: {
            d: "M0 -10C0 -10 100 -10 100 -10C100 -10 200 -10 200 -10C200 -10 200 10 200 10C200 10 100 10 100 10C100 10 0 10 0 10C0 10 0 -10 0 -10Z",
            fill: "#3050a0",
            stroke: "none",
          },
        },
      },
    ]).selected;
  assert.ok(added);
  fixture.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-joystick",
      targetId: added,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const rig = fixture.project().artboards[0]?.rig;
  assert.ok(rig);
  const joystickId = "joystick-hand",
    targetId = "node-target";
  fixture.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...rig,
        version: 4,
        joysticks: [
          {
            id: joystickId,
            name: "Mão",
            targetId,
            x: 0,
            y: 0,
            rangeX: 40,
            rangeY: 40,
            limit: "circle",
          },
        ],
        ...(options.animated
          ? {
              parameterClips: [
                {
                  animationId: fixture.clipId,
                  tracks: ["x", "y"].map((property) => ({
                    id: `track-joystick-${property}`,
                    targetId: joystickId,
                    property,
                    keys: [
                      { id: `key-joystick-${property}-a`, frame: 0, value: 0, easing: "linear" },
                      {
                        id: `key-joystick-${property}-b`,
                        frame: 10,
                        value: property === "x" ? 1 : -1,
                        easing: "linear",
                      },
                    ],
                  })),
                },
              ],
            }
          : {}),
      },
    },
  ]);
  if (options.bindings) {
    const behavior: Behavior = {
      ...emptyBehavior(),
      version: 2,
      inputs: ["x", "y"].map((axis) => ({
        id: `input-joystick-${axis}`,
        name: `Mão ${axis.toUpperCase()}`,
        kind: "number",
        initial: 0,
        min: -1,
        max: 1,
      })),
      bindings: (["x", "y"] as const).map((property) => ({
        id: `binding-joystick-${property}`,
        kind: "parameter",
        inputId: `input-joystick-${property}`,
        targetId: joystickId,
        property,
        direction: "one-way",
        scale: 1,
        offset: 0,
      })),
    };
    fixture.run([{ type: "behavior", operation: "replace", value: behavior }]);
  }
  return { ...fixture, boardId: fixture.rootId, joystickId, targetId, shapeId: added };
}
