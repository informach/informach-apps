import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeLocalMcp,
  CLIENT_GRANT_TTL_MS,
  clearAccess,
  configureDesktopAccess,
  createClientGrant,
  grantAllows,
  grantForBearer,
  hashMcpToken,
  isGrantLive,
  listGrants,
  localMcpHeaders,
  type McpGrant,
  type McpGrantStore,
  mintRunToken,
  redactMcpCredentials,
  replaceGrants,
  revokeClientGrants,
  revokeGrant,
} from "./access";

const request = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as IncomingMessage;

function memoryStore() {
  const grants = new Map<string, McpGrant>();
  const store: McpGrantStore = {
    add: async (grant) => {
      grants.set(grant.id, { ...grant });
    },
    remove: async (ids) => {
      for (const id of ids) grants.delete(id);
    },
    touch: async (id, at, expiresAt) => {
      const grant = grants.get(id);
      if (!grant) return;
      grant.lastUsedAt = at;
      if (expiresAt !== undefined) grant.expiresAt = expiresAt;
    },
  };
  return { grants, store };
}

function setup(options: { licensed?: () => boolean; grants?: McpGrant[] } = {}) {
  const memory = memoryStore();
  configureDesktopAccess({
    token: "a".repeat(64),
    assertAccess: () => {
      if (options.licensed && !options.licensed()) throw new Error("revoked");
    },
    grants: options.grants,
    store: memory.store,
  });
  return memory;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("local MCP grants", () => {
  it("keeps only the hash of a client token and finds the grant by its bearer value", async () => {
    const { grants } = setup();
    const { token, grant } = await createClientGrant({
      client: "claude-code",
      scopes: ["read", "propose"],
    });
    const stored = grants.get(grant.id);
    expect(stored?.tokenHash).toBe(hashMcpToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(authorizeLocalMcp(request(`Bearer ${token}`))?.id).toBe(grant.id);
    expect(grantForBearer(`Bearer ${token}`)?.client).toBe("claude-code");
    expect(authorizeLocalMcp(request(`Bearer ${"x".repeat(43)}`))).toBeNull();
    expect(authorizeLocalMcp(request(token))).toBeNull();
    expect(authorizeLocalMcp(request())).toBeNull();
    expect(listGrants().find((view) => view.id === grant.id)).not.toHaveProperty("tokenHash");
  });

  it("expires run tokens and forgets them when revoked", () => {
    vi.useFakeTimers();
    setup();
    const run = mintRunToken({
      scopes: ["read", "propose", "write"],
      ttlMs: 30 * 60_000,
      projectId: "p1",
      client: "painel",
    });
    const authorized = authorizeLocalMcp(request(`Bearer ${run.token}`));
    expect(authorized?.projectId).toBe("p1");
    expect(authorized && grantAllows(authorized, "write")).toBe(true);
    vi.advanceTimersByTime(30 * 60_000);
    expect(authorizeLocalMcp(request(`Bearer ${run.token}`))).toBeNull();

    const second = mintRunToken({ scopes: ["read"], ttlMs: 60_000 });
    expect(authorizeLocalMcp(request(`Bearer ${second.token}`))).not.toBeNull();
    second.revoke();
    expect(authorizeLocalMcp(request(`Bearer ${second.token}`))).toBeNull();
  });

  it("refuses every token while the license does not allow use", async () => {
    let licensed = true;
    setup({ licensed: () => licensed });
    const { token } = await createClientGrant({ client: "codex", scopes: ["read"] });
    expect(authorizeLocalMcp(request(`Bearer ${token}`))).not.toBeNull();
    licensed = false;
    expect(authorizeLocalMcp(request(`Bearer ${token}`))).toBeNull();
    expect(authorizeLocalMcp(request(localMcpHeaders().Authorization))).toBeNull();
  });

  it("revokes a grant, a client's older tokens and grants removed by another tool", async () => {
    const { grants } = setup();
    const first = await createClientGrant({ client: "codex", scopes: ["read", "propose"] });
    const second = await createClientGrant({ client: "codex", scopes: ["read", "propose"] });
    const manual = await createClientGrant({ client: "manual", scopes: ["read", "propose"] });
    await revokeClientGrants("codex", second.grant.id);
    expect(authorizeLocalMcp(request(`Bearer ${first.token}`))).toBeNull();
    expect(authorizeLocalMcp(request(`Bearer ${second.token}`))).not.toBeNull();
    expect(grants.has(first.grant.id)).toBe(false);
    expect(await revokeGrant(manual.grant.id)).toBe(true);
    expect(authorizeLocalMcp(request(`Bearer ${manual.token}`))).toBeNull();
    // A logout elsewhere empties the vault: the cached grants go with it.
    replaceGrants([]);
    expect(authorizeLocalMcp(request(`Bearer ${second.token}`))).toBeNull();
  });

  it("keeps a token of an earlier version working, but only to read and propose", () => {
    const legacy = "b".repeat(64);
    setup({
      grants: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          client: "legacy",
          tokenHash: hashMcpToken(legacy),
          scopes: ["read", "propose"],
          // Without an end of its own, it lasts 30 days from its last use (or creation).
          createdAt: Date.now(),
        },
      ],
    });
    const grant = authorizeLocalMcp(request(`Bearer ${legacy}`));
    expect(grant?.client).toBe("legacy");
    expect(grant && grantAllows(grant, "propose")).toBe(true);
    expect(grant && grantAllows(grant, "write")).toBe(false);
  });

  it("gives this process's own token every scope and redacts tokens from text", () => {
    setup();
    const own = authorizeLocalMcp(request(localMcpHeaders().Authorization));
    expect(own && grantAllows(own, "write")).toBe(true);
    const run = mintRunToken({ scopes: ["read"], ttlMs: 60_000 });
    const text = `failed with ${run.token} and Authorization: Bearer ${"z".repeat(40)}`;
    const redacted = redactMcpCredentials(text);
    expect(redacted).not.toContain(run.token);
    expect(redacted).not.toContain("z".repeat(40));
  });

  it("signing out ends every token, run tokens included; a long run can extend its own", async () => {
    vi.useFakeTimers();
    setup();
    const run = mintRunToken({ scopes: ["read", "write"], ttlMs: 60_000 });
    vi.advanceTimersByTime(50_000);
    run.extend(60_000);
    vi.advanceTimersByTime(30_000);
    expect(authorizeLocalMcp(request(`Bearer ${run.token}`))).not.toBeNull();
    const { token } = await createClientGrant({ client: "codex", scopes: ["read"] });
    clearAccess();
    expect(authorizeLocalMcp(request(`Bearer ${run.token}`))).toBeNull();
    expect(authorizeLocalMcp(request(`Bearer ${token}`))).toBeNull();
    // A revoked run cannot be brought back by extending it.
    run.extend(60_000);
    expect(authorizeLocalMcp(request(`Bearer ${run.token}`))).toBeNull();
  });

  it("a client's grant ends 30 days after its last use, and each use renews it", async () => {
    vi.useFakeTimers();
    const memory = setup();
    const { token, grant } = await createClientGrant({ client: "manual", scopes: ["read"] });
    expect(grant.expiresAt).toBe(Date.now() + CLIENT_GRANT_TTL_MS);
    vi.advanceTimersByTime(CLIENT_GRANT_TTL_MS - 60_000);
    expect(authorizeLocalMcp(request(`Bearer ${token}`))).not.toBeNull();
    // The use moved the end 30 days ahead, in memory and in the vault.
    expect(memory.grants.get(grant.id)?.expiresAt).toBe(Date.now() + CLIENT_GRANT_TTL_MS);
    vi.advanceTimersByTime(CLIENT_GRANT_TTL_MS - 60_000);
    expect(isGrantLive(grant.id)).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(isGrantLive(grant.id)).toBe(false);
    expect(authorizeLocalMcp(request(`Bearer ${token}`))).toBeNull();
    expect(listGrants().some((g) => g.id === grant.id)).toBe(false);
  });

  it("a grant of an earlier version without an end gets one from its last use", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const old: McpGrant = {
      id: "00000000-0000-4000-8000-000000000001",
      client: "codex",
      tokenHash: hashMcpToken("b".repeat(43)),
      scopes: ["read"],
      createdAt: now - 40 * 86400_000,
      lastUsedAt: now - 10 * 86400_000,
    };
    setup({ grants: [old] });
    expect(listGrants()[0]?.expiresAt).toBe(now + 20 * 86400_000);
    expect(isGrantLive(old.id)).toBe(true);
    const unused = { ...old, lastUsedAt: undefined };
    setup({ grants: [unused] });
    expect(isGrantLive(old.id)).toBe(false);
  });

  it("isGrantLive tells a call that waited whether its run was stopped or revoked", async () => {
    setup();
    const run = mintRunToken({ scopes: ["read"], ttlMs: 60_000 });
    expect(isGrantLive(run.grant.id)).toBe(true);
    run.revoke();
    expect(isGrantLive(run.grant.id)).toBe(false);
    const { grant } = await createClientGrant({ client: "codex", scopes: ["read"] });
    expect(isGrantLive(grant.id)).toBe(true);
    await revokeGrant(grant.id);
    expect(isGrantLive(grant.id)).toBe(false);
    expect(isGrantLive("app")).toBe(true);
    clearAccess();
    expect(isGrantLive(run.grant.id)).toBe(false);
  });
});
