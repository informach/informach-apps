import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { parseProject } from "../src/shared/project";
import { flattenScene } from "../src/shared/scene.js";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("Informe saudacao.edisvg e uma pasta nova de saída.");
const source = resolve(sourceArgument),
  output = resolve(outputArgument);
const within = relative(dirname(source), output);
if (!within || (!within.startsWith("..") && !isAbsolute(within)))
  throw new Error("Preserve o projeto original.");
const original = await readFile(source);
const sourceHash = createHash("sha256").update(original).digest("hex");
assert.equal(
  sourceHash,
  "54957d1e3b451afd6d7e8b7f5e3554ee12f224ba2db0530a17d0c019c7065a15",
  "A arte mudou. Confira as formas da boca antes de adaptar.",
);
let project = parseProject(JSON.parse(original.toString("utf8")));
const boardId = "artboard-f6066e33-20ca-4f89-b78d-31aa3f0149af";
const board = project.artboards.find((value) => value.id === boardId);
assert.ok(board);
const mouth = "node-ec50a863-7479-4bed-9e4f-f1dd259ce0fb";
const teeth = "node-62c1048b-ec75-4c8d-b6f9-f2d6d7a07c3f";
const tongue = "node-800e1b20-1010-4beb-97a3-7d47f36c1f57";
for (const id of [mouth, teeth, tongue])
  assert.ok(flattenScene(board.scene).find((value) => value.node.id === id));
project = {
  ...project,
  id: "project-zappy-speaking-web",
  name: "Zappy falando",
  defaultArtboardId: boardId,
};

const frames = [0, 3, 7, 11, 14, 18];
function track(clip: string, targetId: string, property: "sy" | "opacity", values: number[]) {
  return {
    id: `track-${clip}-${targetId.slice(5, 13)}-${property}`,
    targetId,
    property,
    keys: values.map((value, index) => ({
      id: `key-${clip}-${targetId.slice(5, 13)}-${property}-${index}`,
      frame: clip === "quiet" ? 0 : frames[index],
      value,
      easing: "linear",
    })),
  };
}
const commands: unknown[] = [
  { type: "scene-transforms", updates: [{ targetId: mouth, transform: { px: 250.5, py: 276.8 } }] },
  ...["quiet", "talk"].map((clip) => ({
    type: "motion",
    command: {
      type: "create-animation",
      animation: {
        id: `animation-speaking-${clip}`,
        name: clip === "quiet" ? "Boca em repouso" : "Boca falando",
        fps: 30,
        frames: 18,
        mode: "loop",
        tracks: [
          track(clip, mouth, "sy", clip === "quiet" ? [0.15] : [0.15, 0.8, 0.35, 1, 0.5, 0.15]),
          track(clip, teeth, "opacity", clip === "quiet" ? [0] : [0, 100, 60, 100, 70, 0]),
          track(clip, tongue, "opacity", clip === "quiet" ? [0] : [0, 100, 60, 100, 70, 0]),
        ],
      },
    },
  })),
  {
    type: "behavior",
    operation: "replace",
    value: {
      ...emptyBehavior(),
      defaultMachineId: "machine-speaking",
      inputs: [{ id: "input-speaking", name: "falando", kind: "boolean", initial: false }],
      machines: [
        {
          id: "machine-speaking",
          name: "Fala",
          layers: [
            {
              id: "layer-mouth",
              name: "Boca",
              entryStateId: "state-quiet",
              properties: [...propertySchema.options],
              targetIds: [mouth, teeth, tongue],
              weight: 1,
              mode: "override",
              states: ["quiet", "talk"].map((name, index) => ({
                id: `state-${name}`,
                name: index ? "Falando" : "Repouso",
                x: index * 240,
                y: 0,
                speed: 1,
                kind: "animation",
                animationId: `animation-speaking-${name}`,
              })),
              transitions: [false, true].map((active) => ({
                id: `transition-${active ? "start" : "stop"}`,
                from: active ? "state-quiet" : "state-talk",
                to: active ? "state-talk" : "state-quiet",
                conditions: [{ inputId: "input-speaking", operator: "eq", value: active }],
                priority: 0,
                duration: 0,
                exitAt: null,
                easing: "linear",
                interrupt: "immediate",
              })),
            },
          ],
        },
      ],
    },
  },
];
const sessionId = "6335b89e-3c58-4098-a0fe-16a3c127cd91";
const result = executeDocumentTransaction(
  { project, sessionId, revision: 0 },
  {
    projectId: project.id,
    sessionId,
    revision: 0,
    artboardId: boardId,
    commands,
  },
);
const content = JSON.stringify(result.project);
await mkdir(output, { recursive: false });
await writeFile(resolve(output, "zappy-falando.edisvg"), content, { flag: "wx" });
await writeFile(
  resolve(output, "provenance.json"),
  JSON.stringify(
    {
      sourceSha256: sourceHash,
      source: "saudacao.edisvg",
      derived: "zappy-falando.edisvg",
      boardId,
      sha256: createHash("sha256").update(content).digest("hex"),
      control: "falando",
      note: "Variante editável da arte enviada. A boca acompanha o estado de tocar da voz, sem alegar sincronização fonética.",
    },
    null,
    2,
  ),
);
assert.equal(
  createHash("sha256")
    .update(await readFile(source))
    .digest("hex"),
  sourceHash,
);
console.log(JSON.stringify({ output, boardId, control: "falando" }));
