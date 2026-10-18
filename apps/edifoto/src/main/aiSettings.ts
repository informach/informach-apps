import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { connectMcpClient, isMcpClientConnected } from "@informach/edi-desktop/mcp-config";
import { app } from "electron";
import type { AiClientId, AiClientStatus } from "../shared/types.ts";

import { clientCommand, personalClientEnvironment } from "./clientProcess.ts";
export const DEFAULT_MCP_PORT = 47331;
export const MCP_NAME = "edifoto";

import { personalAiPreferences } from "../shared/personalAi.ts";

type Stored = ReturnType<typeof personalAiPreferences>;

const file = (): string => join(app.getPath("userData"), "ai.json");

export async function readStored(): Promise<Stored> {
  try {
    return personalAiPreferences(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    return {};
  }
}

export async function writeStored(s: Stored): Promise<void> {
  await writeFile(file(), JSON.stringify(s, null, 1));
}

export const mcpUrl = (port: number): string => `http://127.0.0.1:${port}/mcp`;

/* ----- Claude Code / Codex detection and one-click connection ----- */

function run(bin: string, args: string[], timeout = 30000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const invocation = clientCommand(bin, args);
    execFile(
      invocation.command,
      invocation.args,
      { timeout, windowsHide: true, shell: false, env: personalClientEnvironment() },
      (err, stdout, stderr) => {
        const code = err
          ? typeof (err as NodeJS.ErrnoException).code === "number"
            ? Number((err as NodeJS.ErrnoException).code)
            : 1
          : 0;
        resolve({ code, out: `${stdout}${stderr}`.trim() });
      },
    );
  });
}

async function which(name: string): Promise<string | null> {
  const r = await run("where.exe", [name], 8000);
  if (r.code === 0) {
    const first = r.out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\.(exe|cmd)$/i.test(l));
    if (first) return first;
  }
  return null;
}

const CANDIDATES: Record<AiClientId, string[]> = {
  "claude-code": [
    join(homedir(), ".local", "bin", "claude.exe"),
    join(process.env.APPDATA ?? "", "npm", "claude.cmd"),
  ],
  codex: [
    // The real binary inside the npm package: avoids running a .cmd shim through a shell.
    join(
      process.env.APPDATA ?? "",
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    ),
    join(process.env.APPDATA ?? "", "npm", "codex.cmd"),
    join(homedir(), ".local", "bin", "codex.exe"),
  ],
};

export async function locateClient(id: AiClientId): Promise<string | null> {
  if (id === "codex" && existsSync(CANDIDATES.codex[0])) return CANDIDATES.codex[0];
  const fromPath = await which(id === "claude-code" ? "claude" : "codex");
  if (fromPath) return fromPath;
  return CANDIDATES[id].find((p) => existsSync(p)) ?? null;
}

/** Reads the clients' own config files: faster than asking them and avoids health checks. */
async function isConnected(id: AiClientId, port: number): Promise<boolean> {
  return isMcpClientConnected({ client: id, home: homedir(), name: MCP_NAME, port: port });
}

export async function clientStatus(port = DEFAULT_MCP_PORT): Promise<AiClientStatus[]> {
  const ids: AiClientId[] = ["claude-code", "codex"];
  return Promise.all(
    ids.map(async (id) => {
      const bin = await locateClient(id);
      const version = bin
        ? (await run(bin, ["--version"], 15000)).out.split(/\r?\n/)[0]
        : undefined;
      return {
        id,
        name: id === "claude-code" ? "Claude Code" : "Codex",
        installed: !!bin,
        version,
        connected: await isConnected(id, port),
      };
    }),
  );
}

/** Registers EdiFoto's MCP server in the user's Claude Code or Codex configuration. */
export async function connectClient(
  id: AiClientId,
  port: number,
): Promise<{ ok: boolean; message: string }> {
  if (!(await locateClient(id)))
    return { ok: false, message: "Cliente oficial não encontrado neste computador." };
  return connectMcpClient({ client: id, home: homedir(), name: MCP_NAME, port });
}

export async function requirePersonalLogin(id: AiClientId, bin: string): Promise<void> {
  const result = await run(
    bin,
    id === "codex" ? ["login", "status"] : ["auth", "status", "--json"],
    15000,
  );
  let personal = false;
  if (id === "codex") personal = result.code === 0 && /logged in using chatgpt/i.test(result.out);
  else {
    try {
      const status: unknown = JSON.parse(result.out);
      personal =
        result.code === 0 &&
        !!status &&
        typeof status === "object" &&
        "authMethod" in status &&
        status.authMethod === "claude.ai";
    } catch {
      personal = false;
    }
  }
  if (!personal)
    throw new Error(
      `Faça login no ${id === "codex" ? "Codex com sua conta ChatGPT" : "Claude Code com sua conta Claude"}. Este assistente usa somente assinatura pessoal.`,
    );
}
