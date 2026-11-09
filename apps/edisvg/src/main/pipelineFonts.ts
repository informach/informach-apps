import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type BundledFamily, type BundledFont, bundledFamilySchema } from "../shared/pipelines";

/**
 * The fonts a pipeline offers for titles and body text: EdiAula's bundle (all SIL Open Font
 * License 1.1, static TTF), the same families the lesson's captions and annotations use. The
 * installer copies apps/ediaula/resources/fonts and its fonts.json beside the app (resources/fonts);
 * in development they are read where EdiAula keeps them. A font goes to the window only by family
 * and weight of the list, never by a path the window names.
 */

export interface FontSource {
  /** The folder of the TTF files and of LICENSES.txt. */
  dir: string;
  /** EdiAula's fonts.json. */
  manifest: string;
}

const manifestSchema = z
  .array(
    z.object({
      family: z.string(),
      group: z.string(),
      files: z
        .array(
          z.object({
            weight: z.number().int(),
            file: z.string().regex(/^[A-Za-z0-9_.-]+\.ttf$/),
          }),
        )
        .min(1),
    }),
  )
  .max(64);
type Manifest = z.infer<typeof manifestSchema>;

const manifests = new Map<string, Promise<Manifest>>();
function manifestOf(source: FontSource): Promise<Manifest> {
  let value = manifests.get(source.manifest);
  if (!value) {
    value = readFile(source.manifest, "utf8")
      .then((text) => manifestSchema.parse(JSON.parse(text)))
      .catch((error: unknown) => {
        manifests.delete(source.manifest);
        throw new Error(
          `As fontes do EdiSVG não foram encontradas (${error instanceof Error ? error.message : "lista ilegível"}).`,
        );
      });
    manifests.set(source.manifest, value);
  }
  return value;
}

/** The families, with their weights, in the bundle's order. */
export async function pipelineFonts(source: FontSource): Promise<BundledFamily[]> {
  return (await manifestOf(source)).map((family) =>
    bundledFamilySchema.parse({
      family: family.family,
      group: family.group,
      weights: family.files.map((file) => file.weight).sort((a, b) => a - b),
    }),
  );
}

/**
 * The notice embedded with the font in the project: the copyright and version of its file, from
 * LICENSES.txt, and the license text that closes that file.
 */
async function noticeOf(source: FontSource, file: string): Promise<string> {
  const text = (await readFile(join(source.dir, "LICENSES.txt"), "utf8")).replace(/\r\n/g, "\n");
  const block = text.split("\n\n\n").find((part) => part.trim().startsWith(`${file}\n`));
  const license = text.indexOf("SIL OPEN FONT LICENSE Version 1.1");
  if (!block || license < 0) throw new Error(`O aviso de licença de ${file} não foi encontrado.`);
  const lines = block
    .trim()
    .split("\n")
    .slice(1)
    .filter((line) => !line.startsWith("SHA-256"));
  const start = text.lastIndexOf("\n---", license);
  return [
    ...lines,
    "Licenciada sob a SIL Open Font License 1.1; o texto da licença segue.",
    "",
    text.slice(start < 0 ? license : start + 1).trim(),
  ]
    .join("\n")
    .slice(0, 16000);
}

/** One font file of the bundle, by family and weight. */
export async function pipelineFont(
  source: FontSource,
  family: unknown,
  weight: unknown,
): Promise<BundledFont> {
  const entry = (await manifestOf(source)).find((item) => item.family === family);
  const file = entry?.files.find((item) => item.weight === weight);
  if (!entry || !file)
    throw new Error(`A fonte ${String(family)} (peso ${String(weight)}) não vem com o EdiSVG.`);
  const bytes = await readFile(join(source.dir, file.file));
  return {
    family: entry.family,
    weight: file.weight,
    name: file.file,
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    notice: await noticeOf(source, file.file),
  };
}
