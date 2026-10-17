import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseVersionSchema } from "@informach/edi-contracts";
import { lock } from "proper-lockfile";
import { z } from "zod";
import { atomicWrite } from "./files";

const sessionSchema = z.strictObject({
  userId: z.string(),
  activationId: z.uuid(),
  sessionId: z.uuid(),
  keyThumbprint: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.number(),
  sessionExpiresAt: z.string(),
});
export const vaultSchema = z.strictObject({
  version: z.literal(1),
  deviceId: z.uuid(),
  privateKey: z.string(),
  publicKeySpki: z.string(),
  keyThumbprint: z.string(),
  session: sessionSchema.nullable(),
  leases: z.record(z.string(), z.string()),
  // Inclusive version refusal, until a signed grant supersedes it. Shared
  // licenses remain available to newer applications during a rolling update.
  licenseVersionDeniedThrough: releaseVersionSchema.optional(),
  lastTrustedTime: z.number().nonnegative(),
  mcpTokens: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).default({}),
  boundUserId: z.string().nullable().default(null),
  updateFloors: z.partialRecord(z.enum(["stable", "beta"]), releaseVersionSchema).default({}),
});
export type VaultData = z.infer<typeof vaultSchema>;
export type Vault = { use<T>(operation: (data: VaultData) => Promise<T>): Promise<T> };
export function createDeviceIdentity() {
  const keys = generateKeyPairSync("ed25519");
  const spki = keys.publicKey.export({ type: "spki", format: "der" });
  return {
    deviceId: randomUUID(),
    privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeySpki: spki.toString("base64"),
    keyThumbprint: createHash("sha256").update(spki).digest("hex"),
  };
}
export function createVault(config: {
  directory: string;
  seal: (plain: string) => Buffer;
  unseal: (sealed: Buffer) => string;
}): Vault {
  const target = join(config.directory, "session.v1.bin");
  return {
    async use(operation) {
      await mkdir(config.directory, { recursive: true, mode: 0o700 });
      const release = await lock(target, {
        realpath: false,
        stale: 30000,
        update: 5000,
        retries: { retries: 30, minTimeout: 100, maxTimeout: 1000, randomize: true },
      });
      try {
        let data: VaultData;
        let existed = false;
        try {
          const bytes = await readFile(target);
          if (bytes.byteLength > 1048576) throw new Error("Encrypted session exceeds limit");
          data = vaultSchema.parse(JSON.parse(config.unseal(bytes)));
          existed = true;
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
            throw new Error(
              "Não foi possível abrir a sessão protegida. Nenhum acesso foi liberado.",
              { cause: error },
            );
          data = {
            version: 1,
            ...createDeviceIdentity(),
            session: null,
            leases: {},
            lastTrustedTime: 0,
            mcpTokens: {},
            boundUserId: null,
            updateFloors: {},
          };
        }
        const before = JSON.stringify(data);
        const result = await operation(data);
        const after = JSON.stringify(vaultSchema.parse(data));
        if (existed && before === after) return result;
        await atomicWrite(target, config.seal(after));
        return result;
      } finally {
        await release();
      }
    },
  };
}
