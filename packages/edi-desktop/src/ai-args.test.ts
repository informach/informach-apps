import { describe, expect, it } from "vitest";
import {
  CLAUDE_NO_CONNECTORS,
  claudeArgs,
  claudeBilledOnApi,
  claudeMcpConfig,
  claudeOneShotArgs,
  claudeOneShotResult,
  codexArgs,
  codexGuard,
  codexOneShotArgs,
  engineEnv,
  messageDelta,
  resumeGate,
  riskyCodexFeatures,
  selfCheckVerdict,
} from "./ai-args.ts";

const server = { name: "ediaula", tokenEnv: "EDIAULA_MCP_TOKEN" };
const url = "http://127.0.0.1:47321/mcp";

const hostile = [
  "corte & del /q C:\\*",
  "a | calc",
  "salva > C:\\Windows\\x.txt",
  "mostra %PATH% e %USERPROFILE%",
  "linha um\nlinha dois",
  "-x --dangerously-skip-permissions",
  '" & echo pwned & "',
];

describe("client arguments", () => {
  it("never carry the message: it goes to standard input", () => {
    for (const prompt of hostile) {
      const argv = [
        ...claudeArgs({
          server,
          resume: "s1",
          model: "opus",
          effort: "high",
          mcpConfig: claudeMcpConfig(url, server),
          systemPrompt: "guia",
        }),
        ...codexArgs({ server, thread: "t1", url, workspace: "C:\\ws" }),
        ...codexArgs({ server, url, workspace: "C:\\ws", model: "gpt-5", ephemeral: true }),
      ];
      for (const arg of argv) {
        expect(arg.includes(prompt), `prompt in argv: ${arg}`).toBe(false);
        for (const line of prompt.split("\n")) expect(arg).not.toBe(line);
      }
    }
    const claude = claudeArgs({ server, mcpConfig: "{}", systemPrompt: "guia" });
    expect(claude[0]).toBe("-p");
    expect(claude).not.toContain("--dangerously-skip-permissions");
    expect(claude[claude.indexOf("--allowedTools") + 1]).toBe("mcp__ediaula");
    // Codex: "-" makes exec (and exec resume) read the instructions from stdin.
    expect(codexArgs({ server, url: "u", workspace: "w" }).at(-1)).toBe("-");
    expect(codexArgs({ server, thread: "t1", url: "u", workspace: "w" }).slice(-3)).toEqual([
      "resume",
      "t1",
      "-",
    ]);
  });

  it("name the MCP token's variable and never write the token", () => {
    const config = JSON.parse(claudeMcpConfig(url, server));
    expect(config.mcpServers.ediaula.headers.Authorization).toBe(`Bearer \${EDIAULA_MCP_TOKEN}`);
    const foto = JSON.parse(
      claudeMcpConfig(url, { name: "edifoto", tokenEnv: "EDIFOTO_MCP_TOKEN" }),
    );
    expect(foto.mcpServers.edifoto.url).toBe(url);
    const codex = codexArgs({ server, url, workspace: "C:\\ws" });
    expect(codex).toContain('mcp_servers.ediaula.bearer_token_env_var="EDIAULA_MCP_TOKEN"');
    expect(codex.some((arg) => /Bearer|http_headers/.test(arg))).toBe(false);
    for (const flag of [
      "--ignore-user-config",
      'web_search="disabled"',
      "features.shell_tool=false",
      "read-only",
    ])
      expect(codex).toContain(flag);
  });

  it("keep Codex on the person's ChatGPT login when only the subscription is accepted", () => {
    const personal = codexArgs({ server, url, workspace: "w", personalOnly: true });
    expect(personal).toContain('forced_login_method="chatgpt"');
    expect(personal).toContain('model_provider="openai"');
    expect(codexArgs({ server, url, workspace: "w" })).not.toContain(
      'forced_login_method="chatgpt"',
    );
    expect(codexOneShotArgs({ workspace: "w", personalOnly: true })).toContain(
      'forced_login_method="chatgpt"',
    );
    // A session kept by the caller: Codex keeps none.
    expect(codexArgs({ server, url, workspace: "w", ephemeral: true })).toContain("--ephemeral");
  });

  it("turn off the features the installed Codex lists as risky, before resume", () => {
    const list = [
      "shell_tool                               stable             true",
      "multi_agent_v2                           stable             false",
      "js_repl                                  under development  false",
      "code_mode_host                           stable             true",
      "unified_exec                             stable             true",
      "secret_auth_storage                      stable             true",
      "sqlite                                   stable             true",
      "browser_use_external                     stable             true",
    ].join("\n");
    const off = riskyCodexFeatures(list);
    for (const name of [
      "shell_tool",
      "multi_agent_v2",
      "js_repl",
      "code_mode_host",
      "unified_exec",
      "browser_use_external",
    ])
      expect(off).toContain(name);
    expect(off, "login keeps working").not.toContain("secret_auth_storage");
    expect(off).not.toContain("sqlite");
    const resumed = codexArgs({
      server,
      thread: "t",
      url: "u",
      workspace: "w",
      disabledFeatures: off,
    });
    expect(resumed).toContain("features.js_repl=false");
    expect(resumed.indexOf("--ignore-user-config")).toBeLessThan(resumed.indexOf("resume"));
    expect(resumed.indexOf("read-only")).toBeLessThan(resumed.indexOf("resume"));
  });

  it("run one-shot answers with no tool at all", () => {
    const claude = claudeOneShotArgs({ model: "claude-opus-5-5", effort: "low" });
    expect(claude.slice(0, 5)).toEqual(["-p", "--input-format", "text", "--output-format", "json"]);
    expect(claude[claude.indexOf("--tools") + 1]).toBe("");
    expect(claude[claude.indexOf("--mcp-config") + 1]).toBe('{"mcpServers":{}}');
    expect(claudeOneShotArgs({ model: "default" })).not.toContain("--model");
    const codex = codexOneShotArgs({ workspace: "C:\\ws", disabledFeatures: ["shell_tool"] });
    expect(codex.at(-1)).toBe("-");
    expect(codex.some((a) => /mcp_servers/.test(a))).toBe(false);
    expect(codex).toContain("features.shell_tool=false");
  });

  it("read Claude Code's one-shot answer, and its failures", () => {
    expect(
      claudeOneShotResult(
        'aviso qualquer\n{"type":"result","is_error":false,"result":"{\\"cues\\":[]}"}\n',
      ),
    ).toBe('{"cues":[]}');
    expect(() =>
      claudeOneShotResult('{"type":"result","is_error":true,"result":"Not logged in"}'),
    ).toThrow(/Claude Code: Not logged in/);
    expect(() => claudeOneShotResult('{"type":"result"}')).toThrow(/falhou/);
    expect(() => claudeOneShotResult("")).toThrow(/não devolveu resposta/);
  });

  it("read only the person's own Claude Code settings", () => {
    for (const args of [
      claudeArgs({ server, mcpConfig: "{}", systemPrompt: "g" }),
      claudeOneShotArgs({}),
    ])
      expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
  });
});

describe("client environment", () => {
  const source = {
    Path: "C:\\Windows",
    USERPROFILE: "C:\\Users\\ana",
    APPDATA: "C:\\Users\\ana\\AppData\\Roaming",
    CODEX_HOME: "C:\\Users\\ana\\.codex",
    SystemRoot: "C:\\Windows",
    ANTHROPIC_API_KEY: "sk-ant-secret",
    openai_api_key: "sk-secret",
    EDI_DESKTOP_CONFIG: "{}",
    EDIFOTO_USER_DATA: "C:\\perfil",
    ELECTRON_RUN_AS_NODE: "1",
    NODE_OPTIONS: "--require x.js",
    AWS_SECRET_ACCESS_KEY: "x",
  };
  const token = { env: "EDIAULA_MCP_TOKEN", value: "tok" };

  it("gives Codex only what it needs and the token by variable", () => {
    const codex = engineEnv(source, { minimal: true, token, launch: { RUNTIME: "1" } });
    expect(Object.keys(codex).sort()).toEqual([
      "APPDATA",
      "CODEX_HOME",
      "EDIAULA_MCP_TOKEN",
      "Path",
      "RUNTIME",
      "SystemRoot",
      "USERPROFILE",
    ]);
    expect(codex.EDIAULA_MCP_TOKEN).toBe("tok");
  });

  it("keeps the person's variables for Claude Code, never the applications'", () => {
    const claude = engineEnv(source, { minimal: false, token });
    expect(claude.ANTHROPIC_API_KEY, "Claude Code keeps the person's own").toBe("sk-ant-secret");
    for (const name of [
      "EDI_DESKTOP_CONFIG",
      "EDIFOTO_USER_DATA",
      "ELECTRON_RUN_AS_NODE",
      "NODE_OPTIONS",
    ])
      expect(claude[name]).toBeUndefined();
  });

  it("leaves API keys and other providers out when only the subscription is accepted", () => {
    const personal = engineEnv(source, { minimal: false, personalOnly: true });
    expect(personal.ANTHROPIC_API_KEY).toBeUndefined();
    expect(personal.openai_api_key).toBeUndefined();
    expect(personal.USERPROFILE).toBe("C:\\Users\\ana");
    expect(claudeBilledOnApi(personal)).toBe(false);
  });

  it("turns off the claude.ai connectors and says when Claude Code bills the API", () => {
    const env = engineEnv(
      { PATH: "C:\\Windows", ENABLE_CLAUDEAI_MCP_SERVERS: "true" },
      { minimal: false, claude: true },
    );
    expect(env.ENABLE_CLAUDEAI_MCP_SERVERS).toBe("false");
    expect(CLAUDE_NO_CONNECTORS).toEqual({ ENABLE_CLAUDEAI_MCP_SERVERS: "false" });
    expect(engineEnv({ PATH: "x" }, { minimal: true }).ENABLE_CLAUDEAI_MCP_SERVERS).toBeUndefined();
    expect(claudeBilledOnApi({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe(true);
    expect(claudeBilledOnApi({ anthropic_api_key: "sk-ant-x" })).toBe(true);
    expect(claudeBilledOnApi({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(claudeBilledOnApi({ PATH: "x" })).toBe(false);
  });
});

describe("Codex's stream", () => {
  it("only lets through the conversation and the application's own server", () => {
    for (const type of ["command_execution", "file_change", "web_search", "collab_tool_call", "x"])
      for (const event of ["item.started", "item.updated", "item.completed"])
        expect(codexGuard({ type: event, item: { id: "1", type } }, "ediaula")).toBe(type);
    const call = (s?: string) => ({
      type: "item.started",
      item: { type: "mcp_tool_call", ...(s === undefined ? {} : { server: s }) },
    });
    expect(codexGuard(call("ediaula"), "ediaula")).toBeNull();
    expect(codexGuard(call("ediaula"), "edifoto")).toBe("mcp_tool_call:ediaula");
    expect(codexGuard(call("github"), "ediaula")).toBe("mcp_tool_call:github");
    expect(codexGuard(call(), "ediaula")).toBe("mcp_tool_call:");
    for (const type of ["todo_list", "error", "agent_message", "reasoning"])
      expect(codexGuard({ type: "item.completed", item: { type } }, "ediaula")).toBeNull();
    expect(codexGuard({ type: "turn.completed", usage: {} }, "ediaula")).toBeNull();
    expect(codexGuard({ type: "thread.started", thread_id: "t" }, "ediaula")).toBeNull();
  });

  it("streams only what is new of a message", () => {
    const shown = new Map<string, string>();
    expect(messageDelta(shown, "m1", "Olá")).toBe("Olá");
    expect(messageDelta(shown, "m1", "Olá, cortei")).toBe(", cortei");
    expect(messageDelta(shown, "m1", "Olá, cortei 3 trechos.")).toBe(" 3 trechos.");
    expect(messageDelta(shown, "m1", "Olá, cortei 3 trechos.")).toBe("");
    expect(messageDelta(shown, "m1", "Olá")).toBe("");
    expect(messageDelta(shown, "m1", "Oi!, cortei 3 trechos. Pronto")).toBe(" Pronto");
    expect(messageDelta(shown, "m2", "Outra")).toBe("Outra");
  });

  it("passes the self-check only with positive evidence", () => {
    const base = { violation: null, leaked: false, completed: true, editorTool: true };
    expect(selfCheckVerdict(base).ok).toBe(true);
    const lazy = selfCheckVerdict({ ...base, editorTool: false });
    expect([lazy.ok, lazy.conclusive]).toEqual([false, false]);
    const unfinished = selfCheckVerdict({ ...base, completed: false });
    expect([unfinished.ok, unfinished.conclusive]).toEqual([false, false]);
    const shell = selfCheckVerdict({ ...base, violation: "command_execution" });
    expect([shell.ok, shell.conclusive]).toEqual([false, true]);
    const read = selfCheckVerdict({ ...base, leaked: true });
    expect([read.ok, read.conclusive]).toEqual([false, true]);
  });
});

describe("resumeGate", () => {
  type E = { type: string; n?: number };
  it("drops what a gone session said and holds the rest until the engine answers", () => {
    const out: E[] = [];
    const lost = resumeGate<E>((e) => out.push(e));
    lost.emit({ type: "error", n: 1 });
    lost.emit({ type: "done" });
    expect(lost.went()).toBe(false);
    expect(out).toEqual([]);
    const live = resumeGate<E>((e) => out.push(e));
    live.emit({ type: "quota", n: 1 });
    live.emit({ type: "text", n: 2 });
    live.emit({ type: "done" });
    expect(live.went()).toBe(true);
    expect(out.map((e) => e.type)).toEqual(["quota", "text", "done"]);
  });
});
