import { z } from "zod";
export const personalAiChanges = z
  .object({
    engine: z.enum(["claude-code", "codex"]).optional(),
    claudeModel: z.string().min(1).max(100).optional(),
    mcpEnabled: z.boolean().optional(),
    confirmDeletes: z.boolean().optional(),
    allowFileWrites: z.boolean().optional(),
  })
  .strict();
const preferences = personalAiChanges
  .extend({ mcpPort: z.number().int().min(1024).max(65535).optional() })
  .strip();
export function personalAiPreferences(input: unknown) {
  if (!input || typeof input !== "object") return {};
  // Old API preferences have no executable route. Keep supported preferences only.
  const { engine, ...rest } = z.record(z.string(), z.unknown()).parse(input);
  return preferences.parse({ ...rest, engine: engine === "codex" ? "codex" : "claude-code" });
}
