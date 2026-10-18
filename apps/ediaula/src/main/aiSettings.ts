import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { connectMcpClient, isMcpClientConnected } from "@informach/edi-desktop/mcp-config";
import { app, safeStorage } from "electron";
import { z } from "zod";
import { DEFAULT_EFFORT, EFFORTS, type Effort, resolveModel } from "../shared/aiModels.ts";
import type { AiClientId, AiClientStatus } from "../shared/types.ts";
import { type Launch, LaunchError, resolveLaunch, type ScriptRuntime } from "./engineArgs.ts";

export const DEFAULT_MCP_PORT = 47321;
export const MCP_NAME = "ediaula";

const storedSchema = z.looseObject({
  /** API key encrypted with the OS keychain (DPAPI on Windows), base64. */
  apiKeyEnc: z.string().optional(),
  model: z.string().max(100).optional(),
  /** Which AI powers the in-app chat. */
  engine: z.enum(["claude-code", "codex", "api"]).optional(),
  /** Claude Code model alias ('default' keeps the user's own setting). */
  claudeModel: z.string().max(100).optional(),
  /** Reasoning effort for the API key and Claude Code. */
  effort: z.enum(EFFORTS.map((e) => e.id) as [Effort, ...Effort[]]).optional(),
  mcpEnabled: z.boolean().optional(),
  mcpPort: z.int().min(1024).max(65535).optional(),
  /** Result of the Codex self-check for that Codex version. */
  codexRestricted: z.looseObject({ version: z.string().max(200), ok: z.boolean() }).optional(),
  /** Codex version the person chose to use without the guarantee. */
  codexConfirmed: z.string().max(200).optional(),
});

export type Stored = z.infer<typeof storedSchema>;

const file = (): string => join(app.getPath("userData"), "ai.json");

/** The stored settings; a model that left the list is moved to its successor once. */
export async function readStored(): Promise<Stored> {
  let stored: Stored;
  try {
    stored = storedSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    return {};
  }
  const model = resolveModel(stored.model);
  if (model.migrated) {
    stored.model = model.model;
    await writeStored(stored);
  }
  return stored;
}

export const storedEffort = (stored: Stored): Effort => stored.effort ?? DEFAULT_EFFORT;

export async function writeStored(s: Stored): Promise<void> {
  await writeFile(file(), JSON.stringify(s, null, 1));
}

export function encryptKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("O Windows não liberou a criptografia para guardar a chave.");
  return safeStorage.encryptString(key).toString("base64");
}

export function decryptKey(enc?: string): string | null {
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    return null;
  }
}

export const mcpUrl = (port: number): string => `http://127.0.0.1:${port}/mcp`;

/* ----- Claude Code / Codex detection and one-click connection ----- */

function exec(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true, env }, (err, stdout, stderr) => {
      const code = err
        ? typeof (err as NodeJS.ErrnoException).code === "number"
          ? Number((err as NodeJS.ErrnoException).code)
          : 1
        : 0;
      resolve({ code, out: `${stdout}${stderr}`.trim() });
    });
  });
}

/** The JavaScript runtime for a client installed by npm as a script. */
export async function scriptRuntime(shimDir: string): Promise<ScriptRuntime> {
  const local = join(shimDir, "node.exe");
  if (existsSync(local)) return { command: local, env: {} };
  // Development builds can run scripts on Electron itself; the installed app has that turned off.
  if (!app.isPackaged) return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
  const node = await which("node");
  if (node?.toLowerCase().endsWith(".exe")) return { command: node, env: {} };
  throw new LaunchError(
    "Este programa foi instalado pelo npm e precisa do Node.js, que não foi encontrado. Instale o Node.js ou o instalador oficial do programa.",
  );
}

/** How to start a client binary without a shell (engineArgs.resolveLaunch). */
export const clientLaunch = (bin: string): Promise<Launch> => resolveLaunch(bin, scriptRuntime);

/** Runs a client binary (never through a shell) and returns its exit code and output. */
async function run(
  bin: string,
  args: string[],
  timeout = 30000,
): Promise<{ code: number; out: string }> {
  let launch: Launch;
  try {
    launch = await clientLaunch(bin);
  } catch (error) {
    return { code: 1, out: error instanceof Error ? error.message : String(error) };
  }
  const env = { ...process.env, ...launch.env };
  if (!launch.env.ELECTRON_RUN_AS_NODE) delete env.ELECTRON_RUN_AS_NODE;
  return exec(launch.command, [...launch.args, ...args], env, timeout);
}

async function which(name: string): Promise<string | null> {
  const r = await exec("where.exe", [name], process.env, 8000);
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
  return isMcpClientConnected({ client: id, home: homedir(), name: MCP_NAME, port });
}

/** First line of `<client> --version`. */
export const clientVersion = async (bin: string): Promise<string> =>
  (await run(bin, ["--version"], 15000)).out.split(/\r?\n/)[0] ?? "";

export async function clientStatus(port = DEFAULT_MCP_PORT): Promise<AiClientStatus[]> {
  const ids: AiClientId[] = ["claude-code", "codex"];
  return Promise.all(
    ids.map(async (id) => {
      const bin = await locateClient(id);
      const version = bin ? await clientVersion(bin) : undefined;
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

/** Registers EdiAula's MCP server in the user's Claude Code or Codex configuration. */
export async function connectClient(
  id: AiClientId,
  port: number,
): Promise<{ ok: boolean; message: string }> {
  if (!(await locateClient(id)))
    return { ok: false, message: "Cliente oficial não encontrado neste computador." };
  return connectMcpClient({ client: id, home: homedir(), name: MCP_NAME, port });
}
