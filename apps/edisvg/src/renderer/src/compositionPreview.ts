import { createPlaybackContext } from "@informach/edi-motion";
import { nativeEffectSources, playbackVectorEffectContext } from "@informach/edi-motion/graphics";
import { compileArtboard, renderEditorComposition } from "../../shared/components";
import type { Project } from "../../shared/project";
import { flattenScene } from "../../shared/scene.js";

/** Single-entry cache follows the document session/revision, never navigation
 * time. Commands, undo/redo and replacement own revision invalidation. */
export function createCompositionPreview() {
  let cached:
    | {
        key: string;
        compiled: ReturnType<typeof compileArtboard>;
        markup: string;
        playbackContext: ReturnType<typeof createPlaybackContext>;
        effectContext: ReturnType<typeof playbackVectorEffectContext>;
      }
    | undefined;
  return (
    context: { sessionId: string; revision: number; artboardId: string | null },
    read: () => Project,
  ) => {
    if (!context.artboardId) {
      cached = undefined;
      return null;
    }
    const key = JSON.stringify([context.sessionId, context.revision, context.artboardId]);
    if (cached?.key !== key) {
      const compiled = compileArtboard(read(), context.artboardId),
        entries = flattenScene(compiled.scene),
        effects = new Map(
          entries.flatMap(({ node }) => (node.effects ? [[node.id, node.effects] as const] : [])),
        );
      cached = {
        key,
        compiled,
        markup: renderEditorComposition(compiled),
        playbackContext: createPlaybackContext(compiled.playback),
        effectContext: playbackVectorEffectContext(
          compiled.playback,
          effects,
          new Map(
            entries.flatMap(({ node }) =>
              node.tag === "path" && node.attrs.d ? [[node.id, node.attrs.d] as const] : [],
            ),
          ),
          nativeEffectSources(
            entries.map(({ node }) => node),
            effects,
          ),
        ),
      };
    }
    return cached;
  };
}
