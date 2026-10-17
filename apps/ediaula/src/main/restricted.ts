import { exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localMcpHeaders } from "@informach/edi-desktop/access";
import { app } from "electron";
import { locateClient, MCP_NAME, mcpUrl } from "./aiSettings.ts";

/**
 * Opens the user's own Claude Code in a terminal that can only use EdiAula's editing tools:
 * no file access, no shell, no web. It runs in an empty folder with its own MCP config, so it
 * cannot touch the original media or the rest of the computer. The editing guide reaches it
 * through the MCP server's instructions.
 */
export async function openRestrictedClaude(
  port: number,
): Promise<{ ok: boolean; message: string }> {
  const bin = await locateClient("claude-code");
  if (!bin) return { ok: false, message: "Claude Code não encontrado neste computador." };
  const dir = join(app.getPath("userData"), "claude-restrito");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "mcp.json"),
    JSON.stringify(
      {
        mcpServers: { [MCP_NAME]: { type: "http", url: mcpUrl(port), headers: localMcpHeaders() } },
      },
      null,
      1,
    ),
  );
  const script = [
    "@echo off",
    "title EdiAula + Claude Code (somente ferramentas do editor)",
    'cd /d "%~dp0"',
    `"${bin}" --strict-mcp-config --mcp-config "%~dp0mcp.json" --tools "" --allowedTools mcp__${MCP_NAME}`,
  ].join("\r\n");
  const file = join(dir, "abrir-claude.cmd");
  writeFileSync(file, script);
  exec(`start "" "${file}"`, { cwd: dir, windowsHide: false });
  return {
    ok: true,
    message:
      "Abri o Claude Code numa janela própria. Ele só enxerga as ferramentas do EdiAula: sem arquivos, terminal ou internet.",
  };
}
