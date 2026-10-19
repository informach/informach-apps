import { parseBehavior } from "@informach/edi-motion/behavior";
import { rigParameterContext } from "@informach/edi-motion/rig";
import { z } from "zod";
import type { Artboard, Project } from "./project";
import { flattenScene } from "./scene.js";

export const behaviorCommandSchema = z.strictObject({
  type: z.literal("behavior"),
  operation: z.literal("replace"),
  value: z.unknown(),
});
/** The revision guard and document transaction make graph replacement atomic;
 * UI drafts and MCP have no privileged mutation path. References are rechecked
 * with the final scene/motion in every transaction, including mixed edits. */
export function applyBehavior(
  project: Project,
  board: Artboard,
  command: z.infer<typeof behaviorCommandSchema>,
) {
  board.behavior = parseBehavior(
    command.value,
    new Map(flattenScene(board.scene).map(({ node }) => [node.id, node])),
    project.motion.animations,
    rigParameterContext(board.rig),
  );
}
