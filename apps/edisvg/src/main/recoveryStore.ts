import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import { PROJECT_BYTES, parseJsonText, readBoundedText } from "./boundedText.ts";

const checkpointSchema = z.strictObject({
  version: z.literal(1),
  document: z.unknown(),
});

/** One fixed app-owned destination. A null document is a durable clean marker:
 * it prevents an old browser autosave from being resurrected after Save/Discard. */
export function createRecoveryStore<T>(path: string, parse: (input: unknown) => T) {
  return {
    async load(): Promise<{ exists: boolean; project: T | null }> {
      let text: string;
      try {
        text = await readBoundedText(path, PROJECT_BYTES + 1024);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT")
          return { exists: false, project: null };
        throw new Error("Não foi possível ler a recuperação. A cópia existente foi preservada.", {
          cause: error,
        });
      }
      try {
        const data = checkpointSchema.parse(parseJsonText(text));
        return { exists: true, project: data.document === null ? null : parse(data.document) };
      } catch (error) {
        throw new Error(
          "A cópia de recuperação é incompatível ou inválida. Ela foi preservada; não será substituída por um projeto vazio.",
          { cause: error },
        );
      }
    },
    async save(project: T | null): Promise<void> {
      const document = project === null ? null : parse(project);
      const text = JSON.stringify({ version: 1, document });
      if (Buffer.byteLength(text, "utf8") > PROJECT_BYTES + 1024)
        throw new Error("A recuperação excede o limite de bytes. Salve o projeto em arquivo.");
      await atomicWrite(path, text);
    },
  };
}
