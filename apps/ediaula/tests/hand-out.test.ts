import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { withReadGrant } from "../src/main/handOut.ts";

/**
 * whisper:transcribe and voice:render hand a new cache file to the editor: with a fake engine
 * writing a transcript, the path that comes back is readable at once (media:// checks it the
 * same way), and without the grant it would not be.
 */
test("a transcript made now is readable by the editor as soon as its path comes back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-handout-"));
  try {
    const files = createFileAuthority(["ediaula"]);
    const fakeTranscribe = async (jobId: string, language: string): Promise<string> => {
      const out = join(dir, `transcript-${jobId}-${language}.json`);
      await writeFile(out, JSON.stringify({ version: 1, words: [] }));
      return out;
    };
    const bare = await fakeTranscribe("a", "pt");
    await assert.rejects(files.assertRead(bare), /Selecione/);
    const handed = await withReadGrant(fakeTranscribe, files.grantRead)("b", "pt");
    assert.equal(await files.assertRead(handed), handed);
    // Arguments go through as they are.
    assert.match(handed, /transcript-b-pt\.json$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
