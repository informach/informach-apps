import { z } from "zod";

/**
 * The library shared by every lesson (userData/library.json): media used again and again
 * (openings, logos, music, cards) and favorite styles (of an annotation, of the captions, of
 * the pointer). The main process lets the app read a media of the library again when it lists
 * it, and only keeps media the app could already read when it was saved.
 */

export const LIBRARY_CATEGORIES = ["vinheta", "logo", "musica", "cartela", "outro"] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  vinheta: "Vinheta",
  logo: "Logo",
  musica: "Música",
  cartela: "Cartela",
  outro: "Outro",
};

export const STYLE_TARGETS = ["annotation", "caption", "cursor"] as const;
export type StyleTarget = (typeof STYLE_TARGETS)[number];

export const TARGET_LABEL: Record<StyleTarget, string> = {
  annotation: "Anotação",
  caption: "Legenda",
  cursor: "Cursor",
};

const text = z.string().min(1).max(200);
const path = z
  .string()
  .min(1)
  .max(32768)
  .refine((v) => !v.includes("\0"));

export const libraryMediaSchema = z.strictObject({
  id: z.string().min(1).max(100),
  name: text,
  path,
  kind: z.enum(["video", "audio", "image"]),
  category: z.enum(LIBRARY_CATEGORIES),
  addedAt: z.number().nonnegative(),
  /** Not on this computer any more (set when listing). */
  missing: z.boolean().optional(),
});

/** A style is a set of plain values (colors, sizes, names), never paths. */
const styleValue = z.record(
  z.string().max(60),
  z.union([
    z.string().max(400),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string().max(60), z.union([z.string().max(400), z.number(), z.boolean(), z.null()])),
  ]),
);

export const libraryStyleSchema = z.strictObject({
  id: z.string().min(1).max(100),
  name: text,
  target: z.enum(STYLE_TARGETS),
  /** For an annotation, the kind it was taken from (its look fits that kind best). */
  kind: z.string().max(40).optional(),
  value: styleValue,
  addedAt: z.number().nonnegative(),
});

export const librarySchema = z.strictObject({
  version: z.literal(1),
  media: z.array(libraryMediaSchema).max(2000),
  styles: z.array(libraryStyleSchema).max(2000),
});

export type LibraryMedia = z.infer<typeof libraryMediaSchema>;
export type LibraryStyle = z.infer<typeof libraryStyleSchema>;
export type Library = z.infer<typeof librarySchema>;

export const EMPTY_LIBRARY: Library = { version: 1, media: [], styles: [] };

/** The library category a media suggests (sound is music, a picture a logo, a video an opening). */
export const suggestedCategory = (kind: LibraryMedia["kind"]): LibraryCategory =>
  kind === "audio" ? "musica" : kind === "image" ? "logo" : "vinheta";

/** Only the plain values of an object (what a style may keep). */
export function plainStyle(value: object): LibraryStyle["value"] {
  const out: LibraryStyle["value"] = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null)
      out[k] = v;
    else if (typeof v === "object" && !Array.isArray(v)) {
      const inner: Record<string, string | number | boolean | null> = {};
      for (const [ik, iv] of Object.entries(v))
        if (
          typeof iv === "string" ||
          typeof iv === "number" ||
          typeof iv === "boolean" ||
          iv === null
        )
          inner[ik] = iv;
      out[k] = inner;
    }
  }
  return out;
}
