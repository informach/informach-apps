import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import {
  claudeArgs,
  claudeMcpConfig,
  codexArgs,
  codexGuard,
  engineEnv,
  LaunchError,
  MCP_TOKEN_ENV,
  parseCmdShim,
  resolveLaunch,
} from "../src/main/engineArgs.ts";

const shims = join(import.meta.dirname, "fixtures", "npm-shims");
const root = await mkdtemp(join(tmpdir(), "ediaula-shims-"));
after(() => rm(root, { recursive: true }));

const runtime = async () => ({ command: "C:\\runtime\\node.exe", env: { RUNTIME: "1" } });

/** A copy of a fixture shim next to the file it points at, as npm installs them. */
async function installed(name: string, target?: string): Promise<string> {
  const dir = await mkdtemp(join(root, "npm-"));
  const shim = join(dir, name);
  await copyFile(join(shims, name), shim);
  if (target) {
    await mkdir(dirname(join(dir, target)), { recursive: true });
    await writeFile(join(dir, target), "");
  }
  return shim;
}

const hostile = [
  "corte & del /q C:\\*",
  "a | calc",
  "salva > C:\\Windows\\x.txt",
  "mostra %PATH% e %USERPROFILE%",
  "linha um\nlinha dois",
  "-x --dangerously-skip-permissions",
  '" & echo pwned & "',
];

test("the message never becomes an argument: it goes to standard input", () => {
  for (const prompt of hostile) {
    const argv = [
      ...claudeArgs({
        resume: "s1",
        model: "opus",
        effort: "high",
        mcpConfig: claudeMcpConfig("http://127.0.0.1:47321/mcp"),
        systemPrompt: "guia",
      }),
      ...codexArgs({ thread: "t1", url: "http://127.0.0.1:47321/mcp", workspace: "C:\\ws" }),
      ...codexArgs({ url: "http://127.0.0.1:47321/mcp", workspace: "C:\\ws" }),
    ];
    for (const arg of argv) {
      assert.ok(!arg.includes(prompt), `prompt in argv: ${arg}`);
      for (const line of prompt.split("\n")) assert.notEqual(arg, line);
    }
  }
  // Claude Code reads the message from stdin with -p and no positional prompt.
  const claude = claudeArgs({ mcpConfig: "{}", systemPrompt: "guia" });
  assert.equal(claude[0], "-p");
  assert.ok(!claude.includes("--dangerously-skip-permissions"));
  // Codex: "-" makes exec (and exec resume) read the instructions from stdin.
  assert.equal(codexArgs({ url: "u", workspace: "w" }).at(-1), "-");
  assert.deepEqual(codexArgs({ thread: "t1", url: "u", workspace: "w" }).slice(-3), [
    "resume",
    "t1",
    "-",
  ]);
});

test("the MCP token is only named in arguments, never written in them", () => {
  const config = JSON.parse(claudeMcpConfig("http://127.0.0.1:47321/mcp"));
  assert.equal(config.mcpServers.ediaula.headers.Authorization, `Bearer \${${MCP_TOKEN_ENV}}`);
  const codex = codexArgs({ url: "http://127.0.0.1:47321/mcp", workspace: "C:\\ws" });
  assert.ok(codex.includes(`mcp_servers.ediaula.bearer_token_env_var="${MCP_TOKEN_ENV}"`));
  assert.ok(!codex.some((arg) => /Bearer|http_headers/.test(arg)));
  // Codex leaves the person's config, shell, web search and other tools out.
  for (const flag of [
    "--ignore-user-config",
    'web_search="disabled"',
    "features.shell_tool=false",
    "read-only",
  ])
    assert.ok(codex.includes(flag), flag);
});

test("Codex gets only what it needs from the environment; the token goes by variable", () => {
  const source = {
    Path: "C:\\Windows",
    USERPROFILE: "C:\\Users\\ana",
    APPDATA: "C:\\Users\\ana\\AppData\\Roaming",
    CODEX_HOME: "C:\\Users\\ana\\.codex",
    SystemRoot: "C:\\Windows",
    ANTHROPIC_API_KEY: "sk-ant-secret",
    EDI_DESKTOP_CONFIG: "{}",
    ELECTRON_RUN_AS_NODE: "1",
    AWS_SECRET_ACCESS_KEY: "x",
  };
  const codex = engineEnv(source, { minimal: true, token: "tok", launch: { RUNTIME: "1" } });
  assert.deepEqual(Object.keys(codex).sort(), [
    "APPDATA",
    "CODEX_HOME",
    MCP_TOKEN_ENV,
    "Path",
    "RUNTIME",
    "SystemRoot",
    "USERPROFILE",
  ]);
  assert.equal(codex[MCP_TOKEN_ENV], "tok");
  const claude = engineEnv(source, { minimal: false, token: "tok" });
  assert.equal(claude.ANTHROPIC_API_KEY, "sk-ant-secret", "Claude Code keeps the person's own");
  assert.equal(claude.EDI_DESKTOP_CONFIG, undefined);
  assert.equal(claude.ELECTRON_RUN_AS_NODE, undefined);
});

test("npm shims are read to find what they run", async () => {
  const dir = "C:\\Users\\ana\\AppData\\Roaming\\npm";
  const codex = parseCmdShim(await readFile(join(shims, "codex.cmd"), "utf8"), dir);
  assert.deepEqual(codex, {
    target: join(dir, "node_modules\\@openai\\codex\\bin\\codex.js"),
    kind: "script",
    flags: [],
  });
  const claude = parseCmdShim(await readFile(join(shims, "claude.cmd"), "utf8"), dir);
  assert.equal(claude?.kind, "exe");
  assert.equal(
    claude?.target,
    join(dir, "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"),
  );
  const gemini = parseCmdShim(await readFile(join(shims, "gemini.cmd"), "utf8"), dir);
  assert.deepEqual(gemini?.flags, ["--no-warnings=DEP0040"]);
  assert.equal(parseCmdShim(await readFile(join(shims, "unknown.cmd"), "utf8"), dir), null);
  // A shim pointing outside its own folder is not followed.
  assert.equal(parseCmdShim('"%dp0%\\..\\..\\evil.js" %*', dir), null);
});

test("launches run executables directly and npm scripts on a runtime, never a shell", async () => {
  assert.deepEqual(await resolveLaunch("C:\\Tools\\codex.exe", runtime), {
    command: "C:\\Tools\\codex.exe",
    args: [],
    env: {},
  });
  const codex = await installed("codex.cmd", "node_modules\\@openai\\codex\\bin\\codex.js");
  const js = await resolveLaunch(codex, runtime);
  assert.equal(js.command, "C:\\runtime\\node.exe");
  assert.deepEqual(js.args, [join(dirname(codex), "node_modules\\@openai\\codex\\bin\\codex.js")]);
  assert.deepEqual(js.env, { RUNTIME: "1" });
  const claude = await installed(
    "claude.cmd",
    "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
  );
  const exe = await resolveLaunch(claude, runtime);
  assert.equal(
    exe.command,
    join(dirname(claude), "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"),
  );
  assert.deepEqual(exe.args, []);
});

test("a .cmd without a recognisable target, a missing target or another kind of file is refused", async () => {
  await assert.rejects(resolveLaunch(await installed("unknown.cmd"), runtime), LaunchError);
  await assert.rejects(resolveLaunch(await installed("codex.cmd"), runtime), LaunchError);
  await assert.rejects(resolveLaunch("C:\\Tools\\codex.ps1", runtime), LaunchError);
  await assert.rejects(resolveLaunch("C:\\Tools\\codex", runtime), LaunchError);
});

test("codexGuard stops a run that acts outside the editor's tools", () => {
  for (const type of ["command_execution", "file_change", "web_search"])
    for (const event of ["item.started", "item.updated", "item.completed"])
      assert.equal(codexGuard({ type: event, item: { id: "1", type } }), type);
  assert.equal(codexGuard({ type: "item.started", item: { type: "mcp_tool_call" } }), null);
  assert.equal(codexGuard({ type: "item.completed", item: { type: "agent_message" } }), null);
  assert.equal(codexGuard({ type: "item.completed", item: { type: "reasoning" } }), null);
  assert.equal(codexGuard({ type: "turn.completed", usage: {} }), null);
  assert.equal(codexGuard({ type: "thread.started", thread_id: "t" }), null);
});
