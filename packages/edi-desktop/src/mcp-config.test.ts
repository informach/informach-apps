import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { describe, expect, it } from "vitest";
import {
  authorizeLocalMcp,
  configureDesktopAccess,
  hashMcpToken,
  listGrants,
  type McpGrant,
} from "./access";
import { codexMcpConfiguration, configureMcpClient, isMcpClientConnected } from "./mcp-config";

describe("targeted MCP client configuration edits", () => {
  it.each([
    '# Keep this comment\nmodel = "personal" # Keep inline\n[mcp_servers.other]\nurl = "https://other.example"\n',
    '# Keep this comment\n[mcp_servers.edifoto] # Keep inline\nurl = "http://old.example"\n',
    '# Keep this comment\nmcp_servers = { edifoto = { url = "http://old.example" } } # Keep inline\n',
    '# Keep this comment\n[mcp_servers]\nedifoto.url = "http://old.example" # Keep inline\n',
    '# Keep this comment\n[mcp_servers.edifoto]\nurl = "http://old.example" # Keep inline\n[mcp_servers.edifoto.http_headers]\nAuthorization = "old"\n',
  ])("preserves comments and unrelated settings across TOML representations", (source) => {
    const result = codexMcpConfiguration(
      source,
      "edifoto",
      "http://127.0.0.1:47320/mcp",
      "Bearer fixture",
    );
    expect(result).toContain("# Keep this comment");
    expect(result).toContain("# Keep inline");
    const parsed = getStaticTOMLValue(parseTOML(result));
    expect(parsed).toMatchObject({
      mcp_servers: {
        edifoto: {
          url: "http://127.0.0.1:47320/mcp",
          http_headers: { Authorization: "Bearer fixture" },
        },
      },
    });
    if (source.includes('model = "personal"'))
      expect(parsed).toMatchObject({
        model: "personal",
        mcp_servers: { other: { url: "https://other.example" } },
      });
    expect(
      codexMcpConfiguration(result, "edifoto", "http://127.0.0.1:47320/mcp", "Bearer fixture"),
    ).toBe(result);
  });
  it("removes conflicting Edi credential sources without touching other providers", () => {
    const source =
      '[mcp_servers.edifoto]\nurl="http://old"\nbearer_token_env_var="OLD" # Keep this comment\nhttp_headers_helper=["old"]\n[mcp_servers.other]\nbearer_token_env_var="OTHER"\n';
    const result = codexMcpConfiguration(
      source,
      "edifoto",
      "http://127.0.0.1:47320/mcp",
      "Bearer fixture",
    );
    expect(result).toContain("# Keep this comment");
    expect(result).toContain('bearer_token_env_var="OTHER"');
    expect(result).not.toContain('bearer_token_env_var="OLD"');
  });
  it("rejects malformed configuration and unknown tool identities", () => {
    expect(() => codexMcpConfiguration("bad =", "edifoto", "url", "token")).toThrow();
    expect(() => codexMcpConfiguration("", "other", "url", "token")).toThrow();
  });
});

describe("connecting a client", () => {
  const request = (authorization: string) => ({ headers: { authorization } }) as IncomingMessage;
  const claudeToken = async (home: string): Promise<string> =>
    JSON.parse(await readFile(join(home, ".claude.json"), "utf8")).mcpServers.ediaula.headers
      .Authorization;

  it("keeps a working token, rotates only on Reconectar and ends the earlier version's token", async () => {
    const home = await mkdtemp(join(tmpdir(), "edi-connect-"));
    const stored = new Map<string, McpGrant>();
    const legacy = "f".repeat(64);
    configureDesktopAccess({
      assertAccess: () => {},
      grants: [
        {
          id: "00000000-0000-4000-8000-000000000009",
          client: "legacy",
          tokenHash: hashMcpToken(legacy),
          scopes: ["read", "propose"],
          createdAt: 1,
        },
      ],
      store: {
        add: async (grant) => {
          stored.set(grant.id, grant);
        },
        remove: async (ids) => {
          for (const id of ids) stored.delete(id);
        },
        touch: async () => {},
      },
    });
    const config = { client: "claude-code" as const, home, name: "ediaula", port: 47321 };
    try {
      expect(await configureMcpClient(config)).toBe(true);
      const first = await claudeToken(home);
      expect(authorizeLocalMcp(request(first))?.client).toBe("claude-code");
      expect(authorizeLocalMcp(request(`Bearer ${legacy}`))).toBeNull();
      expect(await isMcpClientConnected(config)).toBe(true);
      // Connecting again leaves the working token alone (an open client may write it back).
      expect(await configureMcpClient(config)).toBe(false);
      expect(await claudeToken(home)).toBe(first);
      // Reconectar replaces it, and the old one stops working.
      expect(await configureMcpClient({ ...config, rotate: true })).toBe(true);
      const second = await claudeToken(home);
      expect(second).not.toBe(first);
      expect(authorizeLocalMcp(request(first))).toBeNull();
      expect(authorizeLocalMcp(request(second))).not.toBeNull();
      expect(listGrants().filter((g) => g.client === "claude-code")).toHaveLength(1);
      expect([...stored.values()].map((g) => g.client)).toEqual(["claude-code"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
