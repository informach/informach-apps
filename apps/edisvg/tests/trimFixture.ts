import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { newProject } from "../src/shared/project";

export function trimFixture(authored = true) {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    boardId = project.defaultArtboardId;
  if (!boardId) throw new Error("Missing trim board");
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      {
        projectId: project.id,
        revision,
        sessionId,
        commands,
      },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  const shapeId = run([
    {
      type: "scene",
      operation: "add",
      targetId: null,
      value: {
        tag: "path",
        attrs: {
          d: "M20 80 C20 80 220 80 220 80",
          fill: "none",
          stroke: "#e05010",
          "stroke-width": "8",
        },
      },
    },
  ]).selected;
  if (!shapeId) throw new Error("Missing trim path");
  const animationId = "animation-trim";
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: animationId,
          name: "Recorte",
          fps: 10,
          frames: 10,
          mode: "once",
          tracks: [],
        },
      },
    },
  ]);
  if (authored)
    run([
      {
        type: "rig",
        operation: "replace",
        value: {
          version: 3,
          bones: [],
          constraints: [],
          targets: [],
          trims: [
            {
              id: "trim-draw",
              targetId: shapeId,
              start: 0,
              end: 1,
              offset: 0,
              tolerance: 0.001,
              mode: "parallel",
            },
          ],
          parameterClips: [
            {
              animationId,
              tracks: [
                {
                  id: "track-draw",
                  targetId: "trim-draw",
                  property: "end",
                  keys: [
                    { id: "key-draw-start", frame: 0, value: 0, easing: "linear" },
                    { id: "key-draw-end", frame: 10, value: 1, easing: "linear" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
  return { project: () => project, run, boardId, shapeId, animationId };
}
