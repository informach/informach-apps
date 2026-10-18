import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintRunToken } from "@informach/edi-desktop/access";
import { app } from "electron";
import { clientLaunch, locateClient, mcpUrl } from "./aiSettings.ts";
import { claudeMcpConfig, engineEnv, type Launch } from "./engineArgs.ts";

/** The terminal stays usable for a working day; its token goes away when the window closes. */
const WINDOW_TTL_MS = 12 * 3600_000;

/**
 * Opens the user's own Claude Code in a window of its own that can only use EdiAula's editing
 * tools: no file access, no shell, no web. It runs in an empty folder with its own MCP config,
 * so it cannot touch the original media or the rest of the computer. The config file names the
 * token's environment variable; the token itself only exists in that process's environment.
 */
export async function openRestrictedClaude(
  port: number,
): Promise<{ ok: boolean; message: string }> {
  const bin = await locateClient("claude-code");
  if (!bin) return { ok: false, message: "Claude Code não encontrado neste computador." };
  let launch: Launch;
  try {
    launch = await clientLaunch(bin);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const dir = join(app.getPath("userData"), "claude-restrito");
  mkdirSync(dir, { recursive: true });
  const config = join(dir, "mcp.json");
  writeFileSync(config, claudeMcpConfig(mcpUrl(port)));
  const token = mintRunToken({
    scopes: ["read", "propose", "write"],
    ttlMs: WINDOW_TTL_MS,
    client: "claude-restrito",
  });
  try {
    const child = spawn(
      launch.command,
      [
        ...launch.args,
        "--strict-mcp-config",
        "--mcp-config",
        config,
        "--tools",
        "",
        "--allowedTools",
        "mcp__ediaula",
      ],
      {
        cwd: dir,
        // Its own console window, independent of EdiAula's.
        detached: true,
        windowsHide: false,
        shell: false,
        stdio: "ignore",
        env: engineEnv(process.env, { minimal: false, token: token.token, launch: launch.env }),
      },
    );
    child.on("exit", token.revoke);
    child.on("error", (err) => {
      token.revoke();
      console.error(`[ediaula] restricted_claude_failed: ${err.name}`);
    });
  } catch (err) {
    token.revoke();
    return { ok: false, message: `Não foi possível abrir o Claude Code: ${String(err)}` };
  }
  return {
    ok: true,
    message:
      "Abri o Claude Code numa janela própria. Ele só enxerga as ferramentas do EdiAula: sem arquivos, terminal ou internet.",
  };
}
