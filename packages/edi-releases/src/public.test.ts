import { generateKeyPairSync } from "node:crypto";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { type ReleaseManifest, releaseArtifactUrl } from "@informach/edi-contracts";
import { signRelease } from "@informach/edi-contracts/release-signature";
import { describe, expect, it } from "vitest";
import { boundedJson, fetchPublicRelease, githubResponse } from "./public";

const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const trustedKeys = { pilot: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
const repository = "informach/edi-releases";
function manifest(version = "1.0.0"): ReleaseManifest {
  return {
    version,
    channel: version.includes("-beta.") ? "beta" : "stable",
    notes: "Piloto",
    publishedAt: "2026-10-16T12:00:00.000Z",
    sourceCommit: "a".repeat(40),
    artifacts: EDI_DESKTOP_APPS.map((app) => ({
      appId: app.id,
      platform: "win32",
      arch: "x64",
      publisher: "Informach — piloto",
      url: releaseArtifactUrl(repository, version, app.id),
      size: 1024,
      sha512: Buffer.alloc(64).toString("base64"),
    })),
  };
}
describe("public GitHub release discovery", () => {
  it("verifies the complete signed suite before exposing an update", async () => {
    const release = manifest();
    const transport: typeof fetch = async (_input, init) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(init?.redirect).toBe("manual");
      return Response.json(signRelease(release, "pilot", privateKey));
    };
    expect(
      await fetchPublicRelease({ repository, trustedKeys, channel: "stable" }, transport),
    ).toEqual(release);
  });
  it("rejects unsigned metadata and even signed installers outside the configured repository", async () => {
    const config = { repository, trustedKeys, channel: "stable" as const };
    await expect(
      fetchPublicRelease(config, async () => Response.json(manifest())),
    ).rejects.toThrow();
    const other = manifest();
    const first = other.artifacts[0];
    if (!first) throw new Error("Fixture requires an artifact");
    first.url = "https://github.com/other/repository/releases/download/edi-v1.0.0/tool.exe";
    await expect(
      fetchPublicRelease(config, async () =>
        Response.json(signRelease(other, "pilot", privateKey)),
      ),
    ).rejects.toThrow("asset identity");
  });
  it("returns no installer for a repository without a published release", async () => {
    expect(
      await fetchPublicRelease(
        { repository, trustedKeys, channel: "stable" },
        async () => new Response(null, { status: 404 }),
      ),
    ).toBeNull();
  });
  it("selects beta versions numerically and never considers draft releases", async () => {
    const transport: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.github.com/"))
        return Response.json([
          { tag_name: "edi-v1.0.0-beta.11", draft: true, prerelease: true },
          { tag_name: "edi-v1.0.0-beta.9", draft: false, prerelease: true },
          { tag_name: "edi-v1.0.0-beta.10", draft: false, prerelease: true },
        ]);
      expect(url).toContain("edi-v1.0.0-beta.10");
      return Response.json(signRelease(manifest("1.0.0-beta.10"), "pilot", privateKey));
    };
    expect(
      (await fetchPublicRelease({ repository, trustedKeys, channel: "beta" }, transport))?.version,
    ).toBe("1.0.0-beta.10");
  });
  it("rejects redirects to non-GitHub origins and bounds streamed metadata", async () => {
    await expect(
      githubResponse(
        "https://github.com/informach/edi-releases",
        async () =>
          new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
      ),
    ).rejects.toThrow("origin");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32));
        controller.enqueue(new Uint8Array(32));
        controller.close();
      },
    });
    await expect(boundedJson(new Response(stream), 40)).rejects.toThrow("Oversized");
  });
});
