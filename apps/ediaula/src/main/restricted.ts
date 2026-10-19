import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintRunToken } from "@informach/edi-desktop/access";
import {
  CLAUDE_SETTING_SOURCES,
  claudeMcpConfig,
  endChild,
  engineEnv,
  type Launch,
} from "@informach/edi-desktop/ai-clients";
import { app } from "electron";
import { clientLaunch, locateClient, MCP_SERVER, mcpUrl } from "./aiSettings.ts";

/** The terminal stays usable for a working day; its token goes away when the window closes. */
const WINDOW_TTL_MS = 12 * 3600_000;

const folder = (): string => join(app.getPath("userData"), "claude-restrito");

/** Windows open now, so signing out can close them (their token is revoked with them). */
const windows = new Map<ChildProcess, () => void>();

/**
 * Earlier versions wrote the permanent token into this folder's mcp.json (and a .cmd that opened
 * it). The file is written again with only the name of the token's variable, and the .cmd goes.
 */
export function migrateRestrictedConfig(port: number): void {
  const dir = folder();
  const config = join(dir, "mcp.json");
  if (existsSync(config) && !readFileSync(config, "utf8").includes(`\${${MCP_SERVER.tokenEnv}}`))
    writeFileSync(config, claudeMcpConfig(mcpUrl(port), MCP_SERVER));
  rmSync(join(dir, "abrir-claude.cmd"), { force: true });
}

/** Signed out of the computer: every restricted window closes and its token goes. */
export function closeRestrictedWindows(): void {
  for (const [child, revoke] of windows) {
    revoke();
    endChild(child);
  }
  windows.clear();
}

/**
 * Opens the user's own Claude Code in a window of its own that can only use EdiAula's editing
 * tools: no file access, no shell, no web. It runs in an empty folder with its own MCP config,
 * so it cannot touch the original media or the rest of the computer, without the connectors of
 * the person's claude.ai account nor the settings of the folders around it. The config file
 * names the token's environment variable; the token itself only exists in that process's
 * environment.
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
  const dir = folder();
  mkdirSync(dir, { recursive: true });
  const config = join(dir, "mcp.json");
  writeFileSync(config, claudeMcpConfig(mcpUrl(port), MCP_SERVER));
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
        ...CLAUDE_SETTING_SOURCES,
        "--tools",
        "",
        "--allowedTools",
        `mcp__${MCP_SERVER.name}`,
      ],
      {
        cwd: dir,
        // Its own console window, independent of EdiAula's.
        detached: true,
        windowsHide: false,
        shell: false,
        stdio: "ignore",
        env: engineEnv(process.env, {
          minimal: false,
          token: { env: MCP_SERVER.tokenEnv, value: token.token },
          launch: launch.env,
          claude: true,
        }),
      },
    );
    windows.set(child, token.revoke);
    child.on("exit", () => {
      token.revoke();
      windows.delete(child);
    });
    child.on("error", (err) => {
      token.revoke();
      windows.delete(child);
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
