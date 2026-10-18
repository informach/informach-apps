import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { type GuidedStore, guidedStoreSchema, hashText } from "../shared/guidedPlan.ts";

/**
 * Drafts of the guided plans against a crash: every save of the recorder window
 * (recorder:guidedSave) is written to userData/guided-drafts/<projectId>.json before it goes to
 * the editor, so plans edited in the recorder survive the app or the computer going down before
 * the project was saved. Opening the recorder takes the draft when it is newer than the plans the
 * project has.
 */

/** Plans edited without a lesson open. */
export const NO_PROJECT = "sem-projeto";

const draftsDir = (): string => join(app.getPath("userData"), "guided-drafts");
/** The project's id as a file name; an id with other characters is named by its hash. */
const fileOf = (projectId: string): string =>
  join(
    draftsDir(),
    `${/^[\w-]{1,200}$/.test(projectId) ? projectId : `p-${hashText(projectId)}`}.json`,
  );

export async function writeGuidedDraft(projectId: string, store: GuidedStore): Promise<void> {
  const path = fileOf(projectId);
  await mkdir(draftsDir(), { recursive: true });
  const partial = `${path}.partial`;
  const file = await open(partial, "w");
  try {
    await file.writeFile(JSON.stringify(store));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(partial, path);
}

/** The draft of a project, or null when there is none or it cannot be read as plans. */
export async function readGuidedDraft(projectId: string): Promise<GuidedStore | null> {
  let text: string;
  try {
    text = await readFile(fileOf(projectId), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = guidedStoreSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
