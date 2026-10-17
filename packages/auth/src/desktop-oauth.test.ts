import type { BetterAuthPlugin } from "better-auth";
import { getTableColumns, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { desktopOAuthPlugins, desktopOAuthSchema } from "./desktop-oauth";

describe("desktop OAuth configuration", () => {
  it("maps every official plugin field to a real Drizzle column", () => {
    const mapping: Record<string, Table> = desktopOAuthSchema();
    const plugins: BetterAuthPlugin[] = desktopOAuthPlugins({
      audience: "https://edi.example.test/api/desktop",
      clientId: "edi-desktop-test",
    });
    for (const plugin of plugins)
      for (const [model, definition] of Object.entries(plugin.schema ?? {})) {
        const table = mapping[model];
        if (!table) throw new Error(`Missing OAuth model: ${model}`);
        const columns = getTableColumns(table);
        for (const field of Object.keys(definition.fields))
          expect(columns, `${model}.${field}`).toHaveProperty(field);
      }
  });
  it("rejects insecure remote authorization resources", () => {
    expect(() =>
      desktopOAuthPlugins({ audience: "http://remote.example.test", clientId: "test" }),
    ).toThrow("HTTPS");
  });
});
