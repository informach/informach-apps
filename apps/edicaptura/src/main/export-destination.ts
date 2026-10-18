import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const comparable = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value);
const internal = (root: string, file: string) => {
  const relative = path.relative(comparable(root), comparable(file));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};

/** Stage outside the library and retain its authority through the last async check. */
export async function publishIndividualExport(
  libraryRoot: string,
  destination: string,
  assertAuthority: () => void,
  write: (staging: string) => Promise<void>,
) {
  assertAuthority();
  if (!path.isAbsolute(destination) || destination.includes("\0"))
    throw new Error("Escolha um arquivo local absoluto fora da biblioteca.");
  const root = await fs.realpath(libraryRoot);
  assertAuthority();
  const parent = await fs.realpath(path.dirname(destination));
  assertAuthority();
  // Use the physical parent for staging/publication so an alias change cannot redirect writes.
  const target = path.join(parent, path.basename(destination));
  const checkDestination = async () => {
    const currentRoot = await fs.realpath(libraryRoot);
    assertAuthority();
    const currentParent = await fs.realpath(path.dirname(destination));
    assertAuthority();
    if (
      comparable(currentRoot) !== comparable(root) ||
      comparable(currentParent) !== comparable(parent)
    )
      throw new Error("A pasta mudou durante a exportação. Escolha o destino novamente.");
    let actual = target;
    try {
      actual = await fs.realpath(target);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    assertAuthority();
    if (internal(root, target) || internal(root, actual))
      throw new Error(
        "O original não pode ser substituído; escolha um destino fora da biblioteca.",
      );
  };
  await checkDestination();
  assertAuthority();
  const staging = path.join(parent, `.${randomUUID()}.export-part`);
  try {
    await write(staging);
    assertAuthority();
    await checkDestination();
    // No asynchronous work between this authority check and invoking publication.
    assertAuthority();
    await fs.rename(staging, target);
  } finally {
    await fs.rm(staging, { force: true });
  }
}
