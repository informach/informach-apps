import type Anthropic from "@anthropic-ai/sdk";

type Param = Anthropic.Beta.BetaMessageParam;

/** Pictures of get_frame kept in the API history; older ones become a line of text. */
export const KEPT_IMAGES = 4;

/** What a picture was, for the line that replaces it: "[quadro de 1:23]". */
const labels = new WeakMap<object, string>();

export const frameLabel = (seconds: number): string =>
  `[quadro de ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}]`;

/** Marks an image block with the line it turns into once it is old. */
export function labelImage<T extends object>(block: T, label: string): T {
  labels.set(block, label);
  return block;
}

/**
 * Keeps only the newest `keep` pictures in the history of the in-app assistant: each older one
 * is replaced, where it is, by its line ("[quadro de mm:ss]"), so a long conversation that looked
 * at many frames does not send all of them again on every turn. The tool results stay paired
 * with their calls; only their pictures change.
 */
export function pruneImages(messages: Param[], keep = KEPT_IMAGES): number {
  const found: { list: unknown[]; index: number }[] = [];
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block.type === "image") found.push({ list: m.content, index: m.content.indexOf(block) });
      if (block.type === "tool_result" && Array.isArray(block.content))
        block.content.forEach((part, index) => {
          if (part.type === "image") found.push({ list: block.content as unknown[], index });
        });
    }
  }
  const old = found.slice(0, Math.max(0, found.length - keep));
  for (const { list, index } of old) {
    const image = list[index];
    const text = (image && typeof image === "object" && labels.get(image)) || "[quadro]";
    list[index] = { type: "text", text };
  }
  return old.length;
}
