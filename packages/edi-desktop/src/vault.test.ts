import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createVault } from "./vault";

describe("atomic protected session storage", () => {
  it("drains accepted writes through lock release, refuses new work and preserves operation failures during shutdown", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edi-vault-drain-"));
    expect(dirname(directory)).toBe(resolve(tmpdir()));
    expect(basename(directory)).toMatch(/^edi-vault-drain-[a-zA-Z0-9]+$/);
    const key = randomBytes(32);
    const codec = {
      seal(plain: string) {
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", key, iv);
        return Buffer.concat([
          iv,
          cipher.update(plain, "utf8"),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
      },
      unseal(bytes: Buffer) {
        const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(-16));
        return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(
          "utf8",
        );
      },
    };
    let release: (() => void) | undefined, entered: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    if (!entered || !release) throw new Error("Missing vault operation barriers");
    const signalEntered = entered;
    const operations: Promise<unknown>[] = [];
    try {
      const vault = createVault({ directory, ...codec });
      const write = vault.use(async (data) => {
        signalEntered();
        await gate;
        data.lastTrustedTime = 41;
      }, "refresh");
      operations.push(write);
      await started;
      expect(vault.pendingStages()).toEqual([{ label: "refresh", phase: "operation" }]);
      const queued = vault.use(async (data) => {
        data.lastTrustedTime++;
      }, "synchronize");
      operations.push(queued);
      let finished = false;
      const closing = vault.close().then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(finished).toBe(false);
      await expect(vault.use(async (data) => data.deviceId)).rejects.toThrow("encerrando");
      expect(await readdir(directory)).toContain("session.v1.bin.lock");
      release();
      await Promise.all([write, queued, closing, vault.close()]);
      expect(vault.pendingStages()).toEqual([]);
      expect(await readdir(directory)).toEqual(["session.v1.bin"]);
      const reader = createVault({ directory, ...codec });
      expect(await reader.use(async (data) => data.lastTrustedTime)).toBe(42);
      const before = await readFile(join(directory, "session.v1.bin"));
      const failure = new Error("original operation failure");
      const failed = reader.use(async (data) => {
        data.lastTrustedTime = 99;
        throw failure;
      });
      operations.push(failed);
      const checkedFailure = expect(failed).rejects.toBe(failure);
      await Promise.all([checkedFailure, reader.close()]);
      expect(await readFile(join(directory, "session.v1.bin"))).toEqual(before);
      expect(await readdir(directory)).toEqual(["session.v1.bin"]);
    } finally {
      release?.();
      await Promise.allSettled(operations);
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);
  // The real cross-client lock allows 30 retries of up to 1 second. The default
  // 5-second unit-test deadline can abort a valid six-client contention run.
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
  }, 40_000);
});
