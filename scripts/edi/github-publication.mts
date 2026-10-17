import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools";
import {
  githubRepositorySchema,
  releaseVersionSchema,
} from "../../packages/edi-contracts/src/index";

const execute = promisify(execFile);
type Command = (args: string[]) => Promise<string>;
const releaseSchema = z.object({
  draft: z.boolean(),
  prerelease: z.boolean(),
  tag_name: z.string(),
  body: z
    .string()
    .nullable()
    .transform((value) => value ?? ""),
  assets: z
    .array(
      z.object({
        name: z.string().min(1),
        size: z.number().int().nonnegative(),
        digest: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .nullable(),
      }),
    )
    .refine(
      (assets) => new Set(assets.map((asset) => asset.name)).size === assets.length,
      "Duplicate GitHub release asset names",
    ),
});
async function sha256(path: string) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { name: basename(path), size, digest: `sha256:${hash.digest("hex")}` };
}
/** Resume incomplete drafts without overwriting assets; publish only a complete suite. */
export async function publishGithubRelease(
  options: {
    repository: string;
    version: string;
    sourceCommit: string;
    notes: string;
    files: string[];
  },
  command: Command = async (args) =>
    (await execute("gh", args, { windowsHide: true, timeout: 900000, maxBuffer: 2 * 1024 ** 2 }))
      .stdout,
) {
  const repository = githubRepositorySchema.parse(options.repository);
  const version = releaseVersionSchema.parse(options.version);
  if (!/^[a-f0-9]{40}$/.test(options.sourceCommit) || options.files.length !== 7)
    throw new Error("Publication requires a pinned source and exactly seven suite assets");
  const tag = `edi-v${version}`;
  const beta = version.includes("-beta.");
  const provenance = `<!-- edi-source:${options.sourceCommit} -->`;
  const endpoint = `repos/${repository}/releases/tags/${tag}`;
  const expectedNames = new Set([
    ...EDI_DESKTOP_APPS.map((app) => `${app.id}-${version}-win-x64.exe`),
    "edi-release.json",
  ]);
  const actualNames = options.files.map((file) => basename(file));
  if (new Set(actualNames).size !== 7 || actualNames.some((name) => !expectedNames.has(name)))
    throw new Error("Publication requires the six canonical installers and signed suite manifest");
  const expected = await Promise.all(options.files.map(sha256));
  const sameAssets = (release: z.infer<typeof releaseSchema>) =>
    release.assets.length === 7 &&
    expected.every((item) =>
      release.assets.some(
        (asset) =>
          asset.name === item.name && asset.size === item.size && asset.digest === item.digest,
      ),
    );
  async function read() {
    try {
      const raw: unknown = JSON.parse(await command(["api", endpoint]));
      const parsed = releaseSchema.parse(raw);
      if (parsed.tag_name !== tag || parsed.prerelease !== beta)
        throw new Error("GitHub release identity or channel does not match the requested version");
      return parsed;
    } catch (error) {
      if (
        error instanceof Error &&
        "stderr" in error &&
        typeof error.stderr === "string" &&
        error.stderr.includes("(HTTP 404)")
      )
        return null;
      throw error;
    }
  }
  let release = await read();
  if (release && !release.body.includes(provenance))
    throw new Error("Version already belongs to different source provenance");
  if (release && !release.draft) {
    if (!sameAssets(release))
      throw new Error("Published release is immutable and does not match these artifacts");
    return { reused: true };
  }
  if (!release) {
    await command([
      "release",
      "create",
      tag,
      "--repo",
      repository,
      "--draft",
      ...(beta ? ["--prerelease"] : []),
      "--title",
      `Suíte Edi ${version}`,
      `--notes=${options.notes}\n\n${provenance}`,
    ]);
    release = await read();
    if (!release?.draft) throw new Error("GitHub draft release was not confirmed");
  }
  for (let index = 0; index < expected.length; index++) {
    const item = expected[index];
    const file = options.files[index];
    if (!item || !file) throw new Error("Missing suite asset");
    const existing = release.assets.find((asset) => asset.name === item.name);
    if (existing) {
      if (existing.digest !== item.digest || existing.size !== item.size)
        throw new Error("Existing draft asset has different bytes; it was not overwritten");
    } else await command(["release", "upload", tag, file, "--repo", repository]);
  }
  const complete = await read();
  if (!complete?.draft || !complete.body.includes(provenance) || !sameAssets(complete))
    throw new Error("Incomplete or altered suite draft; the previous version remains active");
  await command([
    "release",
    "edit",
    tag,
    "--repo",
    repository,
    "--draft=false",
    ...(beta ? ["--prerelease"] : ["--latest"]),
  ]);
  const published = await read();
  if (
    !published ||
    published.draft ||
    !published.body.includes(provenance) ||
    !sameAssets(published)
  )
    throw new Error("GitHub publication could not be confirmed; retry without replacing assets");
  return { reused: false };
}
