import { z } from "zod";

const letter = z.string().regex(/^[a-z]$/, "Escolha uma letra de a a z.");
export const preferencesSchema = z
  .object({
    version: z.literal(1),
    theme: z.enum(["dark", "light", "system"]),
    textSize: z.enum(["standard", "large"]),
    sidebarWidth: z.number().int().min(160).max(400),
    panelWidth: z.number().int().min(220).max(480),
    rememberRecents: z.boolean(),
    recentThumbnails: z.boolean(),
    restoreSession: z.boolean(),
    versions: z.number().int().min(0).max(20),
    versionDays: z.number().int().min(1).max(365),
    versionIntervalMinutes: z.number().int().min(1).max(60),
    recoveryStorageMB: z.number().int().min(64).max(2048),
    toolShortcuts: z.object({
      select: letter,
      hand: letter,
      text: letter,
      edittext: letter,
      highlight: letter,
      ink: letter,
      note: letter,
    }),
  })
  .refine(
    (preferences) =>
      new Set(Object.values(preferences.toolShortcuts)).size ===
      Object.values(preferences.toolShortcuts).length,
    "Cada ferramenta precisa de uma letra diferente.",
  );
export type PdfPreferences = z.infer<typeof preferencesSchema>;
export const TOOL_SHORTCUT_TOOLS = [
  "select",
  "hand",
  "text",
  "edittext",
  "highlight",
  "ink",
  "note",
] as const;
export function shortcutTool(
  key: string,
  preferences: PdfPreferences,
): (typeof TOOL_SHORTCUT_TOOLS)[number] | undefined {
  return TOOL_SHORTCUT_TOOLS.find((tool) => preferences.toolShortcuts[tool] === key);
}
export const DEFAULT_PREFERENCES: PdfPreferences = preferencesSchema.parse({
  version: 1,
  theme: "dark",
  textSize: "standard",
  sidebarWidth: 200,
  panelWidth: 260,
  rememberRecents: true,
  recentThumbnails: true,
  restoreSession: false,
  versions: 5,
  versionDays: 30,
  versionIntervalMinutes: 5,
  recoveryStorageMB: 512,
  toolShortcuts: {
    select: "v",
    hand: "h",
    text: "t",
    edittext: "e",
    highlight: "r",
    ink: "d",
    note: "c",
  },
});
export const recentFileSchema = z.object({
  pinned: z.boolean().optional(),
  path: z.string().min(1).max(32768),
  name: z.string().min(1).max(1000),
  openedAt: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative().optional(),
  thumb: z
    .string()
    .max(2_000_000)
    .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/)
    .optional(),
});
export const recentFilesSchema = z.array(recentFileSchema).max(200);
export const signatureSchema = z.object({
  strokes: z
    .array(
      z.object({
        points: z
          .array(z.number().finite().min(-20000).max(20000))
          .min(2)
          .max(200000)
          .refine((points) => points.length % 2 === 0),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        width: z.number().finite().positive().max(100),
      }),
    )
    .min(1)
    .max(10000)
    .optional(),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  src: z
    .string()
    .max(16_000_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});
export const signaturesSchema = z.array(signatureSchema).max(100);
