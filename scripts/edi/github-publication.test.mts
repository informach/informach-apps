import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools";
import { publishGithubRelease } from "./github-publication.mts";

// Only the default command reaches `gh`; every other test injects its own command.
const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile }));

type Asset = { name: string; size: number; digest: string | null };
type Release = {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  body: string;
  assets: Asset[];
};
const version = "1.2.3";
const sourceCommit = "a".repeat(40);
const provenance = `<!-- edi-source:${sourceCommit} -->`;
/** Listing re-reads before giving up, in milliseconds. */
const backoff = [1000, 2000, 4000, 8000, 15000];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "edi-publication-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const files = [
    ...EDI_DESKTOP_APPS.map((app) => `${app.id}-${version}-win-x64.exe`),
    "edi-release.json",
  ].map((name) => join(directory, name));
  for (const file of files) await writeFile(file, `Fixture bytes: ${basename(file)}`);
  const state: {
    release: Release | null;
    creates: number;
    uploads: number;
    failAt: number;
    corrupt: boolean;
    edits: number;
    apiError?: Error;
    confirmPublication: boolean;
    /** Listing reads that still miss a just-created release, as GitHub does for a moment. */
    hiddenReads: number;
    /** Listing reads that still show the release as a draft after publication. */
    staleDraftReads: number;
    /** Listing reads that still miss the last uploaded asset of a complete draft. */
    staleAssetReads: number;
  } = {
    release: null,
    creates: 0,
    uploads: 0,
    failAt: 0,
    corrupt: false,
    edits: 0,
    confirmPublication: true,
    hiddenReads: 0,
    staleDraftReads: 0,
    staleAssetReads: 0,
  };
  const command = async (args: string[]): Promise<string> => {
    if (args[0] === "api") {
      if (state.apiError) throw state.apiError;
      if (args.includes("--slurp")) {
        if (!args.includes("--paginate")) throw new Error("Draft lookup requires pagination");
        if (state.release && state.hiddenReads > 0) {
          state.hiddenReads--;
          return JSON.stringify([[], []]);
        }
        if (state.release && !state.release.draft && state.staleDraftReads > 0) {
          state.staleDraftReads--;
          return JSON.stringify([[], [{ ...state.release, draft: true }]]);
        }
        if (
          state.release?.draft &&
          state.release.assets.length === 7 &&
          state.staleAssetReads > 0
        ) {
          state.staleAssetReads--;
          return JSON.stringify([
            [],
            [{ ...state.release, assets: state.release.assets.slice(0, -1) }],
          ]);
        }
        return JSON.stringify([[], state.release ? [state.release] : []]);
      }
      if (!state.release || state.release.draft)
        throw Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify(state.release);
    }
    if (args[0] !== "release") throw new Error("Unexpected external command");
    if (args[1] === "create") {
      state.creates++;
      state.release = {
        tag_name: `edi-v${version}`,
        prerelease: false,
        draft: true,
        body:
          args.find((argument) => argument.startsWith("--notes="))?.slice("--notes=".length) ?? "",
        assets: [],
      };
    } else if (args[1] === "upload") {
      state.uploads++;
      if (state.uploads === state.failAt) throw new Error("Interrupted upload");
      const file = args[3];
      if (!file || !state.release) throw new Error("Missing draft or upload");
      const bytes = await readFile(file);
      state.release.assets.push({
        name: basename(file),
        size: bytes.length,
        digest: `sha256:${state.corrupt ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex")}`,
      });
    } else if (args[1] === "edit") {
      state.edits++;
      if (!state.release) throw new Error("Missing draft");
      if (state.confirmPublication) state.release.draft = false;
    } else throw new Error("Unexpected external release command");
    return "";
  };
  const options = {
    repository: "informach/edi-releases",
    version,
    sourceCommit,
    notes: "Suíte Edi",
    files,
  };
  const draft = (): Release => ({
    tag_name: `edi-v${version}`,
    prerelease: false,
    draft: true,
    body: provenance,
    assets: [],
  });
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { options, state, command, draft, waits, wait };
}
describe("atomic GitHub suite publication", () => {
  it("refuses ambiguous draft identities across listing pages", async () => {
    const { options, state, command, draft } = await fixture();
    await expect(
      publishGithubRelease(options, async (args) =>
        args[0] === "api" ? JSON.stringify([[draft()], [draft()]]) : command(args),
      ),
    ).rejects.toThrow("Multiple GitHub releases");
    expect(state.uploads).toBe(0);
    expect(state.edits).toBe(0);
  });
  it("does not treat a missing listing endpoint as permission to create a release", async () => {
    const { options, state, command } = await fixture();
    state.apiError = Object.assign(new Error("Not Found"), { stderr: "gh: Not Found (HTTP 404)" });
    await expect(publishGithubRelease(options, command)).rejects.toThrow("Not Found");
    expect(state.release).toBeNull();
  });
  it("publishes exactly six installers and the manifest, with remote digest confirmation", async () => {
    const { options, state, command, wait } = await fixture();
    expect(await publishGithubRelease(options, command, wait)).toEqual({ reused: false });
    expect(state.release?.draft).toBe(false);
    expect(state.release?.assets.map((asset) => asset.name).sort()).toEqual(
      options.files.map((file) => basename(file)).sort(),
    );
    expect(state.release?.body).toContain(provenance);
  });
  it("resumes an interrupted draft without re-uploading existing bytes", async () => {
    const { options, state, command, wait } = await fixture();
    state.failAt = 4;
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "Interrupted upload",
    );
    expect(state.release?.draft).toBe(true);
    expect(state.release?.assets).toHaveLength(3);
    state.failAt = 0;
    await publishGithubRelease(options, command, wait);
    expect(state.release?.draft).toBe(false);
    expect(state.release?.assets).toHaveLength(7);
    expect(state.uploads).toBe(8);
    expect(state.creates).toBe(1);
  });
  it("never overwrites a conflicting asset already in a draft", async () => {
    const { options, state, command, draft } = await fixture();
    state.release = draft();
    state.release.assets.push({
      name: basename(options.files[0] ?? ""),
      size: 1,
      digest: `sha256:${"0".repeat(64)}`,
    });
    await expect(publishGithubRelease(options, command)).rejects.toThrow("not overwritten");
    expect(state.uploads).toBe(0);
    expect(state.release.draft).toBe(true);
  });
  it("reuses an identical published release, but rejects changed source or bytes", async () => {
    const { options, state, command, wait } = await fixture();
    await publishGithubRelease(options, command, wait);
    expect(await publishGithubRelease(options, command)).toEqual({ reused: true });
    await expect(
      publishGithubRelease({ ...options, sourceCommit: "b".repeat(40) }, command),
    ).rejects.toThrow("different source provenance");
    const first = options.files[0];
    if (!first) throw new Error("Missing fixture installer");
    await writeFile(first, "Changed bytes");
    await expect(publishGithubRelease(options, command)).rejects.toThrow("immutable");
    expect(state.edits).toBe(1);
  });
  it("keeps corrupted uploads unpublished", async () => {
    const { options, state, command, wait } = await fixture();
    state.corrupt = true;
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "Incomplete or altered",
    );
    expect(state.edits).toBe(0);
    expect(state.release?.draft).toBe(true);
  });
  it("rejects extra assets and duplicate input names instead of publishing partial or unrelated files", async () => {
    const { options, state, command, draft, wait } = await fixture();
    state.release = draft();
    state.release.assets.push({
      name: "unrelated.txt",
      size: 0,
      digest: `sha256:${"0".repeat(64)}`,
    });
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "Incomplete or altered",
    );
    await expect(
      publishGithubRelease({ ...options, files: Array(7).fill(options.files[0]) }, command),
    ).rejects.toThrow("canonical installers");
    expect(state.edits).toBe(0);
  });
  it("does not treat authentication failures as an absent release", async () => {
    const { options, state, command } = await fixture();
    state.apiError = Object.assign(new Error("Unauthorized"), {
      stderr: "gh: Unauthorized (HTTP 401)",
    });
    await expect(publishGithubRelease(options, command)).rejects.toThrow("Unauthorized");
    expect(state.release).toBeNull();
    expect(state.uploads).toBe(0);
  });
  it("rejects incorrect release channels and incomplete integrity metadata", async () => {
    const { options, state, command, draft } = await fixture();
    state.release = { ...draft(), prerelease: true };
    await expect(publishGithubRelease(options, command)).rejects.toThrow("identity or channel");
    state.release = draft();
    state.release.assets.push({ name: "unexpected", size: -1, digest: "untrusted" });
    await expect(publishGithubRelease(options, command)).rejects.toThrow();
    expect(state.uploads).toBe(0);
  });
  it("requires a confirmed public release after the final publish command", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.confirmPublication = false;
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(state.release?.draft).toBe(true);
    expect(waits).toEqual([...backoff, ...backoff]);
  });
  it("waits for a lagging listing to show the draft it just created", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.hiddenReads = 2;
    expect(await publishGithubRelease(options, command, wait)).toEqual({ reused: false });
    expect(waits).toEqual([...backoff, 1000, 2000]);
    expect(state.release?.draft).toBe(false);
    expect(state.uploads).toBe(7);
  });
  it("stops before uploading when the created draft never appears in the listing", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.hiddenReads = Number.POSITIVE_INFINITY;
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "draft release was not confirmed",
    );
    expect(waits).toEqual([...backoff, ...backoff]);
    expect(state.uploads).toBe(0);
    expect(state.edits).toBe(0);
  });
  it("waits for a lagging listing to confirm the publication", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.staleDraftReads = 1;
    expect(await publishGithubRelease(options, command, wait)).toEqual({ reused: false });
    expect(waits).toEqual([...backoff, 1000]);
    expect(state.edits).toBe(1);
  });
  it("trusts an empty listing only after the whole backoff, then creates a single draft", async () => {
    const { options, state, command, wait } = await fixture();
    const events: string[] = [];
    await publishGithubRelease(
      options,
      async (args) => {
        if (args[0] === "release" && args[1] === "create") events.push("create");
        return command(args);
      },
      async (ms) => {
        events.push(`wait ${ms}`);
        await wait(ms);
      },
    );
    expect(events).toEqual([...backoff.map((ms) => `wait ${ms}`), "create"]);
    expect(state.creates).toBe(1);
  });
  it("resumes the draft of a previous run that the first listing still misses, without creating another", async () => {
    const { options, state, command, draft, wait, waits } = await fixture();
    state.release = draft();
    state.hiddenReads = 2;
    expect(await publishGithubRelease(options, command, wait)).toEqual({ reused: false });
    expect(waits).toEqual([1000, 2000]);
    expect(state.creates).toBe(0);
    expect(state.uploads).toBe(7);
    expect(state.release.draft).toBe(false);
  });
  it("waits for every uploaded asset to reach the listing before publishing", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.staleAssetReads = 2;
    expect(await publishGithubRelease(options, command, wait)).toEqual({ reused: false });
    expect(waits).toEqual([...backoff, 1000, 2000]);
    expect(state.edits).toBe(1);
    expect(state.release?.draft).toBe(false);
  });
  it("keeps the draft unpublished when the listing never shows all seven assets", async () => {
    const { options, state, command, wait, waits } = await fixture();
    state.staleAssetReads = Number.POSITIVE_INFINITY;
    await expect(publishGithubRelease(options, command, wait)).rejects.toThrow(
      "Incomplete or altered",
    );
    expect(waits).toEqual([...backoff, ...backoff]);
    expect(state.edits).toBe(0);
    expect(state.release?.draft).toBe(true);
  });
  it("reads a listing with hundreds of releases through the default gh command", async () => {
    const { options, state, command, wait } = await fixture();
    await publishGithubRelease(options, command, wait);
    const published = state.release;
    if (!published) throw new Error("Missing published fixture release");
    // Other versions of the suite, each about as large as a real one in the listing.
    const others = Array.from({ length: 500 }, (_, index) => ({
      ...published,
      tag_name: `edi-v0.0.${index}`,
      body: `${provenance}\n${"Notas da versão. ".repeat(700)}`,
    }));
    const listing = JSON.stringify([others.slice(0, 250), [...others.slice(250), published]]);
    expect(listing.length).toBeGreaterThan(2 * 1024 ** 2);
    execFile.mockImplementation(
      (
        _file: string,
        args: string[],
        execOptions: { maxBuffer: number },
        callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
      ) => {
        if (args[0] !== "api") return callback(new Error("Unexpected external command"));
        // Same failure execFile raises when the output outgrows the buffer.
        if (listing.length > execOptions.maxBuffer)
          return callback(new RangeError("stdout maxBuffer length exceeded"));
        callback(null, { stdout: listing, stderr: "" });
      },
    );
    expect(await publishGithubRelease(options)).toEqual({ reused: true });
    expect(execFile).toHaveBeenCalledTimes(1);
  });
});
