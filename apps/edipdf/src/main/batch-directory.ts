import { mkdtemp, open, realpath, rmdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { renameExclusive } from "./native-rename.ts";

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
/** Publish all generated files together in a new, exclusive directory beside the private staging directory. */
export async function commitBatchDirectory(
  parent: string,
  label: string,
  operation: "split" | "images",
  files: ReadonlyMap<string, Uint8Array>,
  checkpoint: () => Promise<void>,
): Promise<string> {
  const names = [...files.keys()];
  if (
    !names.length ||
    names.length > 101 ||
    names.some(
      (name) => !/^(?:manifest\.json|parte-\d{3}\.pdf|pagina-\d{4}\.(?:png|jpg))$/.test(name),
    )
  )
    throw new Error("Nomes/quantidade do lote inválidos para gravação.");
  let total = 0;
  for (const bytes of files.values()) {
    total += bytes.length;
    if (!bytes.length || bytes.length > 32 * 1024 * 1024 || total > 128 * 1024 * 1024)
      throw new Error("O lote excede os limites de gravação.");
  }
  const directory = await realpath(parent);
  if (!(await stat(directory)).isDirectory()) throw new Error("Escolha uma pasta de saída.");
  await checkpoint();
  const stage = await mkdtemp(join(directory, ".edipdf-lote-")),
    created: string[] = [];
  try {
    for (const [name, bytes] of files) {
      await checkpoint();
      const path = join(stage, name),
        handle = await open(path, "wx");
      created.push(path);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } catch (failure) {
        try {
          await handle.close();
        } catch (closeFailure) {
          throw new AggregateError(
            [failure, closeFailure],
            "Falha ao gravar e fechar um arquivo do lote.",
          );
        }
        throw failure;
      }
      await handle.close();
    }
    const stem =
      [...label.normalize("NFC").replace(/\.[^.]+$/, "")]
        .map((character) => {
          const code = character.charCodeAt(0);
          return code < 32 ||
            (character.length === 1 && code >= 0xd800 && code <= 0xdfff) ||
            /[<>:"/\\|?*]/.test(character)
            ? "_"
            : character;
        })
        .slice(0, 100)
        .join("")
        .replace(/[. ]+$/, "") || "Documento";
    for (let number = 1; number <= 10000; number++) {
      await checkpoint();
      const target = join(
        directory,
        `${stem} - ${operation === "split" ? "partes" : "imagens"}${number === 1 ? "" : ` (${number})`}`,
      );
      try {
        await stat(target);
        continue;
      } catch (failure) {
        if (!missing(failure)) throw failure;
      }
      await checkpoint();
      if ((await renameExclusive(stage, target)) === "created") return target;
    }
    throw new Error("Há pastas demais com o mesmo nome. Escolha outra pasta de saída.");
  } catch (failure) {
    const cleanup: unknown[] = [];
    // Only the known flat files created by this invocation are removed; unexpected files keep the directory intact.
    for (const path of created)
      try {
        await unlink(path);
      } catch (error) {
        if (!missing(error)) cleanup.push(error);
      }
    try {
      await rmdir(stage);
    } catch (error) {
      if (!missing(error)) cleanup.push(error);
    }
    if (cleanup.length)
      throw new AggregateError(
        [failure, ...cleanup],
        "A gravação falhou e sua pasta temporária não pôde ser limpa completamente.",
      );
    throw failure;
  }
}
