import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  win32,
} from "node:path";
import { engineEnv } from "./ai-args.ts";
import { connectMcpClient, isMcpClientConnected } from "./mcp-config.ts";

/**
 * Finding and starting the person's own Claude Code and Codex, the official programs installed
 * on the computer. They are started without a shell: npm and bun launchers are read to find the
 * real program, and anything this code does not recognise is refused.
 */

export type AiClientId = "claude-code" | "codex";
export const AI_CLIENT_IDS = ["claude-code", "codex"] as const satisfies readonly AiClientId[];
export const AI_CLIENT_NAMES: Record<AiClientId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

export interface AiClientStatus {
  id: AiClientId;
  name: string;
  installed: boolean;
  version?: string;
  connected: boolean;
}

/** A program ready to spawn without a shell: run `command` with `args` and these variables. */
export interface Launch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export class LaunchError extends Error {}

/** The JavaScript runtime for npm packages that ship a script instead of an executable. */
export interface ScriptRuntime {
  command: string;
  env: Record<string, string>;
}

export interface LaunchOptions {
  /**
   * Development builds may run npm scripts on Electron itself (ELECTRON_RUN_AS_NODE); the
   * installed application has that turned off, so this is `!app.isPackaged` at most.
   */
  allowElectronRuntime?: boolean;
  /** Leaves API keys and other providers out of the client's environment. */
  personalOnly?: boolean;
}

/** Node flags a shim may pass to the runtime: only ones that silence warnings. */
const SAFE_NODE_FLAGS = new Set(["--no-warnings", "--no-deprecation"]);

/** `target` resolved inside `dir`, or null when it would leave it (`..`, another drive). */
function inside(dir: string, target: string): string | null {
  const full = normalize(join(dir, target));
  const rel = relative(dir, full);
  return !rel || rel.startsWith("..") || isAbsolute(rel) ? null : full;
}

/**
 * The target of an npm `.cmd` shim: the executable or script it runs, with the Node flags the
 * shim passes. Null when the file is not a shim this code recognises, or points outside its
 * own folder.
 */
export function parseCmdShim(
  text: string,
  dir: string,
): { target: string; kind: "exe" | "script"; flags: string[] } | null {
  const pattern = /"%~?dp0%?\\([^"%]+?\.(?:exe|cjs|mjs|js))"/gi;
  let found: { target: string; index: number } | null = null;
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    // The shim tests for a node.exe next to itself first; that is the runtime, not the program.
    if (!name || /^node\.exe$/i.test(name)) continue;
    found = { target: name, index: match.index ?? 0 };
  }
  if (!found) return null;
  const target = inside(dir, found.target);
  if (!target) return null;
  const kind = /\.exe$/i.test(found.target) ? "exe" : "script";
  // Node flags between the runtime ("%_prog%") and the script.
  const line = text.slice(text.lastIndexOf("\n", found.index) + 1, found.index);
  const prog = line.lastIndexOf('"%_prog%"');
  const flags =
    kind === "script" && prog >= 0
      ? line
          .slice(prog + '"%_prog%"'.length)
          .trim()
          .split(/\s+/)
          .filter((flag) => SAFE_NODE_FLAGS.has(flag))
      : [];
  return { target, kind, flags };
}

/**
 * The script a bun launcher runs: bun installs `<name>.exe` next to `<name>.bunx`, a UTF-16
 * text with the script's path relative to bun's folder. Null when it is not one.
 */
export function parseBunx(bytes: Buffer, binDir: string): string | null {
  const text = bytes.toString("utf16le");
  const end = text.indexOf('"');
  const path = end > 0 ? text.slice(0, end) : "";
  return /^[\w@.\\/ -]+\.(?:cjs|mjs|js)$/.test(path) ? inside(dirname(binDir), path) : null;
}

const CODEX_TRIPLE: Record<string, string> = {
  x64: "x86_64-pc-windows-msvc",
  arm64: "aarch64-pc-windows-msvc",
};

/**
 * The native codex.exe behind the npm package's `bin/codex.js`, which only starts it as a
 * child. Running it directly keeps the real program as the application's own child.
 */
export function nativeCodexFor(script: string, arch: string = process.arch): string | null {
  if (!/[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/i.test(script)) return null;
  const pkg = dirname(dirname(script));
  const triple = CODEX_TRIPLE[arch];
  if (!triple) return null;
  const platformPkg = `codex-win32-${arch}`;
  const roots = [
    join(pkg, "node_modules", "@openai", platformPkg),
    join(dirname(pkg), platformPkg),
    pkg,
  ];
  for (const root of roots)
    for (const rel of [
      ["bin", "codex.exe"],
      ["codex", "codex.exe"],
    ]) {
      const exe = join(root, "vendor", triple, ...rel);
      if (existsSync(exe)) return exe;
    }
  return null;
}

/**
 * How to start `bin` without a shell. An `.exe` runs directly, unless it is a bun launcher
 * (a `.bunx` next to it). An npm `.cmd` shim is read to find what it runs. A script runs on
 * `runtime` (a node.exe next to the shim, when there is one), except Codex's launcher script,
 * replaced by the native program it would start. Anything else is refused with a message the
 * person can act on.
 */
export async function resolveLaunch(
  bin: string,
  runtime: (shimDir: string) => Promise<ScriptRuntime>,
): Promise<Launch> {
  const ext = extname(bin).toLowerCase();
  let script: string | null = null;
  let flags: string[] = [];
  if (ext === ".exe") {
    const bunx = join(dirname(bin), `${basename(bin, extname(bin))}.bunx`);
    if (!existsSync(bunx)) return { command: bin, args: [], env: {} };
    script = parseBunx(await readFile(bunx), dirname(bin));
    if (!script || !existsSync(script))
      throw new LaunchError(
        `${bin} é um atalho do bun que não foi reconhecido, então ele não é aberto por segurança. Reinstale o programa oficial.`,
      );
  } else if (ext === ".cmd" || ext === ".bat") {
    let text: string;
    try {
      text = await readFile(bin, "utf8");
    } catch {
      throw new LaunchError(`Não consegui ler ${bin}. Reinstale o programa oficial.`);
    }
    const shim = parseCmdShim(text, dirname(bin));
    if (!shim || !existsSync(shim.target))
      throw new LaunchError(
        `${bin} não é um atalho do npm reconhecido, então ele não é aberto por segurança. Reinstale o programa oficial com o instalador dele ou com "npm install -g".`,
      );
    if (shim.kind === "exe") return { command: shim.target, args: [], env: {} };
    script = shim.target;
    flags = shim.flags;
  } else
    throw new LaunchError(
      `Não sei iniciar ${bin} com segurança. Reinstale o programa oficial (ele instala um .exe ou um atalho do npm).`,
    );
  const native = nativeCodexFor(script);
  if (native) return { command: native, args: [], env: {} };
  const js = await runtime(dirname(bin));
  return { command: js.command, args: [...flags, script], env: js.env };
}

/* ----- Finding the programs ----- */

/** A Windows path compared as Windows does: any case, either slash, no slash at the end. */
const folderKey = (folder: string): string =>
  win32.normalize(folder.replaceAll("/", "\\")).replace(/\\+$/, "").toLowerCase();

/**
 * The first program of where.exe's answer that may be started: a local .exe or .cmd (no network
 * share, no `.` or `..` segments), not in the current folder (`untrusted[0]`) and not inside one
 * of the other `untrusted` folders (temporary files, Downloads).
 */
export function trustedWhich(out: string, untrusted: readonly string[]): string | null {
  const [cwd, ...rest] = untrusted;
  for (const line of out.split(/\r?\n/)) {
    const path = line.trim();
    if (!/^[a-z]:\\.+\.(exe|cmd)$/i.test(path)) continue;
    if (path.split(/[\\/]/).some((part) => part === "." || part === "..")) continue;
    const key = folderKey(path);
    const folder = key.slice(0, key.lastIndexOf("\\"));
    if (cwd && folder === folderKey(cwd)) continue;
    if (rest.some((dir) => dir && key.startsWith(`${folderKey(dir)}\\`))) continue;
    return path;
  }
  return null;
}

/** Runs a program without a shell; its exit code and its whole output (stdout then stderr). */
function exec(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
  cwd?: string,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout, windowsHide: true, shell: false, env, cwd },
      (err, stdout, stderr) => {
        const raw: unknown = err ? Reflect.get(err, "code") : 0;
        const code = err ? (typeof raw === "number" ? raw : 1) : 0;
        resolve({ code, out: `${stdout}${stderr}`.trim() });
      },
    );
  });
}

/**
 * A program on the PATH, found by Windows' own where.exe (by its full path, run from System32 so
 * the folder the application was opened from is not searched first). A hit in the current
 * folder, the temporary folders or Downloads is not used: a program there was not installed.
 */
export async function which(name: string): Promise<string | null> {
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

/** Where the official installers put each client, when it is not on the PATH. */
function candidates(id: AiClientId): string[] {
  const npm = join(process.env.APPDATA ?? "", "npm");
  if (id === "claude-code")
    return [join(homedir(), ".local", "bin", "claude.exe"), join(npm, "claude.cmd")];
  return [
    // The real binary inside the npm package: avoids running a .cmd shim.
    join(
      npm,
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
    join(npm, "codex.cmd"),
    join(homedir(), ".local", "bin", "codex.exe"),
  ];
}

/** The installed client, or null. */
export async function locateClient(id: AiClientId): Promise<string | null> {
  const known = candidates(id);
  const native = known[0];
  if (id === "codex" && native && existsSync(native)) return native;
  const fromPath = await which(id === "claude-code" ? "claude" : "codex");
  if (fromPath) return fromPath;
  return known.find((p) => existsSync(p)) ?? null;
}

/** The JavaScript runtime for a client installed by npm as a script. */
export async function scriptRuntime(
  shimDir: string,
  options: LaunchOptions = {},
): Promise<ScriptRuntime> {
  const local = join(shimDir, "node.exe");
  if (existsSync(local)) return { command: local, env: {} };
  if (options.allowElectronRuntime)
    return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
  const node = await which("node");
  if (node?.toLowerCase().endsWith(".exe")) return { command: node, env: {} };
  throw new LaunchError(
    "Este programa foi instalado pelo npm e precisa do Node.js, que não foi encontrado. Instale o Node.js ou o instalador oficial do programa.",
  );
}

/** How to start a client binary without a shell (resolveLaunch). */
export const clientLaunch = (bin: string, options: LaunchOptions = {}): Promise<Launch> =>
  resolveLaunch(bin, (dir) => scriptRuntime(dir, options));

/** Runs a client binary (never through a shell) and returns its exit code and output. */
export async function runClient(
  bin: string,
  args: string[],
  options: LaunchOptions & { timeoutMs?: number } = {},
): Promise<{ code: number; out: string }> {
  let launch: Launch;
  try {
    launch = await clientLaunch(bin, options);
  } catch (error) {
    return { code: 1, out: error instanceof Error ? error.message : String(error) };
  }
  // The same environment as a run, without the application's own variables.
  const env = engineEnv(process.env, {
    minimal: false,
    launch: launch.env,
    personalOnly: options.personalOnly,
  });
  return exec(launch.command, [...launch.args, ...args], env, options.timeoutMs ?? 30_000);
}

/** First line of `<client> --version`. */
export const clientVersion = async (bin: string, options: LaunchOptions = {}): Promise<string> =>
  (await runClient(bin, ["--version"], { ...options, timeoutMs: 15_000 })).out.split(/\r?\n/)[0] ??
  "";

/**
 * Whether each client is installed, its version and whether the application's MCP server is in
 * its configuration (read from the clients' own files: faster than asking them).
 */
export function clientStatus(
  options: LaunchOptions & { port: number; serverName: string; home?: string },
): Promise<AiClientStatus[]> {
  return Promise.all(
    AI_CLIENT_IDS.map(async (id) => {
      const bin = await locateClient(id);
      const version = bin ? await clientVersion(bin, options) : undefined;
      return {
        id,
        name: AI_CLIENT_NAMES[id],
        installed: !!bin,
        version,
        connected: await isMcpClientConnected({
          client: id,
          home: options.home ?? homedir(),
          name: options.serverName,
          port: options.port,
        }),
      };
    }),
  );
}

/**
 * Registers the application's MCP server in the person's Claude Code or Codex configuration. A
 * client already connected keeps its token unless `rotate` (Reconectar) is asked.
 */
export async function connectClient(options: {
  id: AiClientId;
  port: number;
  serverName: string;
  rotate?: boolean;
  home?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!(await locateClient(options.id)))
    return { ok: false, message: "Cliente oficial não encontrado neste computador." };
  return connectMcpClient({
    client: options.id,
    home: options.home ?? homedir(),
    name: options.serverName,
    port: options.port,
    rotate: options.rotate ?? false,
  });
}

/**
 * Whether the client is signed in with the person's own subscription (Claude account or ChatGPT),
 * from its own status command. Pure, for tests.
 */
export function personalLogin(id: AiClientId, result: { code: number; out: string }): boolean {
  if (result.code !== 0) return false;
  if (id === "codex") return /logged in using chatgpt/i.test(result.out);
  try {
    const status: unknown = JSON.parse(result.out);
    return (
      !!status && typeof status === "object" && Reflect.get(status, "authMethod") === "claude.ai"
    );
  } catch {
    return false;
  }
}

/** Refuses a client that is not signed in with the person's own subscription. */
export async function requirePersonalLogin(
  id: AiClientId,
  bin: string,
  options: LaunchOptions = {},
): Promise<void> {
  const result = await runClient(
    bin,
    id === "codex" ? ["login", "status"] : ["auth", "status", "--json"],
    { ...options, personalOnly: true, timeoutMs: 15_000 },
  );
  if (!personalLogin(id, result))
    throw new Error(
      `Faça login no ${id === "codex" ? "Codex com sua conta ChatGPT" : "Claude Code com sua conta Claude"}. Este assistente usa somente assinatura pessoal.`,
    );
}
