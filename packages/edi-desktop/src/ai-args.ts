import type { McpServerRef } from "./ai-grants.ts";

/**
 * Arguments and environment of the person's own Claude Code and Codex. Never through a shell: a
 * message the person (or a script pasted in the chat) wrote is not a command line, so it goes to
 * the program's standard input, never into its arguments. The functions here only build values;
 * ai-run.ts and ai-engines.ts run them.
 */

/**
 * Settings Claude Code reads: only the person's own (~/.claude/settings.json, where its login
 * and model choice live). The project and local settings, and the project rules, of the folder
 * it runs in and of the folders above it are left out.
 */
export const CLAUDE_SETTING_SOURCES = ["--setting-sources", "user"] as const;

const modelArgs = (model?: string): string[] =>
  model && model !== "default" ? ["--model", model] : [];

/**
 * Claude Code without any built-in tool, only the application's, with the message on stdin: plain
 * text, or one stream-json user message when it carries images.
 */
export function claudeArgs(options: {
  server: Pick<McpServerRef, "name">;
  resume?: string;
  model?: string;
  effort?: string;
  mcpConfig: string;
  systemPrompt: string;
  input?: "text" | "stream-json";
}): string[] {
  return [
    "-p",
    "--input-format",
    options.input ?? "text",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // No built-in tools at all (files, terminal, web): only the application's editing tools.
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    options.mcpConfig,
    ...CLAUDE_SETTING_SOURCES,
    "--allowedTools",
    `mcp__${options.server.name}`,
    "--append-system-prompt",
    options.systemPrompt,
    ...(options.resume ? ["--resume", options.resume] : []),
    ...modelArgs(options.model),
    ...(options.effort ? ["--effort", options.effort] : []),
  ];
}

/** MCP configuration for Claude Code: the token is read from the environment (${VAR}). */
export const claudeMcpConfig = (url: string, server: McpServerRef): string =>
  JSON.stringify({
    mcpServers: {
      [server.name]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer \${${server.tokenEnv}}` },
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

const featureArgs = (features: readonly string[] = CODEX_DISABLED_FEATURES): string[] =>
  features.flatMap((feature) => ["-c", `features.${feature}=false`]);

/** Codex may only sign in with the person's ChatGPT account, never an API key. */
const CODEX_PERSONAL = ["-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"'];

/**
 * Codex in a read-only sandbox, without the person's config, with the message on standard input.
 * The options go before `resume`, as Codex's own SDK passes them (they apply to the resumed
 * session too). `ephemeral` keeps no session on Codex's side (the caller sends the history).
 */
export function codexArgs(options: {
  server: McpServerRef;
  thread?: string;
  url: string;
  workspace: string;
  disabledFeatures?: readonly string[];
  model?: string;
  ephemeral?: boolean;
  personalOnly?: boolean;
  /** Image files attached to the message (read by Codex itself, before its sandbox). */
  images?: readonly string[];
}): string[] {
  const name = options.server.name;
  return [
    "exec",
    "--json",
    // --image takes several files: an option must follow it, never the "-" of standard input.
    ...(options.images ?? []).flatMap((file) => ["--image", file]),
    ...(options.ephemeral ? ["--ephemeral"] : []),
    "--skip-git-repo-check",
    // The person's config.toml can add servers and tools that see the whole computer.
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "read-only",
    "-C",
    options.workspace,
    ...(options.personalOnly ? CODEX_PERSONAL : []),
    "-c",
    `mcp_servers.${name}.url=${JSON.stringify(options.url)}`,
    "-c",
    `mcp_servers.${name}.bearer_token_env_var=${JSON.stringify(options.server.tokenEnv)}`,
    "-c",
    'web_search="disabled"',
    ...featureArgs(options.disabledFeatures),
    ...modelArgs(options.model),
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

/** Variables of the Edi applications themselves that a child must not inherit. */
const PRIVATE_ENV = /^(ELECTRON_|EDI_|EDI(?:AULA|CAPTURA|FOTO|PDF|SVG|HUB)_|NODE_OPTIONS$)/i;

/**
 * Credentials that would make a client run on a paid API or another provider instead of the
 * person's own subscription. Left out when the application only accepts the subscription.
 */
export const PROVIDER_CREDENTIAL_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "CODEX_API_KEY",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;
const PROVIDER_CREDENTIALS = new Set<string>(PROVIDER_CREDENTIAL_ENV);

/**
 * Turns off the connectors of the person's claude.ai account (Gmail, Drive, Slack…) in a
 * Claude Code run: only the application's own server is there (--strict-mcp-config covers the
 * configured servers, not these).
 */
export const CLAUDE_NO_CONNECTORS = { ENABLE_CLAUDEAI_MCP_SERVERS: "false" } as const;

/**
 * The environment of a client process. Codex gets only what it needs (`minimal`); Claude Code
 * keeps the person's variables (its own login may use them) without the application's, and
 * without the claude.ai connectors (`claude`). `personalOnly` also leaves out API keys and other
 * providers. Both get the run token and what the launch needs (the script runtime).
 */
export function engineEnv(
  source: NodeJS.ProcessEnv,
  options: {
    minimal: boolean;
    token?: { env: string; value: string };
    launch?: Record<string, string>;
    claude?: boolean;
    personalOnly?: boolean;
  },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || PRIVATE_ENV.test(name)) continue;
    const upper = name.toUpperCase();
    if (options.minimal && !CODEX_ENV.has(upper)) continue;
    if (options.personalOnly && PROVIDER_CREDENTIALS.has(upper)) continue;
    env[name] = value;
  }
  Object.assign(env, options.launch ?? {});
  if (options.claude) Object.assign(env, CLAUDE_NO_CONNECTORS);
  if (options.token) env[options.token.env] = options.token.value;
  return env;
}

/**
 * Whether a Claude Code run with this environment is charged on the Anthropic API instead of
 * the person's subscription: in print mode (-p) Claude Code always uses ANTHROPIC_API_KEY when
 * it is set. The key stays (it may be how the person signs in); the panel says so by the cost.
 */
export const claudeBilledOnApi = (env: Readonly<Record<string, string>>): boolean =>
  Object.entries(env).some(
    ([name, value]) => name.toUpperCase() === "ANTHROPIC_API_KEY" && !!value,
  );

/** Item types in Codex's JSON stream that stay inside the conversation. */
const CODEX_ALLOWED = new Set(["agent_message", "reasoning", "todo_list", "error"]);

const field = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? Reflect.get(value, key) : undefined;

/**
 * What a Codex event did outside the application's tools, or null. Only messages, reasoning, the
 * to-do list, errors and calls to the application's own MCP server (`server`) are allowed;
 * anything else (a command, a file change, a web search, another MCP server, a sub-agent) stops
 * the run.
 */
export function codexGuard(event: Record<string, unknown>, server: string): string | null {
  if (typeof event.type !== "string" || !event.type.startsWith("item.")) return null;
  const itemType = field(event.item, "type");
  const type = typeof itemType === "string" ? itemType : "desconhecido";
  if (CODEX_ALLOWED.has(type)) return null;
  const itemServer = field(event.item, "server");
  if (type === "mcp_tool_call" && itemServer === server) return null;
  return type === "mcp_tool_call" ? `mcp_tool_call:${String(itemServer ?? "")}` : type;
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
  /** Codex called a tool of the application's server: it did follow the request with its tools. */
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
 * Claude Code for one answer with no tools at all (not even the application's): a translation
 * or a quiz the editor checks itself. The prompt goes on standard input; the answer comes as one
 * JSON.
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
    ...CLAUDE_SETTING_SOURCES,
    ...modelArgs(options.model),
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
  const isObject = !!parsed && typeof parsed === "object";
  const result = isObject ? field(parsed, "result") : "";
  const failed = isObject ? field(parsed, "is_error") : true;
  if (failed === true || typeof result !== "string")
    throw new Error(`Claude Code: ${typeof result === "string" && result ? result : "falhou"}`);
  return result;
}

/** Codex for one answer: read-only, without the person's config, without any MCP server. */
export function codexOneShotArgs(options: {
  workspace: string;
  disabledFeatures?: readonly string[];
  personalOnly?: boolean;
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
    ...(options.personalOnly ? CODEX_PERSONAL : []),
    "-c",
    'web_search="disabled"',
    ...featureArgs(options.disabledFeatures),
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
