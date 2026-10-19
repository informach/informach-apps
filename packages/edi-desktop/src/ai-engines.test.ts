import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { configureDesktopAccess } from "./access.ts";
import { createAssistantEngines, type EngineKind, type SessionStore } from "./ai-engines.ts";
import { PANEL_CLIENT } from "./ai-grants.ts";
import type { EngineEvent } from "./ai-run.ts";
import { startLocalMcpServer } from "./mcp-server.ts";

/**
 * The panel's turns against a stand-in client installed as npm installs the real ones, in an
 * isolated profile (USERPROFILE, APPDATA and PATH point to a temporary folder): the person's
 * real clients, configurations and subscriptions are never used.
 */
const notWindows = process.platform !== "win32";
const fake = join(import.meta.dirname, "..", "fixtures", "ai", "fake-client", "client.cjs");
const server = { name: "editeste", tokenEnv: "EDITESTE_MCP_TOKEN" };
const saved = { ...process.env };
let root = "";
let mcp: Server;
let url = "";
const calls: { client: string; project?: string }[] = [];

async function installClient(npm: string, shim: string, script: string): Promise<void> {
  await mkdir(join(npm, ...script.split("\\").slice(0, -1)), { recursive: true });
  await copyFile(fake, join(npm, script));
  await writeFile(join(npm, shim), `@ECHO off\r\n"%_prog%"  "%dp0%\\${script}" %*\r\n`);
}

beforeAll(async () => {
  if (notWindows) return;
  root = await mkdtemp(join(tmpdir(), "edi-ai-engines-"));
  const appData = join(root, "AppData", "Roaming");
  const npm = join(appData, "npm");
  await installClient(npm, "claude.cmd", "node_modules\\@anthropic-ai\\claude-code\\cli.js");
  await installClient(npm, "codex.cmd", "node_modules\\@openai\\codex\\bin\\codex.js");
  const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  Object.assign(process.env, {
    USERPROFILE: root,
    APPDATA: appData,
    PATH: system32,
    Path: system32,
    ANTHROPIC_API_KEY: "sk-ant-teste",
  });
  configureDesktopAccess({ assertAccess: () => {} });
  mcp = await startLocalMcpServer({
    port: 0,
    name: server.name,
    version: "1.0.0",
    instructions: "",
    tools: { read_doc: { title: "Ler documento", description: "Lê.", input: z.object({}) } },
    call: async (grant) => {
      calls.push({ client: grant.client, project: grant.projectId });
      return { ok: true, text: "documento lido" };
    },
  });
  url = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  if (notWindows) return;
  for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
  Object.assign(process.env, saved);
  mcp.closeAllConnections();
  await new Promise((resolve) => mcp.close(resolve));
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  calls.length = 0;
});

const reportSchema = z.object({
  prompt: z.string(),
  marker: z.boolean(),
  token: z.string().nullable(),
  apiKey: z.boolean(),
  resume: z.string().nullable(),
  personal: z.boolean(),
  tool: z.string().nullable(),
});

function turn() {
  const events: EngineEvent[] = [];
  return {
    events,
    emit: (e: EngineEvent) => events.push(e),
    report: () =>
      reportSchema.parse(
        JSON.parse(
          events
            .filter((e) => e.type === "text")
            .map((e) => e.delta)
            .join("")
            .trim(),
        ),
      ),
    done: () => events.filter((e) => e.type === "done").length,
  };
}

const engines = (options: { sessions?: SessionStore | false; personalOnly?: boolean } = {}) =>
  createAssistantEngines({
    appName: "EdiTeste",
    server,
    systemPrompt: "Guia do editor.",
    workspace: () => root,
    toolTitle: (name) => (name === "read_doc" ? "Ler documento" : name),
    launchOptions: () => ({ allowElectronRuntime: true }),
    recap: async (_id, text) => `RESUMO\n\n${text}`,
    warn: () => {},
    ...options,
  });

const tokenWorks = async (token: string | null): Promise<boolean> =>
  (
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    })
  ).status !== 403;

describe.skipIf(notWindows)("the panel's turns", () => {
  it("runs Claude Code with the message on stdin and a token that lives only for the run", async () => {
    const ai = engines();
    const t = turn();
    await ai.runClaudeCode({ conversationId: "c1", text: "MARCA & CHAME", url, emit: t.emit });
    const report = t.report();
    expect(report.marker, "the message never goes into the arguments").toBe(false);
    expect(report.prompt).toBe("RESUMO\n\nMARCA & CHAME");
    expect(report.tool).toBe("documento lido");
    expect(calls).toEqual([{ client: PANEL_CLIENT, project: "c1" }]);
    expect(t.events).toContainEqual({
      type: "tool",
      id: "t1",
      name: "mcp__editeste__read_doc",
      title: "Ler documento",
      status: "running",
    });
    // ANTHROPIC_API_KEY is the person's: kept, and the panel is told the turn is billed on it.
    expect(report.apiKey).toBe(true);
    expect(t.events.some((e) => e.type === "quota" && e.level === "warn")).toBe(true);
    expect(t.done()).toBe(1);
    expect(await tokenWorks(report.token), "revoked when the run ended").toBe(false);

    const next = turn();
    await ai.runClaudeCode({ conversationId: "c1", text: "de novo", url, emit: next.emit });
    expect(next.report()).toMatchObject({ resume: "sessao-1", prompt: "de novo" });
  });

  it("starts over, with the recap, when a kept session is gone on the client's side", async () => {
    const kept = new Map<string, string | undefined>([["claude:c2", "sessao-perdida"]]);
    const store: SessionStore = {
      load: async (engine: EngineKind, id) => kept.get(`${engine}:${id}`),
      save: async (engine, id, session) => {
        kept.set(`${engine}:${id}`, session);
      },
    };
    const t = turn();
    await engines({ sessions: store }).runClaudeCode({
      conversationId: "c2",
      text: "oi",
      url,
      emit: t.emit,
    });
    expect(
      t.events.some((e) => e.type === "error"),
      "the lost session's error is dropped",
    ).toBe(false);
    expect(t.report()).toMatchObject({ resume: null, prompt: "RESUMO\n\noi" });
    expect(kept.get("claude:c2"), "the new session is kept").toBe("sessao-1");
    expect(t.done()).toBe(1);
  });

  it("a Stop during the preparation ends the turn before any client starts", async () => {
    const ai = engines();
    const t = turn();
    const running = ai.runClaudeCode({ conversationId: "c8", text: "CHAME", url, emit: t.emit });
    ai.stop("c8");
    await running;
    expect(
      t.events.some((e) => e.type === "text"),
      "no client answered",
    ).toBe(false);
    expect(calls).toEqual([]);
    expect(t.done()).toBe(1);
  });

  it("a Stop while resuming keeps the session and starts no new turn in its place", async () => {
    const kept = new Map<string, string | undefined>([["claude:c9", "sessao-perdida"]]);
    let ai: ReturnType<typeof engines>;
    const store: SessionStore = {
      // The person clicks Stop right as the kept session is being resumed.
      load: async (engine: EngineKind, id) => {
        ai.stop(id);
        return kept.get(`${engine}:${id}`);
      },
      save: async (engine, id, session) => {
        kept.set(`${engine}:${id}`, session);
      },
    };
    ai = engines({ sessions: store });
    const t = turn();
    await ai.runClaudeCode({ conversationId: "c9", text: "CHAME", url, emit: t.emit });
    expect(
      t.events.some((e) => e.type === "text"),
      "no retry with the recap",
    ).toBe(false);
    expect(kept.get("claude:c9"), "the session is not forgotten").toBe("sessao-perdida");
    expect(t.done()).toBe(1);
  });

  it("stops Codex the moment it acts outside the editor", async () => {
    const t = turn();
    await engines().runCodex({ conversationId: "c3", text: "SHELL", url, emit: t.emit });
    const error = t.events.find((e) => e.type === "error");
    expect(error?.type === "error" && error.message).toMatch(
      /O Codex tentou rodar um comando no computador e foi interrompido: no EdiTeste/,
    );
    expect(t.done()).toBe(1);
  });

  it("runs Codex with the guide in its first message and the editor's tools", async () => {
    const ai = engines({ sessions: false });
    const t = turn();
    await ai.runCodex({
      conversationId: "c4",
      text: "MARCA CHAME",
      url,
      emit: t.emit,
      grantProject: "doc-7",
    });
    const report = t.report();
    expect(report.prompt).toBe("Guia do editor.\n\n---\n\nRESUMO\n\nMARCA CHAME");
    expect(report.marker).toBe(false);
    expect(report.apiKey, "Codex gets only what it needs").toBe(false);
    expect(calls).toEqual([{ client: PANEL_CLIENT, project: "doc-7" }]);
    expect(t.events).toContainEqual({ type: "usage", tokens: 7 });
    // Without kept sessions, the next turn starts a new thread.
    const next = turn();
    await ai.runCodex({ conversationId: "c4", text: "de novo", url, emit: next.emit });
    expect(next.report().resume).toBeNull();
  });

  it("accepts only the person's subscription when the application asks for it", async () => {
    const personal = engines({ personalOnly: true });
    const ok = turn();
    await personal.runClaudeCode({ conversationId: "c5", text: "oi", url, emit: ok.emit });
    expect(ok.report().apiKey, "the API key is left out").toBe(false);
    expect(ok.events.some((e) => e.type === "quota")).toBe(false);
    const codex = turn();
    await personal.runCodex({ conversationId: "c6", text: "oi", url, emit: codex.emit });
    expect(codex.report().personal).toBe(true);

    process.env.FAKE_AUTH = "api_key";
    try {
      const refused = turn();
      await personal.runClaudeCode({ conversationId: "c7", text: "oi", url, emit: refused.emit });
      expect(refused.events).toEqual([
        {
          type: "error",
          message:
            "Faça login no Claude Code com sua conta Claude. Este assistente usa somente assinatura pessoal.",
        },
        { type: "done" },
      ]);
    } finally {
      delete process.env.FAKE_AUTH;
    }
  });

  it("answers one-shot requests without any tool", async () => {
    const ai = engines();
    await expect(
      ai.oneShot({ engine: "codex", prompt: "SHELL", signal: new AbortController().signal }),
    ).rejects.toThrow("O Codex tentou agir fora do editor e foi interrompido.");
    const answer = await ai.oneShot({
      engine: "codex",
      prompt: "traduza",
      signal: new AbortController().signal,
    });
    expect(reportSchema.parse(JSON.parse(answer))).toMatchObject({
      prompt: "traduza",
      token: null,
    });
  });
});
