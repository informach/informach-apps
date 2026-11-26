import { parseAnimationArtifact } from "@informach/edi-motion/animation-artifact";
import { z } from "zod";

/** A file name the editor suggests (no folder, no reserved characters); the person can change it. */
export const suggestedNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  // No folder separators, reserved characters or control characters (Windows names).
  .refine(
    (name) =>
      ![...name].some((c) => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c)) &&
      !name.startsWith(".") &&
      !name.endsWith("."),
    "Nome inválido.",
  );
const textSchema = z.strictObject({
  extension: z.enum(["html", "svg", "edisvg.json", "lottie.json", "edi-animation.json"]),
  content: z.string(),
  encoding: z.literal("utf8").optional(),
  name: suggestedNameSchema.optional(),
});
const binarySchema = z.strictObject({
  extension: z.enum(["react.zip", "web-player.zip"]),
  content: z.string(),
  encoding: z.literal("base64"),
  name: suggestedNameSchema.optional(),
});
/**
 * The name the Save dialog proposes for an export: the project's file name first, so the exported
 * file says which project it came from, then what the editor suggests (the animation, or a
 * pipeline's narration). A project never saved has no file name: the suggestion alone, or
 * "projeto".
 */
export function exportFileName(projectPath: string | null | undefined, suggested?: string) {
  // Either separator: the path is the Windows one in the app and a POSIX one in CI.
  const project = (projectPath?.split(/[\\/]/).pop() ?? "").replace(/\.edisvg$/i, "").trim();
  const extra = suggested?.trim() ?? "";
  const name =
    project && extra && !extra.startsWith(project)
      ? `${project} - ${extra}`
      : extra || project || "projeto";
  // Within the suggested name's limit; Windows drops a trailing dot or space from a file name.
  return name.slice(0, 120).replace(/[. ]+$/, "") || "projeto";
}
/** IPC only writes after a native Save dialog; it never trusts a client path.
 * Bound encoded/decoded sizes before allocating and require canonical base64.
 * Raster and video bytes arrive in slices instead (`mediaUpload.ts`). */
export function parseExportPayload(input: unknown): {
  extension: string;
  content: string | Buffer;
  name?: string;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("content" in input) ||
    typeof input.content !== "string" ||
    input.content.length > 13333336
  )
    throw new Error("Exportação inválida ou excessiva.");
  const value = z.union([textSchema, binarySchema]).parse(input, { jitless: true });
  const named = value.name ? { name: value.name } : {};
  if (value.encoding === "base64") {
    if (value.content.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value.content))
      throw new Error("Arquivo binário inválido.");
    const content = Buffer.from(value.content, "base64");
    if (
      content.length > 10000000 ||
      content.length < 4 ||
      content.toString("base64") !== value.content ||
      content.readUInt32LE(0) !== 0x04034b50
    )
      throw new Error("Pacote ZIP inválido ou excessivo.");
    return { extension: value.extension, content, ...named };
  }
  if (Buffer.byteLength(value.content, "utf8") > 10000000)
    throw new Error("Exportação excede 10 MB.");
  if (value.extension === "edi-animation.json") parseAnimationArtifact(value.content);
  return { extension: value.extension, content: value.content, ...named };
}
