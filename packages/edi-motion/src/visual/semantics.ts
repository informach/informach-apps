import { z } from "zod";
import { isXmlText } from "../xmlText";

const labelled = {
  label: z
    .string()
    .min(1)
    .max(500)
    .refine((text) => !!text.trim() && isXmlText(text), "Nome acessível inválido."),
  description: z
    .string()
    .min(1)
    .max(2000)
    .refine((text) => !!text.trim() && isXmlText(text), "Descrição acessível inválida.")
    .optional(),
};
/** Authored text, not arbitrary ARIA/HTML or generated global IDs. */
export const semanticSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("decorative") }),
  z.strictObject({ kind: z.literal("group"), ...labelled }),
  z.strictObject({ kind: z.literal("image"), ...labelled }),
  z.strictObject({ kind: z.literal("button"), ...labelled }),
]);
export type SemanticMetadata = z.infer<typeof semanticSchema>;
export interface SemanticNode {
  id: string;
  parentId: string | null;
  semantics?: SemanticMetadata;
}
/** Evaluate the expanded graph, including boundaries between logic scopes.
 * Decorative/atomic roles must never hide a keyboard listener below them.
 * Saving an incomplete authoring document does not invoke this runtime gate. */
export function validateSemanticInteractions(
  nodes: readonly SemanticNode[],
  targets: ReadonlySet<string>,
  activations: ReadonlySet<string>,
) {
  if (nodes.length > 2000) throw new Error("Semântica excede orçamento de objetos.");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("IDs semânticos repetidos.");
  let text = 0;
  for (const node of nodes) {
    const metadata = node.semantics;
    if (metadata && metadata.kind !== "decorative")
      text += metadata.label.length + (metadata.description?.length ?? 0);
    if (text > 1_000_000) throw new Error("Semântica excede orçamento textual.");
    if (metadata?.kind === "button" && !activations.has(node.id))
      throw new Error(`Botão acessível ${node.id} requer listener de ativação.`);
    if (metadata?.kind === "group" && activations.has(node.id))
      throw new Error(`Grupo acessível ${node.id} com ativação deve ser configurado como botão.`);
  }
  for (const id of targets) {
    let node = byId.get(id),
      depth = 0;
    if (!node) throw new Error("Destino semântico ausente.");
    while (node) {
      if (++depth > 33) throw new Error("Hierarquia semântica cíclica/profunda.");
      const kind = node.semantics?.kind;
      if (
        kind === "decorative" ||
        kind === "image" ||
        ((kind === "button" || activations.has(node.id)) && node.id !== id)
      )
        throw new Error(`Semântica ${kind} de ${node.id} esconderia a interação de ${id}.`);
      if (node.parentId === null) break;
      const parent = byId.get(node.parentId);
      if (!parent) throw new Error("Pai semântico ausente.");
      node = parent;
    }
  }
}
export function semanticAttributes(
  metadata: SemanticMetadata | undefined,
  interactive: boolean,
): Record<string, string> {
  if (!metadata) return {};
  if (metadata.kind === "decorative") return { "aria-hidden": "true" };
  return {
    role:
      metadata.kind === "image"
        ? "img"
        : metadata.kind === "button" && interactive
          ? "button"
          : "group",
    "aria-label": metadata.label,
  };
}
