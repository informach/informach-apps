import {
  type Affine,
  identityMatrix,
  inverse,
  type Motion,
  multiply,
  parseTransformList,
  transformMatrix,
} from "@informach/edi-motion";
import { z } from "zod";
import { inheritedGradientPaints } from "./paintAttributes";
import { flattenScene, identity } from "./scene.js";
import type { Scene, SceneNode } from "./sceneTypes";

const nodeId = z.string().regex(/^node-[\w-]{1,100}$/);
export const compositionCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("composition"),
    operation: z.literal("group"),
    targetIds: z.array(nodeId).min(1).max(2000),
    name: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    type: z.literal("composition"),
    operation: z.literal("ungroup"),
    targetId: nodeId,
  }),
  z.strictObject({
    type: z.literal("composition"),
    operation: z.literal("reparent"),
    targetId: nodeId,
    parentId: nodeId.nullable(),
    index: z.number().int().min(0).max(2000),
  }),
]);
type Command = z.infer<typeof compositionCommandSchema>;
const inheritedDefaults: Record<string, string> = {
  fill: "black",
  stroke: "none",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-dasharray": "none",
  "fill-rule": "nonzero",
  "fill-opacity": "1",
  "stroke-opacity": "1",
  "font-family": "serif",
  "font-size": "16",
  "font-weight": "normal",
  "text-anchor": "start",
  visibility: "visible",
};
export function nodeMatrix(node: SceneNode): Affine {
  return multiply(
    multiply(node.basis ?? identityMatrix(), transformMatrix(node.transform)),
    parseTransformList(node.attrs.transform ?? ""),
  );
}
function ancestry(scene: Scene, id: string | null): SceneNode[] {
  if (id === null) return [];
  const entries = new Map(flattenScene(scene).map((entry) => [entry.node.id, entry]));
  const path: SceneNode[] = [];
  let cursor: string | null = id;
  while (cursor !== null) {
    const entry = entries.get(cursor);
    if (!entry) throw new Error("Grupo não encontrado.");
    path.unshift(entry.node);
    cursor = entry.parentId;
  }
  return path;
}
const product = (path: SceneNode[]) =>
  path.reduce((matrix, node) => multiply(matrix, nodeMatrix(node)), identityMatrix());
export const worldMatrix = (scene: Scene, id: string) => product(ancestry(scene, id));
function listAt(scene: Scene, parentId: string | null) {
  if (parentId === null) return scene.nodes;
  const parent = flattenScene(scene).find(({ node }) => node.id === parentId)?.node;
  if (parent?.tag !== "g") throw new Error("O destino precisa ser um grupo.");
  return parent.children;
}
function assertEditable(scene: Scene, id: string) {
  const entry = flattenScene(scene).find(({ node }) => node.id === id);
  if (!entry) throw new Error("Objeto não encontrado.");
  if (entry.locked) throw new Error("Desbloqueie o objeto e seus grupos para reorganizar.");
  return entry;
}
function relocate(
  scene: Scene,
  motion: Motion,
  id: string,
  parentId: string | null,
  index: number,
  policy: "preserve-motion" | "bind-rest" = "preserve-motion",
) {
  const entry = assertEditable(scene, id);
  const before = ancestry(scene, entry.parentId),
    after = ancestry(scene, parentId);
  if (after.some((node) => node.id === id))
    throw new Error("Uma hierarquia não pode conter ciclos.");
  if (parentId !== null) assertEditable(scene, parentId);
  if (entry.parentId === parentId) {
    const siblings = listAt(scene, parentId);
    if (index > siblings.length) throw new Error("Posição de destino inválida.");
    siblings.splice(siblings.indexOf(entry.node), 1);
    siblings.splice(Math.min(index, siblings.length), 0, entry.node);
    return;
  }
  let common = 0;
  while (common < before.length && before[common]?.id === after[common]?.id) common++;
  const changedSpaces = [...before.slice(common), ...after.slice(common)];
  if (changedSpaces.some((node) => node.effects))
    throw new Error(
      "A mudança atravessa um grupo com recorte/máscara. Preserve essa hierarquia ou remova o efeito explicitamente.",
    );
  if (after.slice(common).some((node) => !node.visible || node.attrs.display === "none"))
    throw new Error("O grupo de destino está oculto. Mostre o grupo antes de reorganizar.");
  const affected = new Set(changedSpaces.map((node) => node.id));
  if (
    policy === "preserve-motion" &&
    motion.animations.some((clip) => clip.tracks.some((track) => affected.has(track.targetId)))
  )
    throw new Error(
      "A mudança atravessa grupos animados. Mantenha a hierarquia para preservar o movimento em todos os quadros.",
    );
  if (
    changedSpaces.some(
      (node) =>
        node.transform.opacity !== 100 ||
        (node.attrs.opacity !== undefined && !["1", "100%"].includes(node.attrs.opacity)),
    )
  )
    throw new Error(
      "A mudança alteraria a composição de transparência do grupo. Remova a transparência do grupo antes de reorganizar.",
    );
  const inherited = { ...inheritedDefaults };
  for (const node of before)
    for (const key of Object.keys(inheritedDefaults))
      if (node.attrs[key] === "initial") inherited[key] = inheritedDefaults[key] ?? "";
      else if (node.attrs[key] !== undefined && !["inherit", "unset"].includes(node.attrs[key]))
        inherited[key] = node.attrs[key];
  // Relative font lengths depend on parent context. Refuse rather than
  // silently retaining a token which renders at a different size.
  if (
    entry.node.tag !== "image" &&
    [...before, ...after, entry.node].some(
      (node) => node.attrs["font-size"] && !/^[-+\d.eE]+(?:px)?$/.test(node.attrs["font-size"]),
    )
  )
    throw new Error("Converta o tamanho relativo da fonte em px antes de reorganizar.");
  const basis = multiply(
    multiply(inverse(product(after.slice(common))), product(before.slice(common))),
    entry.node.basis ?? identityMatrix(),
  );
  if (basis.some((value) => Math.abs(value) > 1e7))
    throw new Error("O novo espaço excede os limites de coordenadas.");
  const source = listAt(scene, entry.parentId),
    destination = listAt(scene, parentId);
  if (index > destination.length) throw new Error("Posição de destino inválida.");
  source.splice(source.indexOf(entry.node), 1);
  destination.splice(Math.min(index, destination.length), 0, entry.node);
  entry.node.basis = basis;
  const inheritedKeys =
    entry.node.tag === "image" ? ["visibility"] : Object.keys(inheritedDefaults);
  if (entry.node.tag !== "image") {
    const inheritedPaints = inheritedGradientPaints(before),
      gradients = { ...entry.node.gradients };
    for (const channel of ["fill", "stroke"] as const) {
      const value = inheritedPaints[channel];
      if (
        value &&
        !gradients[channel] &&
        (entry.node.attrs[channel] === undefined ||
          ["inherit", "unset"].includes(entry.node.attrs[channel] ?? ""))
      )
        gradients[channel] = value;
    }
    if (gradients.fill || gradients.stroke) entry.node.gradients = gradients;
  }
  const inheritedAttributes: Record<string, string> = {};
  for (const key of inheritedKeys) {
    const value = inherited[key];
    if (value === undefined) throw new Error("Valor de herança ausente.");
    inheritedAttributes[key] = value;
  }
  entry.node.attrs = {
    ...inheritedAttributes,
    ...entry.node.attrs,
  };
  for (const key of inheritedKeys) {
    if (["inherit", "unset"].includes(entry.node.attrs[key] ?? ""))
      entry.node.attrs[key] = inherited[key] ?? "";
    else if (entry.node.attrs[key] === "initial")
      entry.node.attrs[key] = inheritedDefaults[key] ?? "";
  }
  if (before.some((node) => !node.visible || node.attrs.display === "none"))
    entry.node.visible = false;
}
/** Binding deliberately changes future motion: only the authored rest pose is
 * preserved. This named policy is distinct from normal hierarchy editing. */
export function bindObjectToBone(scene: Scene, motion: Motion, id: string, boneId: string) {
  const bone = flattenScene(scene).find(({ node }) => node.id === boneId)?.node;
  if (bone?.tag !== "g" || bone.instance) throw new Error("Vínculo requer osso/grupo local.");
  relocate(scene, motion, id, boneId, bone.children.length, "bind-rest");
}

/** Operates only on a transaction-owned draft. Parsing/budgets happen at commit. */
export function applyComposition(scene: Scene, motion: Motion, command: Command): string | null {
  if (command.operation === "group") {
    const ids = new Set(command.targetIds);
    if (ids.size !== command.targetIds.length) throw new Error("Seleção contém IDs repetidos.");
    const entries = command.targetIds.map((id) => assertEditable(scene, id));
    const first = entries[0];
    if (!first) throw new Error("Selecione objetos para agrupar.");
    if (entries.some((entry) => entry.parentId !== first.parentId))
      throw new Error("Agrupe objetos do mesmo nível da hierarquia.");
    const siblings = listAt(scene, first.parentId),
      indices = entries.map(({ node }) => siblings.indexOf(node)).sort((a, b) => a - b);
    const start = indices[0];
    if (start === undefined || indices.some((value, index) => value !== start + index))
      throw new Error(
        "A seleção precisa ser contígua para preservar a ordem de desenho. Reordene as camadas explicitamente antes de agrupar.",
      );
    const group: SceneNode = {
      id: `node-${crypto.randomUUID()}`,
      name: command.name,
      tag: "g",
      attrs: {},
      text: "",
      transform: identity(),
      visible: true,
      locked: false,
      children: siblings.splice(start, entries.length),
    };
    siblings.splice(start, 0, group);
    return group.id;
  }
  if (command.operation === "reparent") {
    relocate(scene, motion, command.targetId, command.parentId, command.index);
    return command.targetId;
  }
  const entry = assertEditable(scene, command.targetId);
  if (entry.node.instance)
    throw new Error(
      "Instância de componente não é um grupo local. Edite a prancheta de origem ou remova a instância explicitamente.",
    );
  if (entry.node.tag !== "g") throw new Error("Selecione um grupo para desagrupar.");
  if (entry.node.effects)
    throw new Error("Remova explicitamente o recorte/máscara do grupo antes de desagrupar.");
  if (
    motion.animations.some((clip) => clip.tracks.some((track) => track.targetId === entry.node.id))
  )
    throw new Error("O grupo possui animação própria. Desagrupar removeria essas trilhas.");
  const children = [...entry.node.children],
    siblings = listAt(scene, entry.parentId),
    start = siblings.indexOf(entry.node);
  children.forEach((child, index) => {
    relocate(scene, motion, child.id, entry.parentId, start + index);
  });
  siblings.splice(siblings.indexOf(entry.node), 1);
  return children[0]?.id ?? null;
}
