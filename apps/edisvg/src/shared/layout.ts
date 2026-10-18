import { parseLayout } from "@informach/edi-motion/layout";
import { z } from "zod";
import type { Artboard } from "./project";
import { flattenScene } from "./scene.js";
export const layoutCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("layout"),
    operation: z.literal("replace"),
    value: z.unknown(),
  }),
  z.strictObject({ type: z.literal("layout"), operation: z.literal("disable") }),
]);
export function applyLayout(board: Artboard, command: z.infer<typeof layoutCommandSchema>) {
  if (command.operation === "disable") {
    delete board.layout;
    return;
  }
  const next = parseLayout(
    command.value,
    new Map(
      flattenScene(board.scene).map(({ node, parentId }) => [
        node.id,
        { tag: node.tag, parentId, isComponent: !!node.instance },
      ]),
    ),
  );
  const old = board.layout;
  for (const entry of flattenScene(board.scene)) {
    if (!entry.locked) continue;
    const before = [
      old?.items.find((value) => value.targetId === entry.node.id),
      old?.containers.find((value) => value.targetId === entry.node.id),
    ];
    const after = [
      next.items.find((value) => value.targetId === entry.node.id),
      next.containers.find((value) => value.targetId === entry.node.id),
    ];
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Desbloqueie o item e seus grupos antes de alterar seu layout.");
  }
  board.layout = next;
}
