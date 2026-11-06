import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { describe, expect, it } from "vitest";
import {
  assertCompleteRelease,
  leaseClaimsSchema,
  releaseArtifactUrl,
  releaseManifestSchema,
  toolsForClient,
} from "./index";

/**
 * Installed clients must keep working when a suite adds a tool: they read releases and leases
 * naming apps they do not know, and the publisher still ships complete releases.
 */
const artifact = (appId: string) => ({
  appId,
  platform: "win32",
  arch: "x64",
  url: releaseArtifactUrl("informach/edi-releases", "1.0.0", appId),
  sha512: Buffer.alloc(64).toString("base64"),
  size: 1024,
  publisher: "Informach",
});
const release = (ids: string[]) => ({
  version: "1.0.0",
  channel: "stable",
  publishedAt: "2026-11-06T12:00:00.000Z",
  sourceCommit: "a".repeat(40),
  notes: "",
  artifacts: ids.map(artifact),
});
const current = EDI_DESKTOP_APPS.map((app) => app.id);

describe("forward-compatible suite contracts", () => {
  it("reads an older release without the newest tool, and a newer one with an unknown tool", () => {
    const older = current.filter((id) => id !== "ediplayer");
    expect(releaseManifestSchema.parse(release(older)).artifacts).toHaveLength(older.length);
    const newer = [...current, "edifuturo"];
    expect(releaseManifestSchema.parse(release(newer)).artifacts).toHaveLength(newer.length);
  });
  it("refuses a release without the Hub, with a repeated app or a malformed id", () => {
    expect(releaseManifestSchema.safeParse(release(["ediaula"])).success).toBe(false);
    expect(releaseManifestSchema.safeParse(release([...current, "ediaula"])).success).toBe(false);
    expect(() => releaseArtifactUrl("informach/edi-releases", "1.0.0", "../x")).toThrow();
  });
  it("publishes only complete releases of this catalog", () => {
    expect(() =>
      assertCompleteRelease(releaseManifestSchema.parse(release(current))),
    ).not.toThrow();
    const older = current.filter((id) => id !== "ediplayer");
    expect(() => assertCompleteRelease(releaseManifestSchema.parse(release(older)))).toThrow();
    expect(() =>
      assertCompleteRelease(releaseManifestSchema.parse(release([...current, "edifuturo"]))),
    ).toThrow();
  });
  it("leaves a tool out of the leases of clients older than it", () => {
    expect(toolsForClient("0.4.2")).not.toContain("ediplayer");
    expect(toolsForClient("0.5.0")).toContain("ediplayer");
    expect(toolsForClient("0.5.0-beta.1")).not.toContain("ediplayer");
  });
  it("reads a lease that names a tool this client does not know", () => {
    const claims = {
      version: 1,
      iss: "https://edi.example.com",
      aud: "edi-desktop",
      environment: "production",
      sub: "user",
      deviceId: crypto.randomUUID(),
      keyThumbprint: "a".repeat(64),
      activationId: crypto.randomUUID(),
      revision: 1,
      minimumClientVersion: "0.1.0",
      tools: ["ediaula", "edifuturo"],
      iat: 1000,
      nbf: 1000,
      exp: 2000,
      paidThrough: 3000,
      jti: crypto.randomUUID(),
    };
    expect(leaseClaimsSchema.parse(claims).tools).toContain("edifuturo");
    expect(leaseClaimsSchema.safeParse({ ...claims, tools: ["ediaula", "ediaula"] }).success).toBe(
      false,
    );
  });
});
