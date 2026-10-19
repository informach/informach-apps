import type { InteractiveDocument } from "@informach/edi-motion/runtime";
/** Historical blueprint fixtures omit fields introduced later. Merely
 * changing a current header would test contradictory input, not migration. */
export function legacyInteractive(
  document: InteractiveDocument,
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): unknown {
  function scope(source: InteractiveDocument): unknown {
    if (version >= 6)
      return {
        ...source,
        version,
        content: source.content.map((object) => {
          if (version >= 8) return object;
          const { semantics: _semantics, ...content } = object;
          if (version === 7) return content;
          const { fontFallbackIds: _fallback, ...older } = content;
          return older;
        }),
        ...(source.components
          ? {
              components: source.components.map((component) => ({
                ...component,
                document: scope(component.document),
              })),
            }
          : {}),
      };
    const { assets: _assets, visual: _visual, ...legacy } = source;
    return {
      ...legacy,
      version,
      content: source.content.map(
        ({ visual: _visual, fontFallbackIds: _fallback, semantics: _semantics, ...content }) =>
          content,
      ),
      ...(source.components
        ? {
            components: source.components.map((component) => ({
              ...component,
              document: scope(component.document),
            })),
          }
        : {}),
    };
  }
  const legacy = scope(document);
  if (version >= 6) return legacy;
  if (typeof legacy !== "object" || legacy === null) throw new Error("Invalid legacy fixture");
  const audioAssets = document.assets?.filter((asset) => asset.kind === "audio") ?? [];
  return audioAssets.length ? { ...legacy, audioAssets } : legacy;
}
