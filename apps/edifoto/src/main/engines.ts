import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { localMcpHeaders } from "@informach/edi-desktop/access";
import { app } from "electron";
import { AI_TOOLS, type AiToolName, EDITOR_GUIDE } from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import { locateClient, MCP_NAME, mcpUrl, requirePersonalLogin } from "./aiSettings.ts";

import { clientCommand, personalClientEnvironment } from "./clientProcess.ts";

/**
 * In-app chat through the user's own Claude Code or Codex install, signed in with their own
 * subscription. EdiFoto never sees or stores their credentials: it runs the official, unmodified
 * binaries headless and only exposes its editing tools to them over the local MCP server.
 */

type Emit = (e: AssistantEvent) => void;

const PANEL_PROMPT = `You are the assistant in EdiFoto's side panel. The user sees the editor next to this chat and watches your edits happen live. Use the edifoto tools to inspect and change the open image; don't ask the user to do things you can do with a tool. Keep answers short, in Brazilian Portuguese: what you did and what changed.`;

const sessions = new Map<string, string>();
const running = new Map<string, ChildProcess>();
const stopped = new WeakSet<ChildProcess>();

/** Empty working folder: no project files, no CLAUDE.md, nothing for the agent to read. */
function workspace(): string {
  const dir = join(app.getPath("userData"), "ai-workspace");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const shortText = (t: string): string => {
  const line = t.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
};

const toolTitle = (name: string): string => {
  const bare = name.replace(/^mcp__edifoto__/, "").replace(/^edifoto[./]/, "") as AiToolName;
  return AI_TOOLS[bare]?.title ?? bare;
};

const resultText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c) =>
        typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "",
      )
      .join("\n");
  return "";
};

export function stopEngineRun(conversationId: string): boolean {
  const child = running.get(conversationId);
  if (child) stopped.add(child);
  if (child?.pid && process.platform === "win32")
    execFile(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (error && running.get(conversationId) === child) child.kill();
      },
    );
  else child?.kill();
  return !!child;
}

export function resetEngineSession(conversationId: string): void {
  stopEngineRun(conversationId);
  sessions.delete(conversationId);
}

function track(
  conversationId: string,
  child: ChildProcess,
  emit: Emit,
  onLine: (json: Record<string, unknown>) => void,
  onExit: (code: number | null, stderr: string) => void,
): Promise<void> {
  running.set(conversationId, child);
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-6000);
  });
  const rl = createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    if (stopped.has(child)) return;
    if (!line.startsWith("{")) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    try {
      onLine(parsed);
    } catch (error) {
      emit({
        type: "error",
        message: `Resposta inesperada do cliente: ${error instanceof Error ? error.message : String(error)}`,
      });
      stopEngineRun(conversationId);
    }
  });
  return new Promise((resolve) => {
    child.on("error", (err) =>
      emit({ type: "error", message: `Não foi possível iniciar: ${err.message}` }),
    );
    child.on("close", (code) => {
      if (running.get(conversationId) === child) running.delete(conversationId);
      if (!stopped.has(child)) onExit(code, stderr);
      emit({ type: "done" });
      resolve();
    });
  });
}

/* ----- Claude Code ----- */

export async function runClaudeCode(
  conversationId: string,
  text: string,
  port: number,
  model: string | undefined,
  emit: Emit,
  runId: string,
  check: () => void,
): Promise<void> {
  const bin = await locateClient("claude-code");
  check();
  if (!bin) {
    emit({
      type: "error",
      message:
        "Claude Code não encontrado. Instale em claude.com/code e faça login com a sua conta.",
    });
    emit({ type: "done" });
    return;
  }
  await requirePersonalLogin("claude-code", bin);
  check();
  const mcp = JSON.stringify({
    mcpServers: {
      [MCP_NAME]: {
        type: "http",
        url: mcpUrl(port),
        headers: { ...localMcpHeaders(), "X-Edi-Run": runId },
      },
    },
  });
  const resume = sessions.get(conversationId);
  const args = [
    "-p",
    text,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // No built-in tools at all (files, terminal, web): only EdiFoto's editing tools.
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    mcp,
    "--allowedTools",
    `mcp__${MCP_NAME}`,
    "--append-system-prompt",
    `${EDITOR_GUIDE}\n\n${PANEL_PROMPT}`,
    ...(resume ? ["--resume", resume] : []),
    ...(model && model !== "default" ? ["--model", model] : []),
  ];
  check();
  const invocation = clientCommand(bin, args);
  const child = spawn(invocation.command, invocation.args, {
    env: personalClientEnvironment(),
    cwd: workspace(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let failed = false;
  await track(
    conversationId,
    child,
    emit,
    (ev) => {
      switch (ev.type) {
        case "system":
          if (ev.subtype === "init") {
            if (typeof ev.session_id === "string") sessions.set(conversationId, ev.session_id);
            const servers =
              (ev.mcp_servers as { name: string; status: string }[] | undefined) ?? [];
            if (servers.some((s) => s.name === MCP_NAME && s.status !== "connected"))
              emit({
                type: "error",
                message:
                  "O Claude Code não conseguiu falar com o EdiFoto. Confira se a conexão está ligada em Configurações › Inteligência artificial.",
              });
          }
          break;
        case "stream_event": {
          const e = ev.event as { type: string; delta?: { type: string; text?: string } };
          if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text)
            emit({ type: "text", delta: e.delta.text });
          break;
        }
        case "assistant": {
          const content =
            (ev.message as { content?: { type: string; id?: string; name?: string }[] })?.content ??
            [];
          for (const b of content)
            if (b.type === "tool_use" && b.id && b.name)
              emit({
                type: "tool",
                id: b.id,
                name: b.name,
                title: toolTitle(b.name),
                status: "running",
              });
          break;
        }
        case "user": {
          const content =
            (
              ev.message as {
                content?: {
                  type: string;
                  tool_use_id?: string;
                  content?: unknown;
                  is_error?: boolean;
                }[];
              }
            )?.content ?? [];
          for (const b of content)
            if (b.type === "tool_result" && b.tool_use_id)
              emit({
                type: "tool",
                id: b.tool_use_id,
                name: "",
                title: "",
                status: b.is_error ? "error" : "done",
                summary: shortText(resultText(b.content)),
              });
          break;
        }
        case "rate_limit_event": {
          const info = ev.rate_limit_info as
            | { status?: string; resetsAt?: number; rateLimitType?: string }
            | undefined;
          if (info) {
            const resets = info.resetsAt
              ? new Date(info.resetsAt * 1000).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            const level =
              info.status === "allowed"
                ? "ok"
                : info.status === "allowed_warning"
                  ? "warn"
                  : "blocked";
            emit({
              type: "quota",
              level,
              text:
                level === "ok"
                  ? "Assinatura do Claude: dentro do limite"
                  : level === "warn"
                    ? `Perto do limite da assinatura (renova às ${resets})`
                    : `Limite da assinatura atingido até ${resets}`,
            });
          }
          break;
        }
        case "result":
          if (typeof ev.session_id === "string") sessions.set(conversationId, ev.session_id);
          if (ev.is_error) {
            failed = true;
            const msg = String(ev.result ?? ev.subtype ?? "");
            emit({
              type: "error",
              message: /login|api key|auth/i.test(msg)
                ? 'O Claude Code não está logado. Abra um terminal, rode "claude" e entre com a sua conta.'
                : `Claude Code: ${msg || "falhou"}`,
            });
          }
          break;
      }
    },
    (code, stderr) => {
      if (code && !failed && code !== null)
        emit({ type: "error", message: `Claude Code encerrou com erro.\n${shortText(stderr)}` });
    },
  );
}

/* ----- Codex ----- */

export async function runCodex(
  conversationId: string,
  text: string,
  port: number,
  emit: Emit,
  runId: string,
  check: () => void,
): Promise<void> {
  const bin = await locateClient("codex");
  check();
  if (!bin) {
    emit({
      type: "error",
      message:
        'Codex não encontrado. Instale com "npm install -g @openai/codex" e faça login com a sua conta do ChatGPT.',
    });
    emit({ type: "done" });
    return;
  }
  await requirePersonalLogin("codex", bin);
  check();
  const thread = sessions.get(conversationId);
  const common = [
    "-c",
    'forced_login_method="chatgpt"',
    "-c",
    'model_provider="openai"',
    "--json",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    workspace(),
    "-c",
    `mcp_servers.${MCP_NAME}.url="${mcpUrl(port)}"`,
    "-c",
    `mcp_servers.${MCP_NAME}.http_headers={Authorization=${JSON.stringify(localMcpHeaders().Authorization)},"X-Edi-Run"=${JSON.stringify(runId)}}`,
  ];
  // Codex has no separate system prompt in exec mode: the guide goes with the first message.
  const prompt = thread ? text : `${EDITOR_GUIDE}\n\n${PANEL_PROMPT}\n\n---\n\n${text}`;
  const args = thread ? ["exec", ...common, "resume", thread, prompt] : ["exec", ...common, prompt];
  check();
  const invocation = clientCommand(bin, args);
  const child = spawn(invocation.command, invocation.args, {
    env: personalClientEnvironment(),
    cwd: workspace(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let failed = false;
  await track(
    conversationId,
    child,
    emit,
    (ev) => {
      const item = ev.item as
        | {
            id?: string;
            type?: string;
            text?: string;
            tool?: string;
            server?: string;
            status?: string;
            result?: unknown;
            error?: { message?: string };
          }
        | undefined;
      switch (ev.type) {
        case "thread.started":
          if (typeof ev.thread_id === "string") sessions.set(conversationId, ev.thread_id);
          break;
        case "item.started":
          if (item?.type === "mcp_tool_call" && item.id)
            emit({
              type: "tool",
              id: item.id,
              name: item.tool ?? "",
              title: toolTitle(item.tool ?? ""),
              status: "running",
            });
          break;
        case "item.completed":
          if (item?.type === "agent_message" && item.text)
            emit({ type: "text", delta: `${item.text}\n\n` });
          else if (item?.type === "mcp_tool_call" && item.id)
            emit({
              type: "tool",
              id: item.id,
              name: item.tool ?? "",
              title: toolTitle(item.tool ?? ""),
              status: item.status === "failed" || item.error ? "error" : "done",
              summary: shortText(
                item.error?.message ??
                  resultText((item.result as { content?: unknown })?.content ?? item.result),
              ),
            });
          break;
        case "turn.failed":
        case "error": {
          failed = true;
          const raw = String((ev.error as { message?: string })?.message ?? ev.message ?? "");
          emit({
            type: "error",
            message: /newer version of Codex/i.test(raw)
              ? "O Codex instalado está desatualizado para o modelo da sua conta. Atualize com: npm install -g @openai/codex"
              : /login|auth|401/i.test(raw)
                ? 'O Codex não está logado. Abra um terminal, rode "codex login" e entre com a sua conta do ChatGPT.'
                : /usage limit|rate limit|429/i.test(raw)
                  ? "Limite da assinatura do ChatGPT atingido. Tente mais tarde."
                  : `Codex: ${shortText(raw.replace(/^\{.*"message\\?":\\?"/, ""))}`,
          });
          break;
        }
      }
    },
    (code, stderr) => {
      if (code && !failed)
        emit({ type: "error", message: `Codex encerrou com erro.\n${shortText(stderr)}` });
    },
  );
}
