import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVault } from "./vault";

describe("atomic protected session storage", () => {
  it("persists identity, encrypts credentials and serializes independent clients", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edi-vault-test-"));
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
    try {
      const first = createVault({ directory, seal, unseal });
      const second = createVault({ directory, seal, unseal });
      const id = await first.use(async (data) => data.deviceId);
      expect(await second.use(async (data) => data.deviceId)).toBe(id);
      await Promise.all(
        Array.from({ length: 6 }, (_value, index) =>
          (index % 2 ? first : second).use(async (data) => {
            data.lastTrustedTime++;
          }),
        ),
      );
      expect(await first.use(async (data) => data.lastTrustedTime)).toBe(6);
      const bytes = await readFile(join(directory, "session.v1.bin"));
      expect(bytes.includes(Buffer.from("PRIVATE KEY"))).toBe(false);
      expect(bytes.includes(Buffer.from(id))).toBe(false);
      const wrongKey = createVault({
        directory,
        seal,
        unseal: () => {
          throw new Error("DPAPI unavailable");
        },
      });
      await expect(wrongKey.use(async (data) => data.deviceId)).rejects.toThrow("sessão protegida");
      expect(await readFile(join(directory, "session.v1.bin"))).toEqual(bytes);
      const failedWrite = createVault({
        directory,
        unseal,
        seal: () => {
          throw new Error("Session encryption failed");
        },
      });
      await expect(
        failedWrite.use(async (data) => {
          data.lastTrustedTime++;
        }),
      ).rejects.toThrow("encryption failed");
      expect(await readFile(join(directory, "session.v1.bin"))).toEqual(bytes);
      expect(await readdir(directory)).toEqual(["session.v1.bin"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
