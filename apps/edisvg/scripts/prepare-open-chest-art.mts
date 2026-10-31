import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { executeDocumentTransaction } from "../src/shared/documentCommands";
import { parseProject } from "../src/shared/project";
import { flattenScene } from "../src/shared/scene.js";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error("Informe o projeto do baú e uma pasta de saída fora dos originais.");
const source = resolve(sourceArgument),
  output = resolve(outputArgument);
const within = relative(dirname(source), output);
if (!within || (!within.startsWith("..") && !isAbsolute(within)))
  throw new Error("Preserve a pasta de originais.");
const original = await readFile(source);
const sourceSha256 = createHash("sha256").update(original).digest("hex");
assert.equal(
  sourceSha256,
  "2b25b2103e64620d9d57fc2c6adab9ed002dc9ba68fb68d5213d9713493aaa3d",
  "A arte mudou. Confira a máquina e o estado aberto antes de adaptar.",
);
let project = parseProject(JSON.parse(original.toString("utf8")));
const boards = project.artboards.filter((board) => flattenScene(board.scene).length > 0);
assert.equal(boards.length, 1);
const board = boards[0];
assert.ok(board?.behavior);
const behavior = structuredClone(board.behavior);
const machine = behavior.machines.find((value) => value.name === "Baú");
const input = behavior.inputs.find((value) => value.name === "aberto");
assert.ok(machine && input?.kind === "boolean");
input.initial = true;
behavior.defaultMachineId = machine.id;
for (const layer of machine.layers) {
  const state = layer.states.find((value) => value.name === "Aberto");
  assert.ok(state, "O baú precisa do estado aberto já desenhado.");
  layer.entryStateId = state.id;
}
project = {
  ...project,
  id: "project-chest-open-web",
  name: "Baú aberto",
  defaultArtboardId: board.id,
};
const sessionId = "81fe2a8a-2cfa-4c44-b2eb-bb8ef978ddbd";
const result = executeDocumentTransaction(
  { project, sessionId, revision: 0 },
  {
    projectId: project.id,
    sessionId,
    revision: 0,
    artboardId: board.id,
    commands: [{ type: "behavior", operation: "replace", value: behavior }],
  },
);
const content = JSON.stringify(result.project);
await mkdir(output, { recursive: false });
await writeFile(resolve(output, "bau-aberto.edisvg"), content, { flag: "wx" });
await writeFile(
  resolve(output, "bau-aberto.provenance.json"),
  JSON.stringify(
    {
      source: "baú.edisvg",
      sourceSha256,
      derived: "bau-aberto.edisvg",
      boardId: board.id,
      sha256: createHash("sha256").update(content).digest("hex"),
      note: "Reserva do estado Aberto original, sem redesenho e sem tocar no projeto de abertura interativa.",
    },
    null,
    2,
  ),
  { flag: "wx" },
);
assert.equal(
  createHash("sha256")
    .update(await readFile(source))
    .digest("hex"),
  sourceSha256,
);
console.log(JSON.stringify({ output, boardId: board.id }));
