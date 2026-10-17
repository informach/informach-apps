import { describe, expect, it } from "vitest";
import { listCachedSessions, revokeCachedSessions, type SessionStore } from "../sessions";

function memoryStore(entries: Record<string, string>): SessionStore & { keys(): string[] } {
  const map = new Map(Object.entries(entries));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, String(value));
    },
    delete: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

const now = Date.parse("2026-10-17T15:00:00Z");
const later = now + 86_400_000;

function storeWithTwoSessions() {
  return memoryStore({
    "active-sessions-u1": JSON.stringify([
      { token: "tok-a", expiresAt: later },
      { token: "tok-expired", expiresAt: now - 1 },
      { token: "tok-b", expiresAt: later },
    ]),
    "tok-a": JSON.stringify({
      session: {
        createdAt: "2026-10-16T10:00:00Z",
        updatedAt: "2026-10-17T14:02:00Z",
        expiresAt: new Date(later).toISOString(),
        userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
        ipAddress: "203.0.113.9",
        token: "tok-a",
      },
      user: { id: "u1", email: "pessoa@example.test" },
    }),
    "tok-b": JSON.stringify({ session: { userAgent: "" }, user: { id: "u1" } }),
    "tok-other": JSON.stringify({ session: { userAgent: "x" }, user: { id: "u2" } }),
    "active-sessions-u2": JSON.stringify([{ token: "tok-other", expiresAt: later }]),
  });
}

describe("cached sessions in secondary storage", () => {
  it("lists only live sessions and never exposes token or IP", async () => {
    const sessions = await listCachedSessions(storeWithTwoSessions(), "u1", now);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.userAgent).toContain("Android");
    expect(sessions[0]?.updatedAt?.toISOString()).toBe("2026-10-17T14:02:00.000Z");
    expect(sessions[1]?.userAgent).toBeNull();
    expect(JSON.stringify(sessions)).not.toMatch(/tok-|203\.0\.113/);
  });

  it("revokes every session of the account and keeps other accounts", async () => {
    const store = storeWithTwoSessions();
    expect(await revokeCachedSessions(store, "u1")).toBe(3);
    expect(store.keys().sort()).toEqual(["active-sessions-u2", "tok-other"]);
    expect(await listCachedSessions(store, "u1", now)).toEqual([]);
  });

  it("treats a missing or corrupted list as no sessions", async () => {
    const store = memoryStore({ "active-sessions-u1": "{not json" });
    expect(await listCachedSessions(store, "u1", now)).toEqual([]);
    expect(await revokeCachedSessions(memoryStore({}), "u1")).toBe(0);
  });
});
