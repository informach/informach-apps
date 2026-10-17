import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReleaseManifest } from "@informach/edi-contracts";
import { describe, expect, it } from "vitest";
import { createReleaseAcceptance } from "./release-policy";
import { createVault } from "./vault";

const manifest = (version: string, channel: "stable" | "beta" = "stable"): ReleaseManifest => ({
  version,
  channel,
  publishedAt: new Date().toISOString(),
  sourceCommit: "a".repeat(40),
  notes: "policy test",
  artifacts: [],
});
describe("shared suite release acceptance", () => {
  it("rejects replay even for a missing, reinstalled or older tool, persisting across clients", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edi-release-policy-"));
    const vaultConfig = {
      directory,
      seal: (value: string) => Buffer.from(value),
      unseal: (value: Buffer) => value.toString(),
    };
    try {
      const updater = createReleaseAcceptance({
        vault: createVault(vaultConfig),
        currentVersion: "1.0.0",
        channel: "stable",
      });
      await updater(manifest("2.0.0"));
      for (const currentVersion of ["0.0.0", "1.0.0", "2.0.0"]) {
        const hub = createReleaseAcceptance({
          vault: createVault(vaultConfig),
          currentVersion,
          channel: "stable",
        });
        await expect(hub(manifest("1.5.0"))).rejects.toThrow(/antiga/);
        await expect(hub(manifest("2.0.0"))).resolves.toBeUndefined();
      }
      const beta = createReleaseAcceptance({
        vault: createVault(vaultConfig),
        currentVersion: "0.0.0",
        channel: "beta",
      });
      await beta(manifest("1.0.0-beta.1", "beta"));
      await expect(beta(manifest("3.0.0"))).rejects.toThrow(/Canal/);
      await expect(updater(manifest("2.0.0"))).resolves.toBeUndefined();
      await expect(beta(manifest("0.9.0-beta.1", "beta"))).rejects.toThrow(/antiga/);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
