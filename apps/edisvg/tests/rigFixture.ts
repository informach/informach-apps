import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { newProject } from "../src/shared/project";

export function rigFixture() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID();
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, sessionId, revision, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  run([
    {
      type: "rig",
      operation: "create-bone",
      id: "node-upper",
      name: "Braço",
      parentId: null,
      x: 0,
      y: 0,
      rotation: 0,
      length: 100,
    },
    {
      type: "rig",
      operation: "create-bone",
      id: "node-lower",
      name: "Antebraço",
      parentId: "node-upper",
      x: 100,
      y: 0,
      rotation: 0,
      length: 100,
    },
    { type: "rig", operation: "create-target", id: "node-target", name: "Mão", x: 100, y: 100 },
    { type: "scene", operation: "add", targetId: null, value: "rect" },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-rig",
          name: "Alcançar",
          frames: 10,
          fps: 10,
          mode: "once",
          tracks: [],
        },
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-rig",
        targetId: "node-target",
        property: "x",
        frame: 0,
        value: 100,
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-rig",
        targetId: "node-target",
        property: "x",
        frame: 10,
        value: 0,
      },
    },
  ]);
  const board = project.artboards[0];
  if (!board?.rig) throw new Error("Missing rig");
  run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...board.rig,
        constraints: [
          {
            id: "constraint-hand",
            kind: "ik",
            chain: ["node-upper", "node-lower"],
            targetId: "node-target",
            strength: 1,
            bend: "positive",
            tolerance: 0.001,
            iterations: 64,
          },
        ],
      },
    },
  ]);
  return { project: () => project, run, rootId: board.id, clipId: "animation-rig" };
}
