import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";

/**
 * How EdiAula starts the person's Claude Code and Codex. Never through a shell: a message the
 * person (or a script pasted in the chat) wrote is not a command line, so it goes to the
 * program's standard input, never into its arguments. The functions here only build values;
 * engines.ts and aiSettings.ts run them.
 */

/** Environment variable that carries the run's MCP token; never an argument nor a file. */
export const MCP_TOKEN_ENV = "EDIAULA_MCP_TOKEN";

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

/**
 * The target of an npm `.cmd` shim: the executable or script it runs, with the Node flags the
 * shim passes. Null when the file is not a shim this code recognises.
 */
export function parseCmdShim(
  text: string,
  dir: string,
): { target: string; kind: "exe" | "script"; flags: string[] } | null {
  const pattern = /"%~?dp0%?\\([^"%]+?\.(?:exe|cjs|mjs|js))"/gi;
  let found: { target: string; index: number; length: number } | null = null;
  for (const match of text.matchAll(pattern)) {
    // The shim tests for a node.exe next to itself first; that is the runtime, not the program.
    if (/^node\.exe$/i.test(match[1])) continue;
    found = { target: match[1], index: match.index ?? 0, length: match[0].length };
  }
  if (!found) return null;
  const target = normalize(join(dir, found.target));
  if (!target.toLowerCase().startsWith(normalize(dir).toLowerCase())) return null;
  const kind = /\.exe$/i.test(found.target) ? "exe" : "script";
  // Node flags between the runtime ("%_prog%") and the script, e.g. --no-warnings=DEP0040.
  const line = text.slice(text.lastIndexOf("\n", found.index) + 1, found.index);
  const prog = line.lastIndexOf('"%_prog%"');
  const flags =
    kind === "script" && prog >= 0
      ? line
          .slice(prog + '"%_prog%"'.length)
          .trim()
          .split(/\s+/)
          .filter((flag) => /^--[\w.-]+(=[\w.,:-]+)?$/.test(flag))
      : [];
  return { target, kind, flags };
}

/**
 * How to start `bin` without a shell. An `.exe` runs directly. An npm `.cmd` shim is read to
 * find what it runs: an executable runs directly, a script runs on `runtime` (a node.exe next
 * to the shim, when there is one). Anything else is refused with a message the person can act on.
 */
export async function resolveLaunch(
  bin: string,
  runtime: (shimDir: string) => Promise<ScriptRuntime>,
): Promise<Launch> {
  const ext = extname(bin).toLowerCase();
  if (ext === ".exe") return { command: bin, args: [], env: {} };
  if (ext !== ".cmd" && ext !== ".bat")
    throw new LaunchError(
      `Não sei iniciar ${bin} com segurança. Reinstale o programa oficial (ele instala um .exe ou um atalho do npm).`,
    );
  let text: string;
  try {
    text = await readFile(bin, "utf8");
  } catch {
    throw new LaunchError(`Não consegui ler ${bin}. Reinstale o programa oficial.`);
  }
  const shim = parseCmdShim(text, dirname(bin));
  if (!shim || !existsSync(shim.target))
    throw new LaunchError(
      `${bin} não é um atalho do npm que o EdiAula reconheça, então ele não é aberto por segurança. Reinstale o programa oficial com o instalador dele ou com "npm install -g".`,
    );
  if (shim.kind === "exe") return { command: shim.target, args: [], env: {} };
  const js = await runtime(dirname(bin));
  return { command: js.command, args: [...shim.flags, shim.target], env: js.env };
}

/** Claude Code without any built-in tool, only EdiAula's, with the message on standard input. */
export function claudeArgs(options: {
  resume?: string;
  model?: string;
  effort?: string;
  mcpConfig: string;
  systemPrompt: string;
}): string[] {
  return [
    "-p",
    "--input-format",
    "text",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // No built-in tools at all (files, terminal, web): only EdiAula's editing tools.
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    options.mcpConfig,
    "--allowedTools",
    "mcp__ediaula",
    "--append-system-prompt",
    options.systemPrompt,
    ...(options.resume ? ["--resume", options.resume] : []),
    ...(options.model && options.model !== "default" ? ["--model", options.model] : []),
    ...(options.effort ? ["--effort", options.effort] : []),
  ];
}

/** MCP configuration for Claude Code: the token is read from the environment (${VAR}). */
export const claudeMcpConfig = (url: string): string =>
  JSON.stringify({
    mcpServers: {
      ediaula: {
        type: "http",
        url,
        headers: { Authorization: `Bearer \${${MCP_TOKEN_ENV}}` },
      },
    },
  });

/**
 * Codex features that reach beyond the editor's tools. They are turned off (through -c, which
 * ignores names an older version does not know) and codexGuard stops a run that uses one anyway.
 */
export const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "code_mode_host",
  "apps",
  "plugins",
  "multi_agent",
  "hooks",
  "browser_use",
  "computer_use",
  "image_generation",
  "view_image",
  "skill_search",
  "skill_mcp_dependency_install",
  "tool_suggest",
] as const;

/** Codex in a read-only sandbox, without the person's config, with the message on standard input. */
export function codexArgs(options: { thread?: string; url: string; workspace: string }): string[] {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    // The person's config.toml can add servers and tools that see the whole computer.
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "read-only",
    "-C",
    options.workspace,
    "-c",
    `mcp_servers.ediaula.url=${JSON.stringify(options.url)}`,
    "-c",
    `mcp_servers.ediaula.bearer_token_env_var=${JSON.stringify(MCP_TOKEN_ENV)}`,
    "-c",
    'web_search="disabled"',
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["-c", `features.${feature}=false`]),
    ...(options.thread ? ["resume", options.thread, "-"] : ["-"]),
  ];
}

/** Variables Codex needs to start, find its login and reach the network; nothing else goes in. */
const CODEX_ENV = new Set(
  [
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "USERNAME",
    "USERDOMAIN",
    "COMPUTERNAME",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
    "CODEX_HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "LANG",
    "LC_ALL",
  ].map((name) => name.toUpperCase()),
);

/** Variables of EdiAula itself that a child must not inherit. */
const PRIVATE_ENV = /^(ELECTRON_|EDI_|EDIAULA_|NODE_OPTIONS$)/i;

/**
 * The environment of an engine process. Codex gets only what it needs (`minimal`); Claude Code
 * keeps the person's variables (its own login may use them) without EdiAula's. Both get the run
 * token and what the launch needs (the script runtime).
 */
export function engineEnv(
  source: NodeJS.ProcessEnv,
  options: { minimal: boolean; token?: string; launch?: Record<string, string> },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || PRIVATE_ENV.test(name)) continue;
    if (options.minimal && !CODEX_ENV.has(name.toUpperCase())) continue;
    env[name] = value;
  }
  Object.assign(env, options.launch ?? {});
  if (options.token) env[MCP_TOKEN_ENV] = options.token;
  return env;
}

/** Item types in Codex's JSON stream that act outside the editor's tools. */
const CODEX_FORBIDDEN = new Set([
  "command_execution",
  "file_change",
  "web_search",
  "local_shell_call",
  "patch_apply",
  "computer_use",
  "browser_use",
]);

/**
 * What a Codex event did outside the editor's tools (running a command, changing a file,
 * searching the web), or null. The run is stopped as soon as one appears.
 */
export function codexGuard(event: Record<string, unknown>): string | null {
  if (typeof event.type !== "string" || !event.type.startsWith("item.")) return null;
  const item = event.item as { type?: unknown } | undefined;
  return typeof item?.type === "string" && CODEX_FORBIDDEN.has(item.type) ? item.type : null;
}
