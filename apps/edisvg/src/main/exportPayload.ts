import { z } from "zod";

const textSchema = z.strictObject({
  extension: z.enum(["html", "svg", "edisvg.json", "lottie.json"]),
  content: z.string(),
  encoding: z.literal("utf8").optional(),
});
const binarySchema = z.strictObject({
  extension: z.literal("react.zip"),
  content: z.string(),
  encoding: z.literal("base64"),
});
/** IPC only writes after a native Save dialog; it never trusts a client path.
 * Bound encoded/decoded sizes before allocating and require canonical base64. */
export function parseExportPayload(input: unknown): {
  extension: string;
  content: string | Buffer;
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
    return { extension: value.extension, content };
  }
  if (Buffer.byteLength(value.content, "utf8") > 10000000)
    throw new Error("Exportação excede 10 MB.");
  return { extension: value.extension, content: value.content };
}
