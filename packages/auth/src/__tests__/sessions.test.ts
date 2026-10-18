import { verifications } from "@informach/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  listCachedSessions,
  revokeCachedSessions,
  revokeTrustedDevices,
  type SessionStore,
  TRUST_DEVICE_IDENTIFIER_PREFIX,
} from "../sessions";

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
    // Três referências, duas valendo: a vencida sai junto, mas não conta.
    expect(await revokeCachedSessions(store, "u1", now)).toBe(2);
    expect(store.keys().sort()).toEqual(["active-sessions-u2", "tok-other"]);
    expect(await listCachedSessions(store, "u1", now)).toEqual([]);
  });

  it("does not count a reference whose session already left the store", async () => {
    const store = memoryStore({
      "active-sessions-u1": JSON.stringify([
        { token: "tok-a", expiresAt: later },
        { token: "tok-gone", expiresAt: later },
      ]),
      "tok-a": JSON.stringify({ session: { userAgent: "x" }, user: { id: "u1" } }),
    });
    expect(await revokeCachedSessions(store, "u1", now)).toBe(1);
    expect(store.keys()).toEqual([]);
  });

  it("treats a missing or corrupted list as no sessions", async () => {
    const store = memoryStore({ "active-sessions-u1": "{not json" });
    expect(await listCachedSessions(store, "u1", now)).toEqual([]);
    expect(await revokeCachedSessions(memoryStore({}), "u1")).toBe(0);
  });
});

describe("trusted devices of the two-factor plugin", () => {
  it("deletes only the trust-device records whose value is the account id", async () => {
    let condition: unknown;
    const writer = {
      delete: (table: unknown) => {
        expect(table).toBe(verifications);
        return {
          where: (where: unknown) => {
            condition = where;
            return { returning: async () => [{ id: "v1" }, { id: "v2" }] };
          },
        };
      },
    };
    await expect(revokeTrustedDevices("u1", writer as never)).resolves.toBe(2);
    const query = new PgDialect().sqlToQuery(condition as SQL);
    expect(query.sql).toBe(
      '("core"."verifications"."value" = $1 and "core"."verifications"."identifier" like $2)',
    );
    expect(query.params).toEqual(["u1", "trust-device-%"]);
  });

  it("uses the identifier prefix the installed Better Auth writes", () => {
    expect(TRUST_DEVICE_IDENTIFIER_PREFIX).toBe("trust-device-");
  });
});
