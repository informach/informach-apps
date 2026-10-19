import { propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { applyComponent } from "../src/shared/components";
import { newProject, parseProject } from "../src/shared/project";
import { editScene } from "../src/shared/scene.js";

export function independentComponentsFixture() {
  const project = newProject(),
    root = project.artboards[0];
  if (!root) throw new Error("Missing root");
  const master = { ...structuredClone(root), id: "artboard-master", name: "Master" };
  project.artboards.push(master);
  const body = editScene(master.scene, null, "add", "rect"),
    text = editScene(master.scene, null, "add", "text");
  if (!body || !text) throw new Error("Missing objects");
  editScene(master.scene, text, "text-layout", { lineHeight: 1.2 });
  master.behavior = {
    ...emptyBehavior(),
    defaultMachineId: "machine-main",
    inputs: [
      { id: "input-click", kind: "trigger", name: "Click" },
      { id: "input-name", kind: "string", name: "Name", initial: "Ana" },
    ],
    bindings: [
      {
        id: "binding-name",
        inputId: "input-name",
        targetId: text,
        kind: "text",
        direction: "two-way",
      },
    ],
    listeners: [
      {
        id: "listener-click",
        targetId: body,
        event: "activate",
        actions: [{ kind: "trigger", inputId: "input-click" }],
      },
    ],
    machines: [
      {
        id: "machine-main",
        name: "Main",
        layers: [
          {
            id: "layer-main",
            name: "Main",
            entryStateId: "state-idle",
            targetIds: [],
            properties: [...propertySchema.options],
            weight: 1,
            mode: "override",
            states: [
              { id: "state-idle", name: "Idle", kind: "base", speed: 1, x: 0, y: 0 },
              {
                id: "state-wave",
                name: "Wave",
                kind: "animation",
                animationId: "animation-wave",
                speed: 1,
                x: 200,
                y: 0,
              },
            ],
            transitions: [
              {
                id: "transition-wave",
                from: "state-idle",
                to: "state-wave",
                priority: 0,
                exitAt: null,
                duration: 0,
                easing: "linear",
                interrupt: "never",
                conditions: [{ inputId: "input-click", operator: "trigger" }],
              },
            ],
          },
        ],
      },
    ],
    events: [{ id: "event-wave", animationId: "animation-wave", frame: 1, name: "wave", data: {} }],
    data: {
      version: 1,
      models: [
        {
          id: "model-person",
          name: "Person",
          fields: [{ id: "field-name", name: "Name", kind: "string" }],
        },
      ],
      instances: [
        {
          id: "instance-person",
          name: "Person",
          modelId: "model-person",
          value: { "field-name": "Ana" },
        },
      ],
      links: [
        {
          id: "link-name",
          instanceId: "instance-person",
          path: ["field-name"],
          inputId: "input-name",
          direction: "two-way",
        },
      ],
    },
  };
  project.motion.animations.push({
    id: "animation-wave",
    name: "Wave",
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [
      {
        id: "track-wave",
        targetId: body,
        property: "x",
        keys: [
          { id: "key-start", frame: 0, value: 0, easing: "linear" },
          { id: "key-end", frame: 10, value: 100, easing: "linear" },
        ],
      },
    ],
  });
  const instances = [0, 1].map((index) => {
    const id = applyComponent(root.scene, {
        type: "component",
        operation: "create",
        name: `Instance ${index}`,
        instance: {
          artboardId: master.id,
          animationId: null,
          width: 200,
          height: 200,
          fit: "contain",
          speed: 1,
          offsetSeconds: 0,
          overrides: [],
        },
      }),
      node = root.scene.nodes.find((node) => node.id === id);
    if (!node) throw new Error("Missing instance");
    node.transform.x = index * 220;
    return node.id;
  });
  return {
    project: parseProject(project),
    rootId: root.id,
    masterId: master.id,
    instances,
    body,
    text,
  };
}
