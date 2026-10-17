import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import { localMcpHeaders, redactMcpCredentials } from "@informach/edi-desktop/access";
import { EDITOR_GUIDE } from "../shared/aiTools.js";

export function locateClient(id) {
  if (!["claude", "codex"].includes(id)) throw new Error("Provedor inválido.");
  const npm = join(process.env.APPDATA || homedir(), "npm", "node_modules");
  const candidates =
    id === "claude"
      ? [join(homedir(), ".local", "bin", "claude.exe")]
      : [
          join(
            npm,
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
        ];
  for (const folder of (process.env.PATH || "").split(delimiter))
    candidates.push(join(folder, id + (process.platform === "win32" ? ".exe" : "")));
  return candidates.find((path) => existsSync(path)) || null;
}
export function engineArguments(provider, { url, prompt, model, headers = {} }) {
  if (provider === "claude")
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      JSON.stringify({ mcpServers: { edisvg: { type: "http", url, headers } } }),
      "--allowedTools",
      "mcp__edisvg",
      "--append-system-prompt",
      EDITOR_GUIDE,
      ...(model ? ["--model", model] : []),
    ];
  if (provider === "codex")
    return [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "-s",
      "read-only",
      "-c",
      `mcp_servers.edisvg.url=${JSON.stringify(url)}`,
      "-c",
      `mcp_servers.edisvg.http_headers={${Object.entries(headers)
        .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
        .join(",")}}`,
      ...(model ? ["--model", model] : []),
      "-",
    ];
  throw new Error("Provedor inválido.");
}
export function parseEngineEvent(provider, event) {
  if (provider === "claude") {
    if (event.type === "stream_event" && event.event?.delta?.type === "text_delta")
      return { type: "text", text: event.event.delta.text };
    if (event.type === "assistant") {
      const tool = event.message?.content?.find((c) => c.type === "tool_use");
      if (tool) return { type: "tool", text: tool.name };
    }
    if (event.type === "result" && event.is_error)
      return {
        type: "error",
        text: String(
          event.result || event.errors?.join("\n") || "Claude não concluiu a solicitação.",
        ),
      };
  } else {
    if (event.type === "item.completed" && event.item?.type === "agent_message")
      return { type: "text", text: event.item.text + "\n" };
    if (event.type === "item.started" && event.item?.type === "mcp_tool_call")
      return { type: "tool", text: event.item.tool };
    if (event.type === "error" || event.type === "turn.failed")
      return {
        type: "error",
        text: String(event.message || event.error?.message || "Codex não concluiu a solicitação."),
      };
  }
  return null;
}
export function createEngineRunner(workspace, url, emit) {
  let child = null,
    stopping = false;
  return {
    busy: () => !!child,
    stop() {
      if (!child) return;
      stopping = true;
      if (process.platform === "win32")
        execFile(
          "taskkill.exe",
          ["/pid", String(child.pid), "/T", "/F"],
          { windowsHide: true },
          () => {},
        );
      else child.kill("SIGTERM");
    },
    async send({ provider, prompt, model = "" }) {
      if (child) throw new Error("Aguarde ou interrompa a resposta atual.");
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 32000)
        throw new Error("Mensagem inválida ou longa demais.");
      if (typeof model !== "string" || !/^[\w.:-]{0,120}$/.test(model))
        throw new Error("Modelo inválido.");
      const binary = locateClient(provider);
      if (!binary)
        throw new Error(
          `${provider === "claude" ? "Claude Code" : "Codex"} não encontrado. Instale o cliente oficial e faça login pelo terminal.`,
        );
      await mkdir(workspace, { recursive: true });
      stopping = false;
      const args = engineArguments(provider, { url, prompt, model, headers: localMcpHeaders() });
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(binary, args, {
        cwd: workspace,
        windowsHide: true,
        shell: false,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const running = child;
      let stderr = "",
        failed = false;
      const timeout = setTimeout(() => {
        emit({ type: "error", text: "Tempo limite de 10 minutos atingido." });
        this.stop();
      }, 600000);
      const lines = createInterface({ input: running.stdout });
      lines.on("line", (line) => {
        if (line.length > 2000000) return;
        try {
          const event = parseEngineEvent(provider, JSON.parse(line));
          if (event) {
            if (event.type === "error") failed = true;
            emit(event);
          }
        } catch {}
      });
      running.stderr.on("data", (chunk) => {
        stderr = redactMcpCredentials(stderr + chunk.toString()).slice(-4000);
      });
      running.on("error", (error) => {
        failed = true;
        emit({ type: "error", text: `Falha ao iniciar: ${error.message}` });
      });
      running.stdin.on("error", () => {});
      running.stdin.end(`${EDITOR_GUIDE}\n\n${prompt}`);
      running.on("close", (code) => {
        clearTimeout(timeout);
        lines.close();
        if (code && !failed && !stopping)
          emit({
            type: "error",
            text:
              stderr.trim() ||
              `O cliente encerrou com código ${code}. Verifique o login no terminal.`,
          });
        if (child === running) child = null;
        emit({ type: "done", stopped: stopping });
      });
      return { started: true };
    },
  };
}
