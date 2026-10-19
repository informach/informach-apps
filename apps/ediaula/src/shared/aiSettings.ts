import { z } from "zod";
import {
  ASSISTANT_MODELS,
  CLAUDE_CODE_MODELS,
  EARLIER_MODELS,
  EFFORTS,
  type Effort,
} from "./aiModels.ts";

/**
 * The AI settings kept in ai.json (main/aiSettings.ts) and the changes the settings screen sends
 * (ai:saveSettings), checked here so the rules are tested without Electron.
 */

const effort = z.enum(EFFORTS.map((e) => e.id) as [Effort, ...Effort[]]);
const claudeModel = z.enum(CLAUDE_CODE_MODELS.map((m) => m.id) as [string, ...string[]]);
/** Any stored model id: one that left the list is moved to its successor (resolveModel). */
const storedModel = z.string().min(1).max(100);

/** Each field on its own: an invalid one is dropped without losing the others. */
const FIELDS = {
  /** API key encrypted with the OS keychain (DPAPI on Windows), base64. */
  apiKeyEnc: z.string().max(20_000),
  model: storedModel,
  /** Which AI powers the in-app chat. */
  engine: z.enum(["claude-code", "codex", "api"]),
  /** Claude Code model alias ('default' keeps the user's own setting). */
  claudeModel,
  /** Reasoning effort for the API key and Claude Code. */
  effort,
  mcpEnabled: z.boolean(),
  mcpPort: z.int().min(1024).max(65535),
  /** Result of the Codex self-check for that Codex version. */
  codexRestricted: z.looseObject({ version: z.string().max(200), ok: z.boolean() }),
  /** Codex version the person chose to use without the guarantee. */
  codexConfirmed: z.string().max(200),
} as const;

type Fields = typeof FIELDS;
export type StoredSettings = { -readonly [K in keyof Fields]?: z.infer<Fields[K]> };

/** The settings in a parsed ai.json, field by field, and the names of the fields dropped. */
export function parseStoredSettings(raw: unknown): {
  settings: StoredSettings;
  dropped: string[];
} {
  const settings: Record<string, unknown> = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { settings, dropped };
  for (const [name, value] of Object.entries(raw)) {
    if (!Object.hasOwn(FIELDS, name)) {
      // A field of a newer version is kept as it is, so writing the file does not lose it.
      settings[name] = value;
      continue;
    }
    const parsed = FIELDS[name as keyof Fields].safeParse(value);
    if (parsed.success) settings[name] = parsed.data;
    else dropped.push(name);
  }
  return { settings: settings as StoredSettings, dropped };
}

/** The models the in-app assistant can be set to. */
const assistantModel = z.enum(
  [...ASSISTANT_MODELS, ...EARLIER_MODELS].map((m) => m.id) as [string, ...string[]],
);

/** What the settings screen may change in one call (ai:saveSettings); anything else is refused. */
export const settingsChangesSchema = z.strictObject({
  apiKey: z.string().trim().min(1).max(500).nullable().optional(),
  model: assistantModel.optional(),
  mcpEnabled: z.boolean().optional(),
  engine: z.enum(["claude-code", "codex", "api"]).optional(),
  claudeModel: claudeModel.optional(),
  effort: effort.optional(),
  codexConfirmed: z.boolean().optional(),
});

export type SettingsChanges = z.infer<typeof settingsChangesSchema>;
