import { createHash, generateKeyPairSync } from "node:crypto";
import { createReadStream, promises } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { releaseArtifactUrl } from "@informach/edi-contracts";
import { signRelease } from "@informach/edi-contracts/release-signature";
import { lock } from "proper-lockfile";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { writeInstallationReceipt } from "./installation-integrity";
import { createInstallationManager, type InstallActivity } from "./installations";

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
  const activity: InstallActivity[][] = [];
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
  const fileSystem = { ...promises, createReadStream };
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
    fileSystem,
    onActivity: (snapshot) => activity.push(snapshot),
  });
  /** Puts a signed installation of the tool on disk, as NSIS would leave it. */
  async function installed(id: (typeof EDI_DESKTOP_APPS)[number]["id"], version: string) {
    const app = EDI_DESKTOP_APPS.find((item) => item.id === id);
    if (!app) throw new Error("Unknown fixture app");
    const root = join(directory, "local", "Programs", "Edi", app.name);
    await mkdir(join(root, "resources"), { recursive: true });
    await writeFile(join(root, `${app.name}.exe`), "installed executable");
    await writeFile(join(root, "resources", "app.asar"), "installed application");
    await rm(join(root, "resources", "edi-installation.json"), { force: true });
    await writeInstallationReceipt({
      directory: root,
      appId: id,
      version,
      sourceCommit: "a".repeat(40),
      keyId: "test",
      privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    });
  }
  return {
    activity,
    directory,
    fileSystem,
    installed,
    installer,
    manager,
    setMode: (value: typeof mode) => {
      mode = value;
    },
  };
}

/** People read a sentence in Portuguese; the technical failure stays in `cause`. */
async function expectFailure(attempt: Promise<void>, cause: string) {
  const failure = await attempt.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(
    "Não foi possível instalar agora. Confira a internet e tente de novo.",
  );
  expect(((failure as Error).cause as Error).message).toContain(cause);
}

describe("installer download recovery", () => {
  it("removes partial files, releases the runtime lock, and permits a verified complete retry", async () => {
    const f = await fixture();
    await expectFailure(f.manager.install("edisvg"), "Network interrupted");
    expect(execution.files).toEqual([]);
    expect(await readdir(f.directory)).toEqual([]);
    const card = (await f.manager.list()).find((app) => app.id === "edisvg");
    expect(card?.busy).toBe(false);
    expect(card?.error).toBe(
      "Não foi possível instalar agora. Confira a internet e tente de novo.",
    );
    f.setMode("complete");
    await expectFailure(
      f.manager.install("edisvg"),
      "Fixture stopped at native installer execution",
    );
    expect(execution.files).toEqual([f.installer]);
    expect(await readdir(f.directory)).toEqual([]);
  });
  it("rejects same-size modified bytes before executing and permits a later retry", async () => {
    const f = await fixture();
    f.setMode("corrupted");
    await expect(f.manager.install("edisvg")).rejects.toThrow(
      "A integridade do instalador não confere.",
    );
    expect(execution.files).toEqual([]);
    expect(await readdir(f.directory)).toEqual([]);
    f.setMode("complete");
    await expectFailure(
      f.manager.install("edisvg"),
      "Fixture stopped at native installer execution",
    );
    expect(execution.files).toEqual([f.installer]);
  });
  it("checks an up-to-date tool without progress, download or its runtime lock", async () => {
    const f = await fixture();
    f.setMode("complete");
    await f.installed("edisvg", "1.0.1");
    // The tool is open: it holds its runtime lock for its whole lifetime.
    const releaseRunning = await lock(join(f.directory, "edisvg.runtime"), {
      realpath: false,
      retries: 0,
    });
    onTestFinished(() => releaseRunning());
    await expect(f.manager.install("edisvg")).resolves.toBeUndefined();
    await f.manager.updateInstalled();
    expect(f.activity).toEqual([]);
    expect(execution.files).toEqual([]);
    const card = (await f.manager.list()).find((app) => app.id === "edisvg");
    expect(card).toMatchObject({ installed: true, version: "1.0.1", error: null });
  });
  it("does not downgrade a tool updated by another process during the initial check", async () => {
    const f = await fixture();
    f.setMode("complete");
    await f.installed("edisvg", "1.0.0");
    let replaced = false;
    // Another updater finishes after our receipt was read, before we own the runtime
    // lock. Keep real signatures, files and locks; only coordinate that race here.
    f.fileSystem.readFile = new Proxy(f.fileSystem.readFile, {
      apply: async (target, receiver, args) => {
        const bytes = await Reflect.apply(target, receiver, args);
        if (!replaced && String(args[0]).endsWith("edi-installation.json")) {
          replaced = true;
          await f.installed("edisvg", "1.0.2");
        }
        return bytes;
      },
    });
    await expect(f.manager.install("edisvg")).resolves.toBeUndefined();
    expect(replaced).toBe(true);
    expect(f.activity).toEqual([]);
    expect(execution.files).toEqual([]);
    expect((await f.manager.list()).find((app) => app.id === "edisvg")?.version).toBe("1.0.2");
  });
  it("reports download and installation progress and clears it at the end", async () => {
    const f = await fixture();
    f.setMode("complete");
    await expectFailure(
      f.manager.install("edisvg"),
      "Fixture stopped at native installer execution",
    );
    const phases = f.activity.map((snapshot) => snapshot[0]?.phase ?? "idle");
    expect(phases[0]).toBe("downloading");
    expect(f.activity).toContainEqual([{ id: "edisvg", phase: "downloading", progress: 1 }]);
    expect(phases.indexOf("installing")).toBeGreaterThan(phases.lastIndexOf("downloading"));
    expect(f.activity.at(-1)).toEqual([]);
  });
});
