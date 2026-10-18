import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from "node:path";

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
    // The shim tests for a node.exe next to itself first; that is the runtime, not the program.
    if (/^node\.exe$/i.test(match[1])) continue;
    found = { target: match[1], index: match.index ?? 0 };
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
 * child. Running it directly keeps the real program as EdiAula's own child.
 */
export function nativeCodexFor(script: string, arch = process.arch): string | null {
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
        `${bin} é um atalho do bun que o EdiAula não reconhece, então ele não é aberto por segurança. Reinstale o programa oficial.`,
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
        `${bin} não é um atalho do npm que o EdiAula reconheça, então ele não é aberto por segurança. Reinstale o programa oficial com o instalador dele ou com "npm install -g".`,
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
 * Codex features that reach beyond the editor's tools, by name. The installed version's own list
 * (`codex features list`) is matched against this, so features added later with such names are
 * turned off too; the fixed list below is used when the list cannot be read.
 */
const RISKY_FEATURE =
  /shell|exec|code_mode|repl|multi_agent|collab|agent_message_board|send_message|send_async|apps|plugin|hook|browser|computer|image_generation|view_image|skill|tool_suggest|search_tool|web_search|memories|workspace_dependencies|worktree|in_app_|realtime|remote_control|remote_plugin|automation|sleep_tool|request_permissions|request_rule|artifact|fanout|subagent|external_agent|mcp_apps|undo/;

/** Names of the installed Codex's features that must be off (from `codex features list`). */
export function riskyCodexFeatures(list: string): string[] {
  const names = list
    .split(/\r?\n/)
    .map((line) => /^([a-z0-9_.]+)\s/.exec(line.trim())?.[1])
    .filter((name): name is string => !!name);
  return [
    ...new Set([...names.filter((name) => RISKY_FEATURE.test(name)), ...CODEX_DISABLED_FEATURES]),
  ];
}

/**
 * Turned off when the installed version's list cannot be read. Each goes through -c, which
 * ignores names a version does not know; codexGuard stops a run that acts outside anyway.
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
  "multi_agent_v2",
  "js_repl",
] as const;

/**
 * Codex in a read-only sandbox, without the person's config, with the message on standard input.
 * The options go before `resume`, as Codex's own SDK passes them (they apply to the resumed
 * session too).
 */
export function codexArgs(options: {
  thread?: string;
  url: string;
  workspace: string;
  disabledFeatures?: readonly string[];
}): string[] {
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
    ...(options.disabledFeatures ?? CODEX_DISABLED_FEATURES).flatMap((feature) => [
      "-c",
      `features.${feature}=false`,
    ]),
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

/** Item types in Codex's JSON stream that stay inside the conversation. */
const CODEX_ALLOWED = new Set(["agent_message", "reasoning", "todo_list", "error"]);

/**
 * What a Codex event did outside the editor's tools, or null. Only messages, reasoning, the
 * to-do list, errors and calls to EdiAula's own MCP server are allowed; anything else (a
 * command, a file change, a web search, another MCP server, a sub-agent) stops the run.
 */
export function codexGuard(event: Record<string, unknown>): string | null {
  if (typeof event.type !== "string" || !event.type.startsWith("item.")) return null;
  const item = event.item as { type?: unknown; server?: unknown } | undefined;
  const type = typeof item?.type === "string" ? item.type : "desconhecido";
  if (CODEX_ALLOWED.has(type)) return null;
  if (type === "mcp_tool_call" && item?.server === "ediaula") return null;
  return type === "mcp_tool_call" ? `mcp_tool_call:${String(item?.server ?? "")}` : type;
}

/** What codexGuard stopped, in words for the person. */
const FORBIDDEN_ACTION: Record<string, string> = {
  command_execution: "rodar um comando no computador",
  file_change: "mudar um arquivo",
  web_search: "pesquisar na internet",
  collab_tool_call: "chamar outro agente",
};

export const actionName = (forbidden: string): string =>
  forbidden.startsWith("mcp_tool_call:")
    ? `usar outro servidor de ferramentas (${forbidden.slice("mcp_tool_call:".length) || "sem nome"})`
    : (FORBIDDEN_ACTION[forbidden] ?? `agir fora do editor (${forbidden})`);

/** What one self-check run showed, from Codex's JSON events (pure, for tests). */
export interface SelfCheckEvidence {
  violation: string | null;
  leaked: boolean;
  completed: boolean;
  /** Codex called a tool of EdiAula's server: it did follow the request with its tools. */
  editorTool: boolean;
}

/**
 * The verdict of a self-check. It only passes with positive evidence: the turn ran to the end,
 * Codex called the editor's tool as asked, and nothing outside the editor happened nor did the
 * code of the file show up. A model that only answered "não consigo" without trying proves
 * nothing, and the result is not recorded (`conclusive` false).
 */
export function selfCheckVerdict(e: SelfCheckEvidence): {
  ok: boolean;
  conclusive: boolean;
  detail: string;
} {
  if (e.violation)
    return { ok: false, conclusive: true, detail: `O Codex tentou ${actionName(e.violation)}.` };
  if (e.leaked)
    return {
      ok: false,
      conclusive: true,
      detail: "O Codex conseguiu ler um arquivo do computador.",
    };
  if (!e.completed) return { ok: false, conclusive: false, detail: "A conferência não terminou." };
  if (!e.editorTool)
    return {
      ok: false,
      conclusive: false,
      detail: "O Codex não chamou a ferramenta do editor, então a conferência não vale.",
    };
  return {
    ok: true,
    conclusive: true,
    detail: "O Codex usou a ferramenta do editor e não conseguiu ler o arquivo do computador.",
  };
}

/**
 * The part of an agent message not shown yet. Codex may send the text so far while it writes
 * (item.updated) and the whole text when it is done (item.completed): each time only what follows
 * what was already shown goes to the panel, and a text that changed earlier on (not a
 * continuation) adds only what comes after the part both share.
 */
export function messageDelta(shown: Map<string, string>, id: string, text: string): string {
  const before = shown.get(id) ?? "";
  shown.set(id, text.length >= before.length ? text : before);
  let same = 0;
  while (same < before.length && same < text.length && before[same] === text[same]) same++;
  return text.length > before.length ? text.slice(Math.max(same, before.length)) : "";
}

/**
 * Claude Code for one answer with no tools at all (not even EdiAula's): a translation or a quiz
 * the editor checks itself. The prompt goes on standard input; the answer comes as one JSON.
 */
export function claudeOneShotArgs(options: { model?: string; effort?: string }): string[] {
  return [
    "-p",
    "--input-format",
    "text",
    "--output-format",
    "json",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    ...(options.model && options.model !== "default" ? ["--model", options.model] : []),
    ...(options.effort ? ["--effort", options.effort] : []),
  ];
}

/** The answer of a one-shot Claude Code run (its JSON result on standard output). */
export function claudeOneShotResult(stdout: string): string {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .at(-1);
  if (!line) throw new Error("O Claude Code não devolveu resposta.");
  const parsed: unknown = JSON.parse(line);
  const result: unknown = parsed && typeof parsed === "object" ? Reflect.get(parsed, "result") : "";
  const failed: unknown =
    parsed && typeof parsed === "object" ? Reflect.get(parsed, "is_error") : true;
  if (failed === true || typeof result !== "string")
    throw new Error(`Claude Code: ${typeof result === "string" && result ? result : "falhou"}`);
  return result;
}

/** Codex for one answer: read-only, without the person's config, without EdiAula's server. */
export function codexOneShotArgs(options: {
  workspace: string;
  disabledFeatures?: readonly string[];
}): string[] {
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "read-only",
    "-C",
    options.workspace,
    "-c",
    'web_search="disabled"',
    ...(options.disabledFeatures ?? CODEX_DISABLED_FEATURES).flatMap((feature) => [
      "-c",
      `features.${feature}=false`,
    ]),
    "-",
  ];
}

/**
 * Holds what a resumed run says until the engine really answers (text, a tool, usage). A session
 * kept from an earlier run of the app may be gone on the engine's side: then the run ends without
 * answering, what it said (the error, its end) is dropped, and the caller starts over without
 * the session (`went` false). Once it answers, everything held goes out in order.
 */
export function resumeGate<E extends { type: string }>(
  emit: (e: E) => void,
): { emit: (e: E) => void; went: () => boolean } {
  let going = false;
  const held: E[] = [];
  return {
    emit: (e) => {
      if (going) return emit(e);
      if (e.type === "text" || e.type === "tool" || e.type === "usage") {
        going = true;
        for (const h of held.splice(0)) emit(h);
        emit(e);
        return;
      }
      if (e.type !== "done") held.push(e);
    },
    went: () => going,
  };
}
