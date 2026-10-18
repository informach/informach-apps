import { z } from "zod";
import { artboardIdSchema } from "./identities";
import { parseProject } from "./project";
import { serializeProject } from "./projectPolicy";

const objectId = z.string().regex(/^node-[\w-]{1,100}$/);
export const documentTaskSchema = z.strictObject({
  version: z.literal(1),
  context: z.strictObject({
    project: z.unknown(),
    sessionId: z.uuid(),
    revision: z.number().int().min(0),
  }),
  request: z.unknown(),
});
export const documentTaskResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(false), message: z.string().max(2000), truncated: z.boolean() }),
  z.strictObject({
    ok: z.literal(true),
    result: z.strictObject({
      project: z.unknown(),
      selected: objectId.nullable().optional(),
      selectedIds: z.array(objectId).max(2000).optional(),
      selectedArtboard: artboardIdSchema.optional(),
      changed: z.boolean(),
      revision: z.number().int().min(0),
    }),
  }),
]);
export function readDocumentTaskResult(value: unknown) {
  const message = documentTaskResultSchema.parse(value);
  if (!message.ok)
    throw new Error(message.message + (message.truncated ? " [diagnóstico abreviado]" : ""));
  const project = parseProject(message.result.project);
  serializeProject(project);
  if (
    message.result.selectedArtboard !== undefined &&
    !project.artboards.some((board) => board.id === message.result.selectedArtboard)
  )
    throw new Error("Resposta contém prancheta inexistente.");
  const ids = new Set<string>();
  const visit = (nodes: import("./sceneTypes").SceneNode[]) => {
    for (const node of nodes) {
      ids.add(node.id);
      visit(node.children);
    }
  };
  for (const board of project.artboards) visit(board.scene.nodes);
  if (
    (message.result.selected && !ids.has(message.result.selected)) ||
    message.result.selectedIds?.some((id) => !ids.has(id))
  )
    throw new Error("Resposta contém seleção inexistente.");
  return { ...message.result, project };
}
