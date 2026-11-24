import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";

/**
 * Where a pipeline run stopped, per project (`pipeline-runs/<project id>.json` in EdiSVG's
 * profile): the steps and parts of the draft already done and what they handed on, so "Continuar
 * de onde parou" does not run them again. A project is open in one window at a time, so one
 * folder serves every window. The renderer shapes the record (pipelines/runner.ts); here it is
 * only kept, bounded in size, and gone when the run ends well or starts over.
 */

const PROJECT = /^project-[\w-]{1,100}$/;
/** A record is the run's facts (sentences, shots, ids), never media. */
export const RUN_RECORD_MAX = 4 * 1024 * 1024;

const fileOf = (userData: string, projectId: unknown) => {
  if (typeof projectId !== "string" || !PROJECT.test(projectId))
    throw new Error("Projeto inválido.");
  return join(userData, "pipeline-runs", `${projectId}.json`);
};

export async function saveRun(userData: string, projectId: unknown, record: unknown) {
  const file = fileOf(userData, projectId);
  if (typeof record !== "object" || record === null || Array.isArray(record))
    throw new Error("Registro do pipeline inválido.");
  const text = JSON.stringify(record);
  if (Buffer.byteLength(text) > RUN_RECORD_MAX)
    throw new Error("O registro do pipeline ficou grande demais para guardar.");
  await mkdir(dirname(file), { recursive: true });
  await atomicWrite(file, text);
}

/** The record kept for the project, or null (none, or unreadable). */
export async function loadRun(userData: string, projectId: unknown): Promise<unknown> {
  const file = fileOf(userData, projectId);
  try {
    const text = await readFile(file, "utf8");
    if (Buffer.byteLength(text) > RUN_RECORD_MAX) return null;
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export async function clearRun(userData: string, projectId: unknown) {
  await rm(fileOf(userData, projectId), { force: true });
}
