import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashMcpToken } from "./access";
import {
  createGrantFile,
  grantFileName,
  LEGACY_TTL_MS,
  migrateLegacyToken,
  removeAllGrantFiles,
} from "./grants";
import { createVault } from "./vault";

const key = randomBytes(32);
const seal = (plain: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
};
const unseal = (sealed: Buffer) => {
  const cipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  cipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([cipher.update(sealed.subarray(28)), cipher.final()]).toString("utf8");
};

/** The fields of the vault as earlier versions of every tool read it (with a strict schema). */
const EARLIER_VAULT_KEYS = new Set([
  "version",
  "deviceId",
  "privateKey",
  "publicKeySpki",
  "keyThumbprint",
  "session",
  "leases",
  "licenseVersionDeniedThrough",
  "lastTrustedTime",
  "mcpTokens",
  "boundUserId",
  "updateFloors",
]);

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "edi-grants-test-"));
  dirs.push(dir);
  return dir;
}

describe("MCP grants kept apart from the shared session vault", () => {
  it("moves the earlier token to the tool's own file, for 30 days, and never into the vault", async () => {
    const dir = await directory();
    const vault = createVault({ directory: dir, seal, unseal });
    const legacy = "d".repeat(64);
    await vault.use(async (data) => {
      data.mcpTokens = { ediaula: legacy, edifoto: "e".repeat(64) };
    });
    const grants = createGrantFile({ directory: dir, appId: "ediaula", seal, unseal });
    const now = Date.now();
    expect(
      await migrateLegacyToken({
        appId: "ediaula",
        grants,
        now,
        readToken: () => vault.use(async (data) => data.mcpTokens.ediaula),
        removeToken: () =>
          vault.use(async (data) => {
            delete data.mcpTokens.ediaula;
          }),
      }),
    ).toBe(true);
    const migrated = await grants.use((list) => list.map((g) => ({ ...g })));
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      client: "legacy",
      tokenHash: hashMcpToken(legacy),
      scopes: ["read", "propose"],
      expiresAt: now + LEGACY_TTL_MS,
    });
    const raw = JSON.parse(unseal(await readFile(join(dir, "session.v1.bin"))));
    for (const field of Object.keys(raw)) expect(EARLIER_VAULT_KEYS.has(field)).toBe(true);
    // Other tools migrate their own token when they start.
    expect(raw.mcpTokens).toEqual({ edifoto: "e".repeat(64) });
    const file = await readFile(join(dir, grantFileName("ediaula")));
    expect(file.includes(Buffer.from(legacy))).toBe(false);
    expect(file.includes(Buffer.from("legacy"))).toBe(false);
  });

  it("drops expired grants and keeps targeted writes from other operations", async () => {
    const dir = await directory();
    const grants = createGrantFile({ directory: dir, appId: "edifoto", seal, unseal });
    const base = {
      client: "codex",
      tokenHash: "a".repeat(64),
      scopes: ["read" as const],
      createdAt: 1,
    };
    await grants.store.add({ ...base, id: "00000000-0000-4000-8000-000000000001" });
    await grants.store.add({
      ...base,
      id: "00000000-0000-4000-8000-000000000002",
      expiresAt: Date.now() - 1,
    });
    await grants.store.touch("00000000-0000-4000-8000-000000000001", 42);
    const list = await grants.load();
    expect(list.map((g) => g.id)).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(list[0]?.lastUsedAt).toBe(42);
    await grants.store.remove(["00000000-0000-4000-8000-000000000001"]);
    expect(await grants.load()).toEqual([]);
  });

  it("signing out removes the grant files of every tool", async () => {
    const dir = await directory();
    for (const appId of ["ediaula", "edifoto"]) {
      const grants = createGrantFile({ directory: dir, appId, seal, unseal });
      await grants.store.add({
        id: "00000000-0000-4000-8000-000000000003",
        client: "manual",
        tokenHash: "b".repeat(64),
        scopes: ["read", "propose"],
        createdAt: 1,
      });
    }
    await writeFile(join(dir, "session.v1.bin"), "kept");
    await removeAllGrantFiles(dir);
    expect(await readdir(dir)).toEqual(["session.v1.bin"]);
  });

  it("a vault written by a newer version keeps opening, and its unknown fields survive", async () => {
    const dir = await directory();
    const vault = createVault({ directory: dir, seal, unseal });
    await vault.use(async (data) => {
      data.lastTrustedTime = 1;
    });
    const path = join(dir, "session.v1.bin");
    const newer = { ...JSON.parse(unseal(await readFile(path))), futureField: { a: 1 } };
    await writeFile(path, seal(JSON.stringify(newer)));
    await vault.use(async (data) => {
      data.lastTrustedTime = 2;
    });
    const after = JSON.parse(unseal(await readFile(path)));
    expect(after.lastTrustedTime).toBe(2);
    expect(after.futureField).toEqual({ a: 1 });
  });
});
