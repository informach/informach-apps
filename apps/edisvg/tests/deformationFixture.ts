import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { newProject } from "../src/shared/project";

export function deformationFixture(authored = true) {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    rootId = project.defaultArtboardId;
  if (!rootId) throw new Error("Missing board");
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, sessionId, revision, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  const add = (d: string, name: string) => {
    const result = run([
        {
          type: "scene",
          operation: "add",
          targetId: null,
          value: { tag: "path", attrs: { d, fill: "#3050a0" } },
        },
      ]),
      id = result.selected;
    if (!id) throw new Error("Missing path");
    run([{ type: "scene", operation: "rename", targetId: id, value: name }]);
    return id;
  };
  const mouthId = add("M0 0 L100 0 L0 100 Z", "Boca"),
    poseId = add("M0 0 L100 100 L0 200 Z", "Sorriso"),
    faceA = add("M0 0 L20 0 L0 20 Z", "Expressão A"),
    faceB = add("M0 0 L30 0 L0 30 Z", "Expressão B");
  const faceId = run([
    { type: "composition", operation: "group", targetIds: [faceA, faceB], name: "Rosto" },
  ]).selected;
  if (!faceId) throw new Error("Missing face");
  const followerId = add("M0 0 L5 0 L0 5 Z", "Seguidor");
  run([
    { type: "scene", operation: "visibility", targetId: poseId, value: false },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-expression",
          name: "Expressões",
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
          version: 2,
          bones: [],
          targets: [],
          constraints: [
            {
              id: "constraint-follow",
              kind: "path",
              ownerId: followerId,
              targetId: mouthId,
              contour: 0,
              progress: 0,
              orient: true,
              rotationOffset: 0,
              offset: 0,
              tolerance: 0.001,
              strength: 1,
            },
          ],
          morphs: [
            {
              id: "morph-smile",
              name: "Sorriso",
              targetId: mouthId,
              weight: 0,
              geometry: [
                {
                  closed: true,
                  points: [
                    { x: 0, y: 0, in: null, out: null },
                    { x: 100, y: 100, in: null, out: null },
                    { x: 0, y: 200, in: null, out: null },
                  ],
                },
              ],
            },
          ],
          solos: [{ id: "solo-face", targetId: faceId, children: [faceA, faceB], activeIndex: 0 }],
          parameterClips: [
            {
              animationId: "animation-expression",
              tracks: [
                {
                  id: "track-morph",
                  targetId: "morph-smile",
                  property: "weight",
                  keys: [
                    { id: "key-morph-start", frame: 0, value: 0, easing: "linear" },
                    { id: "key-morph-end", frame: 10, value: 1, easing: "linear" },
                  ],
                },
                {
                  id: "track-follow",
                  targetId: "constraint-follow",
                  property: "progress",
                  keys: [
                    { id: "key-follow-start", frame: 0, value: 0, easing: "linear" },
                    { id: "key-follow-end", frame: 10, value: 1, easing: "linear" },
                  ],
                },
                {
                  id: "track-solo",
                  targetId: "solo-face",
                  property: "activeIndex",
                  keys: [
                    { id: "key-solo-start", frame: 0, value: 0, easing: "hold" },
                    { id: "key-solo-mid", frame: 5, value: 1, easing: "hold" },
                    { id: "key-solo-end", frame: 10, value: -1, easing: "hold" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
  return {
    project: () => project,
    run,
    rootId,
    mouthId,
    poseId,
    faceId,
    faceA,
    faceB,
    followerId,
    clipId: "animation-expression",
  };
}
