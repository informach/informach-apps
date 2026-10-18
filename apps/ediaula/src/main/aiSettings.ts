import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { connectMcpClient, isMcpClientConnected } from "@informach/edi-desktop/mcp-config";
import { app, safeStorage } from "electron";
import { DEFAULT_EFFORT, type Effort, resolveModel } from "../shared/aiModels.ts";
import { parseStoredSettings, type StoredSettings, trustedWhich } from "../shared/aiSettings.ts";
import type { AiClientId, AiClientStatus } from "../shared/types.ts";
import {
  engineEnv,
  type Launch,
  LaunchError,
  resolveLaunch,
  type ScriptRuntime,
} from "./engineArgs.ts";

export const DEFAULT_MCP_PORT = 47321;
export const MCP_NAME = "ediaula";

export type Stored = StoredSettings;

const file = (): string => join(app.getPath("userData"), "ai.json");

/**
 * The stored settings, field by field: one invalid field (an older version, a hand edit) drops
 * only itself (shared/aiSettings.ts). A missing or unreadable file is no settings; a model that
 * left the list is moved to its successor once.
 */
export async function readStored(): Promise<Stored> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("[ediaula] ai_settings_unreadable", err instanceof Error ? err.name : err);
    return {};
  }
  const { settings: stored, dropped } = parseStoredSettings(raw);
  if (dropped.length) console.warn("[ediaula] ai_settings_fields_dropped", dropped.join(","));
  const model = resolveModel(stored.model);
  if (model.migrated) {
    stored.model = model.model;
    await writeStored(stored);
  }
  return stored;
}

export const storedEffort = (stored: Stored): Effort => stored.effort ?? DEFAULT_EFFORT;

/** Written to a file beside it and then renamed over it: a crash never leaves half a file. */
export async function writeStored(s: Stored): Promise<void> {
  const target = file();
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(s, null, 1), { flag: "wx" });
    await rename(temporary, target);
  } catch (err) {
    await rm(temporary, { force: true });
    throw err;
  }
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
  cwd?: string,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true, env, cwd }, (err, stdout, stderr) => {
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
  // The same environment as a run, without EdiAula's own variables.
  const env = engineEnv(process.env, { minimal: false, launch: launch.env });
  return exec(launch.command, [...launch.args, ...args], env, timeout);
}

/**
 * A program on the PATH, found by Windows' own where.exe (by its full path, run from System32 so
 * the folder EdiAula was opened from is not searched first). A hit in the current folder, the
 * temporary folders or Downloads is not used: a program there was not installed.
 */
async function which(name: string): Promise<string | null> {
  const system = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  const system32 = join(system, "System32");
  const r = await exec(join(system32, "where.exe"), [name], process.env, 8000, system32);
  if (r.code !== 0) return null;
  return trustedWhich(r.out, [
    process.cwd(),
    tmpdir(),
    process.env.TEMP ?? "",
    process.env.TMP ?? "",
    join(homedir(), "Downloads"),
  ]);
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

/**
 * Registers EdiAula's MCP server in the user's Claude Code or Codex configuration. A client
 * already connected keeps its token unless `rotate` (Reconectar) is asked.
 */
export async function connectClient(
  id: AiClientId,
  port: number,
  rotate = false,
): Promise<{ ok: boolean; message: string }> {
  if (!(await locateClient(id)))
    return { ok: false, message: "Cliente oficial não encontrado neste computador." };
  return connectMcpClient({ client: id, home: homedir(), name: MCP_NAME, port, rotate });
}
