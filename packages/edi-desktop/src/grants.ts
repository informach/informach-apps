import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { lock } from "proper-lockfile";
import { z } from "zod";
import { hashMcpToken, type McpGrant, type McpGrantStore } from "./access";
import { atomicWrite } from "./files";

/**
 * Local MCP grants of one tool, in a file of its own next to the session vault and sealed the
 * same way. The vault is read by every tool of the suite, older ones included, with the fields
 * they know: grants never go there, so an older tool keeps opening the session.
 */

/** Tokens of earlier versions keep working this long after they become grants. */
export const LEGACY_TTL_MS = 30 * 86400_000;

const grantSchema = z.looseObject({
  id: z.uuid(),
  client: z.string().min(1).max(64),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z
    .array(z.enum(["read", "propose", "write"]))
    .min(1)
    .max(3),
  createdAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative().optional(),
  lastUsedAt: z.number().nonnegative().optional(),
  projectId: z.string().min(1).max(200).optional(),
  renewMs: z.number().positive().optional(),
});
// Unknown fields are kept, so a newer version's file survives being written by this one.
const fileSchema = z.looseObject({
  version: z.literal(1),
  grants: z.array(grantSchema).max(100),
});

const FILE_SUFFIX = ".mcp-grants.v1.bin";
export const grantFileName = (appId: string): string => `${appId}${FILE_SUFFIX}`;

const live = (grant: McpGrant, now: number): boolean =>
  grant.expiresAt === undefined || grant.expiresAt > now;

export interface GrantFile {
  /** Runs `operation` on the tool's grants under a file lock and writes what it changed. */
  use<T>(operation: (grants: McpGrant[]) => T | Promise<T>): Promise<T>;
  /** The grants still valid. */
  load(): Promise<McpGrant[]>;
  /** Targeted writes for access.ts. */
  store: McpGrantStore;
}

export function createGrantFile(config: {
  directory: string;
  appId: string;
  seal: (plain: string) => Buffer;
  unseal: (sealed: Buffer) => string;
}): GrantFile {
  const target = join(config.directory, grantFileName(config.appId));
  async function use<T>(operation: (grants: McpGrant[]) => T | Promise<T>): Promise<T> {
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const release = await lock(target, {
      realpath: false,
      stale: 30000,
      update: 5000,
      retries: { retries: 30, minTimeout: 100, maxTimeout: 1000, randomize: true },
    });
    try {
      let data: z.infer<typeof fileSchema> = { version: 1, grants: [] };
      let existed = false;
      try {
        const bytes = await readFile(target);
        if (bytes.byteLength > 1048576) throw new Error("MCP grants exceed limit");
        data = fileSchema.parse(JSON.parse(config.unseal(bytes)));
        existed = true;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          throw new Error("Não foi possível abrir as conexões de IA protegidas.", {
            cause: error,
          });
      }
      const now = Date.now();
      const before = JSON.stringify(data);
      data.grants = data.grants.filter((grant) => live(grant, now));
      const result = await operation(data.grants);
      const after = JSON.stringify(fileSchema.parse(data));
      if (existed ? before !== after : data.grants.length > 0)
        await atomicWrite(target, config.seal(after));
      return result;
    } finally {
      await release();
    }
  }
  return {
    use,
    load: () => use((grants) => grants.map((grant) => ({ ...grant }))),
    store: {
      add: (grant) =>
        use((grants) => {
          if (grants.length >= 100)
            throw new Error("Há conexões demais com a IA. Revogue alguma antes de criar outra.");
          grants.push({ ...grant });
        }),
      remove: (ids) =>
        use((grants) => {
          const keep = grants.filter((grant) => !ids.includes(grant.id));
          grants.splice(0, grants.length, ...keep);
        }),
      touch: (id, at, expiresAt) =>
        use((grants) => {
          const grant = grants.find((item) => item.id === id);
          if (!grant) return;
          grant.lastUsedAt = at;
          if (expiresAt !== undefined) grant.expiresAt = expiresAt;
        }),
    },
  };
}

/** Signing out of this computer disconnects every AI client of every tool. */
export async function removeAllGrantFiles(directory: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  for (const name of names)
    if (name.endsWith(FILE_SUFFIX)) await rm(join(directory, name), { force: true });
}

/**
 * The single permanent token of earlier versions becomes a grant that can only read and
 * propose, and expires in 30 days (the clients configured with it keep working meanwhile).
 */
export function legacyGrant(token: string, now: number): McpGrant {
  return {
    id: randomUUID(),
    client: "legacy",
    tokenHash: hashMcpToken(token),
    scopes: ["read", "propose"],
    createdAt: now,
    expiresAt: now + LEGACY_TTL_MS,
  };
}

/**
 * Moves the tool's token of an earlier version from the vault to its grants. The grant is
 * written first and the vault entry removed after, so a failure keeps the old token.
 */
export async function migrateLegacyToken(options: {
  appId: string;
  readToken: () => Promise<string | undefined>;
  removeToken: () => Promise<void>;
  grants: GrantFile;
  now?: number;
}): Promise<boolean> {
  const token = await options.readToken();
  if (!token) return false;
  const now = options.now ?? Date.now();
  await options.grants.use((grants) => {
    const hash = hashMcpToken(token);
    if (!grants.some((grant) => grant.tokenHash === hash)) grants.push(legacyGrant(token, now));
  });
  await options.removeToken();
  return true;
}
