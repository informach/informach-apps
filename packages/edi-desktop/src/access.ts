import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Local MCP access. Every token is a grant: a hash at rest, the scopes it may use and, for the
 * short-lived ones, an expiry. Durable grants (a client connected with "Conectar", a token made
 * for manual configuration, the token of an older version) live in the encrypted vault; run
 * tokens for the application's own assistant exist only in memory and die with the run.
 */

export type McpScope = "read" | "propose" | "write";
export const MCP_SCOPES = ["read", "propose", "write"] as const satisfies readonly McpScope[];

export interface McpGrant {
  id: string;
  /** Who holds the token: "claude-code", "codex", "manual", "legacy" or a run of the app itself. */
  client: string;
  tokenHash: string;
  scopes: McpScope[];
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  /** Run tokens are tied to the project the run started in. */
  projectId?: string;
}

/** A grant as shown to the person: never the hash. */
export type McpGrantView = Omit<McpGrant, "tokenHash"> & { temporary: boolean };

/** Targeted writes to the vault, so a grant removed elsewhere (a logout) is never written back. */
export interface McpGrantStore {
  add(grant: McpGrant): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  touch(id: string, at: number): Promise<void>;
}

interface AccessState {
  assertAccess: () => void;
  /** In-memory token of this process with every scope (localMcpHeaders). */
  appToken?: string;
  durable: Map<string, McpGrant>;
  runs: Map<string, { grant: McpGrant; token: string }>;
  store?: McpGrantStore;
  persistedTouch: Map<string, number>;
}

let current: AccessState | undefined;

/** Last-use times are written to the vault at most this often per grant. */
const TOUCH_INTERVAL_MS = 60_000;
const BEARER = /^Bearer ([A-Za-z0-9_-]{32,256})$/;

export const hashMcpToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const newToken = (): string => randomBytes(32).toString("base64url");

function state(): AccessState {
  if (!current) throw new Error("Local MCP credentials are not initialized");
  return current;
}

export function configureDesktopAccess(config: {
  token?: string;
  assertAccess: () => void;
  grants?: readonly McpGrant[];
  store?: McpGrantStore;
}): void {
  current = {
    assertAccess: config.assertAccess,
    appToken: config.token,
    durable: new Map((config.grants ?? []).map((grant) => [grant.id, { ...grant }])),
    runs: new Map(),
    store: config.store,
    persistedTouch: new Map(),
  };
}

/** The grant file changed elsewhere (a logout): its grants replace the cached ones. */
export function replaceGrants(grants: readonly McpGrant[]): void {
  state().durable = new Map(grants.map((grant) => [grant.id, { ...grant }]));
}

/** Signed out: no token of this process works any more, run tokens included. */
export function clearAccess(): void {
  if (!current) return;
  current.durable.clear();
  current.runs.clear();
}

export function assertDesktopAccess(): void {
  if (!current) throw new Error("Desktop licensing is not initialized");
  current.assertAccess();
}

/** Header with this process's own token. Kept for tools that run their engines with it. */
export function localMcpHeaders(): { Authorization: string } {
  const token = state().appToken;
  if (!token) throw new Error("Local MCP credentials are not initialized");
  return { Authorization: `Bearer ${token}` };
}

const sameHash = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

const expired = (grant: McpGrant, now: number): boolean =>
  grant.expiresAt !== undefined && now >= grant.expiresAt;

/** The live grant a bearer token belongs to, without checking the license or recording use. */
function lookup(token: string, now: number): McpGrant | null {
  const s = state();
  const hash = hashMcpToken(token);
  if (s.appToken && sameHash(hash, hashMcpToken(s.appToken)))
    return { id: "app", client: "app", tokenHash: hash, scopes: [...MCP_SCOPES], createdAt: 0 };
  for (const [id, run] of s.runs) {
    if (!sameHash(hash, run.grant.tokenHash)) continue;
    if (!expired(run.grant, now)) return run.grant;
    s.runs.delete(id);
    return null;
  }
  for (const grant of s.durable.values())
    if (sameHash(hash, grant.tokenHash)) return expired(grant, now) ? null : grant;
  return null;
}

/** The grant an `Authorization: Bearer …` header value belongs to (client configuration checks). */
export function grantForBearer(header: string): McpGrant | null {
  const token = BEARER.exec(header)?.[1];
  return token ? lookup(token, Date.now()) : null;
}

function touch(grant: McpGrant, now: number): void {
  const s = state();
  grant.lastUsedAt = now;
  if (!s.store || !s.durable.has(grant.id)) return;
  if (now - (s.persistedTouch.get(grant.id) ?? 0) < TOUCH_INTERVAL_MS) return;
  s.persistedTouch.set(grant.id, now);
  s.store.touch(grant.id, now).catch((error: unknown) => {
    console.error(
      `[edi] mcp_grant_touch_failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  });
}

/** The grant of a local MCP request, or null: no valid token, an expired one or no license. */
export function authorizeLocalMcp(request: IncomingMessage): McpGrant | null {
  if (!current || typeof request.headers.authorization !== "string") return null;
  const token = BEARER.exec(request.headers.authorization)?.[1];
  if (!token) return null;
  const now = Date.now();
  const grant = lookup(token, now);
  if (!grant) return null;
  try {
    current.assertAccess();
  } catch {
    return null;
  }
  touch(grant, now);
  return grant;
}

/** Whether a grant covers a tool that needs `permission`. */
export const grantAllows = (grant: Pick<McpGrant, "scopes">, permission: McpScope): boolean =>
  grant.scopes.includes(permission);

/**
 * A token for one run of the application's own assistant: kept only in memory, expiring after
 * `ttlMs` and revoked as soon as the run ends.
 */
export function mintRunToken(options: {
  scopes: readonly McpScope[];
  ttlMs: number;
  projectId?: string;
  client?: string;
}): { token: string; grant: McpGrant; revoke: () => void; extend: (ms: number) => void } {
  const s = state();
  const token = newToken();
  const now = Date.now();
  const grant: McpGrant = {
    id: randomUUID(),
    client: options.client ?? "run",
    tokenHash: hashMcpToken(token),
    scopes: [...new Set(options.scopes)],
    createdAt: now,
    expiresAt: now + options.ttlMs,
    ...(options.projectId ? { projectId: options.projectId } : {}),
  };
  s.runs.set(grant.id, { grant, token });
  return {
    token,
    grant,
    revoke: () => {
      s.runs.delete(grant.id);
    },
    extend: (ms: number) => {
      // A run still going keeps its token; a revoked one stays revoked.
      if (s.runs.has(grant.id)) grant.expiresAt = Math.max(grant.expiresAt ?? 0, Date.now() + ms);
    },
  };
}

/** A durable grant for a client the person connected. The token is returned once, never stored. */
export async function createClientGrant(options: {
  client: string;
  scopes: readonly McpScope[];
  ttlMs?: number;
}): Promise<{ token: string; grant: McpGrant }> {
  const s = state();
  const token = newToken();
  const now = Date.now();
  const grant: McpGrant = {
    id: randomUUID(),
    client: options.client,
    tokenHash: hashMcpToken(token),
    scopes: [...new Set(options.scopes)],
    createdAt: now,
    ...(options.ttlMs ? { expiresAt: now + options.ttlMs } : {}),
  };
  await s.store?.add(grant);
  s.durable.set(grant.id, grant);
  return { token, grant };
}

/** Revokes grants by id (durable or run). Returns how many existed. */
export async function revokeGrants(ids: readonly string[]): Promise<number> {
  const s = state();
  let removed = 0;
  const durable: string[] = [];
  for (const id of ids) {
    if (s.runs.delete(id)) removed++;
    if (s.durable.has(id)) durable.push(id);
  }
  if (durable.length) {
    await s.store?.remove(durable);
    for (const id of durable) s.durable.delete(id);
    removed += durable.length;
  }
  return removed;
}

export const revokeGrant = async (id: string): Promise<boolean> => (await revokeGrants([id])) > 0;

/** Durable grants of one client, except `keep` (a reconnect replaces the previous token). */
export async function revokeClientGrants(client: string, keep?: string): Promise<void> {
  await revokeGrants(
    [...state().durable.values()]
      .filter((grant) => grant.client === client && grant.id !== keep)
      .map((grant) => grant.id),
  );
}

export function listGrants(): McpGrantView[] {
  const s = state();
  const now = Date.now();
  const view = (grant: McpGrant, temporary: boolean): McpGrantView => {
    const { tokenHash: _hash, ...rest } = grant;
    return { ...rest, scopes: [...grant.scopes], temporary };
  };
  return [
    ...[...s.durable.values()].filter((g) => !expired(g, now)).map((g) => view(g, false)),
    ...[...s.runs.values()].filter((r) => !expired(r.grant, now)).map((r) => view(r.grant, true)),
  ].sort((a, b) => b.createdAt - a.createdAt);
}

/** Removes every token this process knows, and any bearer value, from a text (logs, stderr). */
export function redactMcpCredentials(text: string): string {
  if (!current) return text;
  let out = text;
  const known = [current.appToken, ...[...current.runs.values()].map((run) => run.token)];
  for (const token of known) if (token) out = out.replaceAll(token, "[redacted]");
  return out.replace(/(Bearer\s+)[A-Za-z0-9_-]{32,256}/g, "$1[redacted]");
}
