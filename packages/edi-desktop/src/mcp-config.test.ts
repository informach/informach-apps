import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { describe, expect, it } from "vitest";
import { codexMcpConfiguration } from "./mcp-config";

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
