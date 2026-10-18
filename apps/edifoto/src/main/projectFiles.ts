import { constants } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import { atomicWrite } from "@informach/edi-desktop/files";
import { decodeArchive } from "../shared/documentFormat.ts";

export async function saveProjectFile(path: string, bytes: Uint8Array): Promise<void> {
  decodeArchive(bytes);
  try {
    const previous = await readFile(path);
    if (previous.subarray(0, 8).toString() === "EDIFOTO1") {
      try {
        await copyFile(path, `${path}.v1.bak`, constants.COPYFILE_EXCL);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await atomicWrite(path, bytes);
}
