import {
  channelSchema,
  compareReleaseVersions,
  githubRepositorySchema,
  type ReleaseManifest,
  releaseArtifactUrl,
  releaseVersionSchema,
} from "@informach/edi-contracts";
import { readBoundedJson } from "@informach/edi-contracts/json-response";
import { verifyRelease } from "@informach/edi-contracts/release-signature";
import { z } from "zod";

export type PublicReleaseConfig = {
  repository: string;
  trustedKeys: Readonly<Record<string, string>>;
  channel: "stable" | "beta";
};
const githubHosts = new Set([
  "github.com",
  "api.github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);
/** Public requests never carry credentials, including through GitHub's asset redirects. */
export async function githubResponse(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let target = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    if (
      target.protocol !== "https:" ||
      !githubHosts.has(target.hostname) ||
      target.port ||
      target.username ||
      target.password
    )
      throw new Error("Unexpected GitHub download origin");
    const response = await fetcher(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: {
        Accept:
          target.hostname === "api.github.com"
            ? "application/vnd.github+json"
            : "application/octet-stream",
        "User-Agent": "Edi-Suite-Updater",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("GitHub returned an invalid download redirect");
    target = new URL(location, target);
  }
  throw new Error("Too many GitHub download redirects");
}
export async function boundedJson(response: Response, limit = 2 * 1024 ** 2): Promise<unknown> {
  if (!response.ok || !response.body)
    throw new Error(`GitHub metadata unavailable (${response.status})`);
  return readBoundedJson(response, limit);
}
export function validateGithubRelease(
  manifest: ReleaseManifest,
  repository: string,
  channel: "stable" | "beta",
) {
  githubRepositorySchema.parse(repository);
  if (manifest.channel !== channel) throw new Error("Release channel mismatch");
  for (const artifact of manifest.artifacts) {
    if (
      artifact.url !== releaseArtifactUrl(repository, manifest.version, artifact.appId) ||
      artifact.size >= 2 * 1024 ** 3
    )
      throw new Error("Unexpected release asset identity or size");
  }
  return manifest;
}
const releasesSchema = z
  .array(
    z.object({
      tag_name: z.string(),
      draft: z.boolean(),
      prerelease: z.boolean(),
    }),
  )
  .max(100);
export async function fetchPublicRelease(
  config: PublicReleaseConfig,
  fetcher: typeof fetch = fetch,
): Promise<ReleaseManifest | null> {
  const repository = githubRepositorySchema.parse(config.repository);
  const channel = channelSchema.parse(config.channel);
  let url = `https://github.com/${repository}/releases/latest/download/edi-release.json`;
  if (channel === "beta") {
    const listing = await githubResponse(
      `https://api.github.com/repos/${repository}/releases?per_page=100`,
      fetcher,
    );
    if (listing.status === 404) return null;
    const candidates = releasesSchema
      .parse(await boundedJson(listing))
      .filter(
        (release) =>
          !release.draft &&
          release.prerelease &&
          release.tag_name.startsWith("edi-v") &&
          release.tag_name.includes("-beta.") &&
          releaseVersionSchema.safeParse(release.tag_name.slice(5)).success,
      );
    candidates.sort((a, b) => compareReleaseVersions(b.tag_name.slice(5), a.tag_name.slice(5)));
    const release = candidates[0];
    if (!release) return null;
    url = `https://github.com/${repository}/releases/download/${release.tag_name}/edi-release.json`;
  }
  const response = await githubResponse(url, fetcher);
  if (response.status === 404) return null;
  const signed = verifyRelease(await boundedJson(response), config.trustedKeys);
  return validateGithubRelease(signed.manifest, repository, channel);
}
