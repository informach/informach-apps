import { execFile } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { z } from "zod";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { type DesktopAppId, leaseClaimsSchema } from "../../packages/edi-contracts/src/index.ts";
import type { VaultData } from "../../packages/edi-desktop/src/vault";

/**
 * What the native Electron runners share (test-native.mts, visual-ediaula.mts): the pinned
 * tooling, an isolated temporary root, a loopback portal that is always unavailable, ephemeral
 * license keys baked into a development build, signed offline leases written through the
 * native-vault fixture, and the launch of a tool with an isolated profile. Nothing here talks to
 * a real portal, installs anything or touches the user's own profile.
 */

declare const ediNativeFixture: {
  readIdentity(): Promise<unknown>;
  writeLease(fixture: {
    session: NonNullable<VaultData["session"]>;
    lease: string;
    tools: string[];
    time: number;
  }): Promise<void>;
};

export const execute = promisify(execFile);

/** Windows, the workspace's pinned pnpm and its Electron: checked before anything starts. */
export function nativeTooling(): { packageManager: string; electronPath: string } {
  if (process.platform !== "win32") throw new Error("Native suite tests require Windows");
  const packageManager = process.env.npm_execpath;
  if (!packageManager || !isAbsolute(packageManager) || basename(packageManager) !== "pnpm.cjs")
    throw new Error("Run native tests through the pinned pnpm workspace script");
  const toolingRequire = createRequire(import.meta.url);
  const electronPath: unknown = toolingRequire("electron");
  if (typeof electronPath !== "string") throw new Error("Electron executable was not resolved");
  return { packageManager, electronPath };
}

export interface NativeHarness {
  /** Temporary directory under the OS temp folder; removed by dispose(). */
  root: string;
  /** The loopback "portal": every request answers 503. */
  issuer: string;
  /** Environment of the development build and of the launched tool. */
  buildEnvironment: Record<string, string>;
  /** Builds the tool with the ephemeral license key and checks its entry point exists. */
  build(id: DesktopAppId): Promise<void>;
  /** Starts the built tool with an isolated profile and the native-vault fixture. */
  launch(
    id: DesktopAppId,
    profile: { userData: string; suiteData: string },
    extraEnvironment?: Record<string, string>,
    extraArguments?: readonly string[],
  ): Promise<ElectronApplication>;
  /** Writes a lease signed by the ephemeral key, valid for `ttl` seconds (at most 3600). */
  seedLease(application: ElectronApplication, ttl: number): Promise<void>;
  /** Closes the portal and removes the root; returns what failed instead of throwing. */
  dispose(): Promise<unknown[]>;
}

/** `prefix` names the temporary root ("edi-native-"), which dispose() checks before removing. */
export async function createNativeHarness(
  prefix: string,
  packageManager: string,
): Promise<NativeHarness> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const signingKeys = generateKeyPairSync("ed25519");
  const publicKey = signingKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const server = createServer((_request, response) => {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "temporarily_unavailable" }));
  });
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ready);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture did not bind");
  const issuer = `http://127.0.0.1:${address.port}`;
  const baseEnvironment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env))
    if (
      typeof value === "string" &&
      !name.startsWith("EDI_") &&
      !["NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "ELECTRON_RENDERER_URL"].includes(name)
    )
      baseEnvironment[name] = value;
  const buildEnvironment = {
    ...baseEnvironment,
    EDI_COMMERCIAL_BUILD: "false",
    EDI_PORTAL_URL: issuer,
    EDI_DESKTOP_CLIENT_ID: "ephemeral-native-test",
    EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({ "native-test": publicKey }),
    EDI_UPDATE_PUBLIC_KEYS: "{}",
  };

  async function seedLease(application: ElectronApplication, ttl: number) {
    const identity = z
      .object({ deviceId: z.uuid(), keyThumbprint: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await application.evaluate(() => ediNativeFixture.readIdentity()));
    const time = Date.now();
    const now = Math.floor(time / 1000);
    const activationId = randomUUID();
    const sessionId = randomUUID();
    const claims = leaseClaimsSchema.parse({
      version: 1,
      iss: issuer,
      aud: "edi-desktop",
      environment: "development",
      sub: "native-fixture-account",
      ...identity,
      activationId,
      revision: 0,
      minimumClientVersion: "0.0.0",
      tools: EDI_TOOLS.map((tool) => tool.id),
      iat: now,
      nbf: now,
      exp: now + ttl,
      paidThrough: now + 3600,
      jti: randomUUID(),
    });
    const header = Buffer.from(
      JSON.stringify({ alg: "EdDSA", typ: "edi-license+jwt", kid: "native-test" }),
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const payload = `${header}.${body}`;
    const lease = `${payload}.${sign(null, Buffer.from(payload), signingKeys.privateKey).toString("base64url")}`;
    const session = {
      userId: claims.sub,
      activationId,
      sessionId,
      keyThumbprint: identity.keyThumbprint,
      accessToken: "ephemeral-native-access",
      refreshToken: "ephemeral-native-refresh",
      accessExpiresAt: time + 300000,
      sessionExpiresAt: new Date(time + 86400000).toISOString(),
    };
    await application.evaluate((_electron, fixture) => ediNativeFixture.writeLease(fixture), {
      session,
      lease,
      tools: claims.tools,
      time,
    });
  }

  async function build(id: DesktopAppId) {
    const applicationRoot = resolve("apps", id);
    await execute(process.execPath, [packageManager, "--filter", `@informach/${id}`, "build"], {
      env: buildEnvironment,
      windowsHide: true,
      timeout: 600000,
      maxBuffer: 2 * 1024 ** 2,
    });
    const manifest = z
      .object({ main: z.string().min(1) })
      .parse(JSON.parse(await readFile(join(applicationRoot, "package.json"), "utf8")));
    await access(join(applicationRoot, manifest.main));
  }

  function launch(
    id: DesktopAppId,
    profile: { userData: string; suiteData: string },
    extraEnvironment: Record<string, string> = {},
    extraArguments: readonly string[] = [],
  ) {
    const applicationRoot = resolve("apps", id);
    const { userData, suiteData } = profile;
    return _electron.launch({
      // The standard workspace launcher holds app readiness until Playwright is
      // connected. executablePath is for custom apps and omits that loader.
      args: [
        "-r",
        resolve("scripts/edi/fixtures/native-vault.cjs"),
        applicationRoot,
        ...extraArguments,
      ],
      cwd: applicationRoot,
      env: {
        ...buildEnvironment,
        EDI_SUITE_TEST_PROFILE: suiteData,
        EDI_NATIVE_TEST: "true",
        EDIAULA_USER_DATA: userData,
        EDIFOTO_USER_DATA: userData,
        EDIPDF_USER_DATA: userData,
        EDISVG_USER_DATA: userData,
        EDICAPTURA_TEST_PROFILE: userData,
        ...extraEnvironment,
      },
    });
  }

  async function dispose() {
    const failures: unknown[] = [];
    try {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    } catch (error) {
      failures.push(error);
    }
    try {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
        throw new Error("Refusing to remove a directory the harness did not create");
      await rm(root, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
    return failures;
  }

  return { root, issuer, buildEnvironment, build, launch, seedLease, dispose };
}

export async function waitForStatus(page: Page, state: "licensed" | "restricted", reason?: string) {
  // waitForFunction polls synchronously; asynchronous IPC state is observed via
  // the actual subscription and a snapshot, with a bounded failure deadline.
  await page.evaluate(
    (expected) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const complete = (error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubscribe();
          if (error) reject(error);
          else resolve();
        };
        const matches = (status: Awaited<ReturnType<typeof window.ediSuite.status>>) => {
          if (
            status.state === expected.state &&
            (!expected.reason || status.reason === expected.reason)
          )
            complete();
        };
        const timeout = window.setTimeout(
          () => complete(new Error("Native status transition timed out")),
          10000,
        );
        const unsubscribe = window.ediSuite.onStatus(matches);
        window.ediSuite.status().then(matches, complete);
      }),
    { state, reason },
  );
}

export function raiseFailures(failures: unknown[], message: string) {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    for (const failure of failures) console.error(failure);
    throw new AggregateError(failures, message);
  }
}
