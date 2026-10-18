import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeThirdPartyNotices } from "./third-party-notices.mts";

it("distributes complete EdiPDF runtime notices, including the author-supplied tr46 license", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edi-pdf-notices-"));
  try {
    const count = await writeThirdPartyNotices("edipdf", directory);
    const notices = await readFile(join(directory, "THIRD-PARTY-NOTICES.txt"), "utf8");
    const license = await readFile(
      new URL("../../apps/edipdf/resources/licenses/TR46-MIT.txt", import.meta.url),
    );
    expect(count).toBeGreaterThan(50);
    expect(notices).toContain("pptxgenjs 4.0.1");
    expect(notices).toContain("tr46 0.0.3");
    expect(notices).toContain(license.toString("utf8"));
    expect(createHash("sha256").update(license).digest("hex")).toBe(
      "eeed1ca176eebad5c73870e233cfff03981fecd319c969475dfa3633036c336b",
    );
    expect(notices).not.toMatch(/\nhttps 1\.0\.0\n/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
