import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { releaseArtifactUrl } from "@informach/edi-contracts";
import { signRelease } from "@informach/edi-contracts/release-signature";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { createInstallationManager } from "./installations";

// Keep signature verification, streaming, filesystem and inter-process locks real.
// The native execution boundary is tested with actual NSIS in edi-upgrade.yml.
const execution = vi.hoisted(() => ({ files: [] as Buffer[] }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: (
    path: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error) => void,
  ) => {
    void import("node:fs/promises")
      .then(async ({ readFile }) => {
        execution.files.push(await readFile(path));
        callback(new Error("Fixture stopped at native installer execution"));
      })
      .catch(callback);
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  execution.files.length = 0;
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "edi-installer-download-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const pair = generateKeyPairSync("ed25519");
  const keys = { test: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const installer = Buffer.from("Complete signed installer artifact bytes");
  const signed = signRelease(
    {
      version: "1.0.1",
      channel: "stable",
      sourceCommit: "a".repeat(40),
      publishedAt: "2026-10-17T12:00:00.000Z",
      notes: "Download recovery fixture",
      artifacts: EDI_DESKTOP_APPS.map((app) => ({
        appId: app.id,
        platform: "win32",
        arch: "x64",
        publisher: "Test fixture",
        url: releaseArtifactUrl("informach/edi-releases", "1.0.1", app.id),
        size: installer.length,
        sha512: createHash("sha512").update(installer).digest("base64"),
      })),
    },
    "test",
    pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  let mode: "interrupted" | "corrupted" | "complete" = "interrupted";
  vi.stubGlobal("fetch", async (url: URL) => {
    if (url.pathname.endsWith("edi-release.json")) return Response.json(signed);
    if (mode === "complete") return new Response(installer);
    if (mode === "corrupted") return new Response(Buffer.alloc(installer.length, 0));
    let first = true;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (first) {
            first = false;
            controller.enqueue(installer.subarray(0, 8));
          } else controller.error(new Error("Network interrupted during installer download"));
        },
      }),
    );
  });
  const manager = createInstallationManager({
    portalUrl: "https://edi-test.invalid",
    clientId: "test",
    publisher: "Test fixture",
    downloadHost: "github.com",
    distributionRepository: "informach/edi-releases",
    updateKeys: keys,
    trustedKeys: keys,
    updateChannel: "stable",
    environment: "production",
    localAppData: join(directory, "local"),
    directory,
    acceptRelease: async () => {},
  });
  return {
    directory,
    installer,
    manager,
    setMode: (value: typeof mode) => {
      mode = value;
    },
  };
}

describe("installer download recovery", () => {
  it("removes partial files, releases the runtime lock, and permits a verified complete retry", async () => {
    const f = await fixture();
    await expect(f.manager.install("edisvg")).rejects.toThrow("Network interrupted");
    expect(execution.files).toEqual([]);
    expect(await readdir(f.directory)).toEqual([]);
    expect((await f.manager.list()).find((app) => app.id === "edisvg")?.busy).toBe(false);
    f.setMode("complete");
    await expect(f.manager.install("edisvg")).rejects.toThrow(
      "Fixture stopped at native installer execution",
    );
    expect(execution.files).toEqual([f.installer]);
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("rejects same-size modified bytes before executing and permits a later retry", async () => {
    const f = await fixture();
    f.setMode("corrupted");
    await expect(f.manager.install("edisvg")).rejects.toThrow("integridade");
    expect(execution.files).toEqual([]);
    expect(await readdir(f.directory)).toEqual([]);
    f.setMode("complete");
    await expect(f.manager.install("edisvg")).rejects.toThrow(
      "Fixture stopped at native installer execution",
    );
    expect(execution.files).toEqual([f.installer]);
  });
});
