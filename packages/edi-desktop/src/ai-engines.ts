import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type McpScope, mintRunToken, redactMcpCredentials } from "./access.ts";
import {
  actionName,
  CODEX_DISABLED_FEATURES,
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
  type SelfCheckEvidence,
  selfCheckVerdict,
} from "./ai-args.ts";
import { CHECK_CLIENT, type McpServerRef, PANEL_CLIENT } from "./ai-grants.ts";
import {
  AI_CLIENT_NAMES,
  type AiClientId,
  clientLaunch,
  clientVersion,
  type Launch,
  type LaunchOptions,
  locateClient,
  requirePersonalLogin,
} from "./ai-launch.ts";
import { type EngineEvent, endChild, runToText, startRun, stopAllRuns, stopRun } from "./ai-run.ts";

/**
 * The in-app chat through the person's own Claude Code or Codex, signed in with their own
 * subscription. The application never sees or stores their credentials: it runs the official,
 * unmodified programs headless and only exposes its editing tools to them over its local MCP
 * server, with a token that exists only for the run.
 */

export type EngineKind = "claude" | "codex";

/** Where the Claude Code session and the Codex thread of each conversation are kept. */
export interface SessionStore {
  load(engine: EngineKind, conversationId: string): Promise<string | undefined>;
  save(engine: EngineKind, conversationId: string, session: string | undefined): Promise<void>;
}

export interface AssistantEnginesConfig {
  /** Name shown to the person, e.g. "EdiAula". */
  appName: string;
  server: McpServerRef;
  /** The editor's guide and the panel's instructions (Claude's system prompt; Codex's first message). */
  systemPrompt: string;
  /** Empty working folder: no project files, no CLAUDE.md, nothing for the agent to read. */
  workspace(): string;
  /** Title of a tool for the panel, from its bare name. */
  toolTitle(name: string): string;
  launchOptions?(): LaunchOptions;
  /**
   * Sessions kept beyond this process (EdiAula keeps them per lesson). `false`: every turn starts
   * a new session (the caller sends the history in the message).
   */
  sessions?: SessionStore | false;
  /** The first message of a conversation the engine does not remember: with a recap. */
  recap?(conversationId: string, text: string): Promise<string>;
  /** Only the person's subscription: no API keys, and a signed-in check before each turn. */
  personalOnly?: boolean;
  /** Scopes of the run's token (default: read, propose and write). */
  scopes?: readonly McpScope[];
  /** Ends a turn after this long (no limit by default: the token is renewed while it runs). */
  timeoutMs?: number;
  /** Where a problem with the kept sessions is told (no personal data). */
  warn?(event: string, detail: string): void;
}

export interface TurnRequest {
  conversationId: string;
  text: string;
  /** The application's MCP endpoint. */
  url: string;
  emit(e: EngineEvent): void;
  model?: string;
  /** Claude Code's effort. */
  effort?: string;
  /** Project the run's token is tied to (default: the conversation). */
  grantProject?: string;
  /** Called between the steps before the program starts; throws to give up (a stopped request). */
  check?(): void;
}

/** A run's token lasts this long, renewed while the run goes on, and is revoked when it ends. */
const RUN_TTL_MS = 30 * 60_000;
const RUN_RENEW_MS = 10 * 60_000;
const ONE_SHOT_MS = 10 * 60_000;
const DEFAULT_SCOPES: readonly McpScope[] = ["read", "propose", "write"];

const shortText = (t: string): string => {
  const line = t.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
};

const resultText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c: unknown) => {
        const text = c && typeof c === "object" ? Reflect.get(c, "text") : undefined;
        return text === undefined ? "" : String(text);
      })
      .join("\n");
  return "";
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const NOT_FOUND: Record<AiClientId, string> = {
  "claude-code":
    "Claude Code não encontrado. Instale em claude.com/code e faça login com a sua conta.",
  codex:
    'Codex não encontrado. Instale com "npm install -g @openai/codex" e faça login com a sua conta do ChatGPT.',
};

interface ClaudeContent {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  tool?: string;
  server?: string;
  status?: string;
  result?: unknown;
  error?: { message?: string };
}

const contentOf = (message: unknown): ClaudeContent[] => {
  const content = message && typeof message === "object" ? Reflect.get(message, "content") : [];
  return Array.isArray(content) ? content : [];
};

export function createAssistantEngines(config: AssistantEnginesConfig) {
  const server = config.server;
  const sessions = new Map<string, string>();
  const featureCache = new Map<string, string[]>();
  const options = (): LaunchOptions => ({
    ...config.launchOptions?.(),
    personalOnly: config.personalOnly,
  });
  const warn = (event: string, err: unknown): void =>
    (config.warn ?? ((e, d) => console.warn(`[edi] ${e}`, d)))(event, errorText(err));
  const key = (engine: EngineKind, conversationId: string): string => `${engine}:${conversationId}`;
  const toolTitle = (name: string): string => {
    const prefix = `mcp__${server.name}__`;
    const bare = name.startsWith(prefix)
      ? name.slice(prefix.length)
      : name.replace(new RegExp(`^${server.name}[./]`), "");
    return config.toolTitle(bare);
  };

  /** The engine's session of the conversation: in memory, or kept from an earlier run. */
  async function sessionOf(engine: EngineKind, conversationId: string) {
    if (config.sessions === false) return undefined;
    const known = sessions.get(key(engine, conversationId));
    if (known || !config.sessions) return known;
    let kept: string | undefined;
    try {
      kept = await config.sessions.load(engine, conversationId);
    } catch (err) {
      // Without it the conversation goes on in a new session, with the recap of the panel.
      warn("engine_session_unreadable", err);
    }
    if (kept) sessions.set(key(engine, conversationId), kept);
    return kept;
  }

  /** Forgets a session the engine no longer has, here and where it was kept. */
  async function forgetSession(engine: EngineKind, conversationId: string): Promise<void> {
    sessions.delete(key(engine, conversationId));
    if (!config.sessions) return;
    try {
      await config.sessions.save(engine, conversationId, undefined);
    } catch (err) {
      warn("engine_session_not_forgotten", err);
    }
  }

  function keepSession(engine: EngineKind, conversationId: string, id: string): void {
    if (config.sessions === false) return;
    if (sessions.get(key(engine, conversationId)) === id) return;
    sessions.set(key(engine, conversationId), id);
    config.sessions
      ?.save(engine, conversationId, id)
      .catch((err: unknown) => warn("engine_session_not_kept", err));
  }

  const firstMessage = (conversationId: string, text: string): Promise<string> =>
    config.recap ? config.recap(conversationId, text) : Promise.resolve(text);

  /** The client ready to start, or null after telling the person why not (and ending the turn). */
  async function prepare(id: AiClientId, request: TurnRequest): Promise<{ launch: Launch } | null> {
    const fail = (message: string): null => {
      request.emit({ type: "error", message });
      request.emit({ type: "done" });
      return null;
    };
    const bin = await locateClient(id);
    request.check?.();
    if (!bin) return fail(NOT_FOUND[id]);
    let launch: Launch;
    try {
      launch = await clientLaunch(bin, options());
      if (config.personalOnly) await requirePersonalLogin(id, bin, options());
    } catch (err) {
      request.check?.();
      return fail(errorText(err));
    }
    request.check?.();
    return { launch };
  }

  /**
   * A token only this run can use, for the project the chat belongs to. It is renewed while the
   * run goes on (a long transcription) and `end` revokes it.
   */
  function runToken(project: string): { value: string; end: () => void } {
    const run = mintRunToken({
      scopes: config.scopes ?? DEFAULT_SCOPES,
      ttlMs: RUN_TTL_MS,
      projectId: project,
      client: PANEL_CLIENT,
    });
    const renew = setInterval(() => run.extend(RUN_TTL_MS), RUN_RENEW_MS);
    return {
      value: run.token,
      end: () => {
        clearInterval(renew);
        run.revoke();
      },
    };
  }

  /* ----- Claude Code ----- */

  async function runClaudeCode(request: TurnRequest): Promise<void> {
    const ready = await prepare("claude-code", request);
    if (!ready) return;
    const kept = await sessionOf("claude", request.conversationId);
    if (kept) {
      const gate = resumeGate(request.emit);
      await claudeAttempt({ ...request, emit: gate.emit }, ready.launch, kept);
      if (gate.went()) return;
      // The session is gone on Claude Code's side: start over with the recap of the panel.
      await forgetSession("claude", request.conversationId);
    }
    await claudeAttempt(request, ready.launch, undefined);
  }

  async function claudeAttempt(
    request: TurnRequest,
    launch: Launch,
    resume: string | undefined,
  ): Promise<void> {
    const { conversationId, emit } = request;
    const prompt = resume ? request.text : await firstMessage(conversationId, request.text);
    const token = runToken(request.grantProject ?? conversationId);
    const args = claudeArgs({
      server,
      resume,
      model: request.model,
      effort: request.effort,
      mcpConfig: claudeMcpConfig(request.url, server),
      systemPrompt: config.systemPrompt,
    });
    let failed = false;
    const env = engineEnv(process.env, {
      minimal: false,
      token: { env: server.tokenEnv, value: token.value },
      launch: launch.env,
      claude: true,
      personalOnly: config.personalOnly,
    });
    // With ANTHROPIC_API_KEY set, the turn is charged on the API, not on the subscription.
    const onApi = claudeBilledOnApi(env);
    await startRun({
      conversationId,
      launch,
      args,
      env,
      cwd: config.workspace(),
      prompt,
      emit,
      cleanup: token.end,
      redact: redactMcpCredentials,
      timeoutMs: config.timeoutMs,
      onLine: (ev) => {
        switch (ev.type) {
          case "system":
            if (ev.subtype === "init") {
              if (typeof ev.session_id === "string")
                keepSession("claude", conversationId, ev.session_id);
              if (onApi)
                emit({
                  type: "quota",
                  level: "warn",
                  text: "Cobrado na API da Anthropic: o Claude Code usa a chave ANTHROPIC_API_KEY deste computador, não a assinatura",
                });
              const servers = Array.isArray(ev.mcp_servers) ? ev.mcp_servers : [];
              if (
                servers.some(
                  (s: unknown) =>
                    !!s &&
                    typeof s === "object" &&
                    Reflect.get(s, "name") === server.name &&
                    Reflect.get(s, "status") !== "connected",
                )
              )
                emit({
                  type: "error",
                  message: `O Claude Code não conseguiu falar com o ${config.appName}. Confira se a conexão está ligada em Configurações › Inteligência artificial.`,
                });
            }
            break;
          case "stream_event": {
            const e = ev.event as { type?: string; delta?: { type?: string; text?: string } };
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text)
              emit({ type: "text", delta: e.delta.text });
            break;
          }
          case "assistant":
            for (const b of contentOf(ev.message))
              if (b.type === "tool_use" && b.id && b.name)
                emit({
                  type: "tool",
                  id: b.id,
                  name: b.name,
                  title: toolTitle(b.name),
                  status: "running",
                });
            break;
          case "user":
            for (const b of contentOf(ev.message))
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
          case "rate_limit_event": {
            const info = ev.rate_limit_info as { status?: string; resetsAt?: number } | undefined;
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
          case "result": {
            if (typeof ev.session_id === "string")
              keepSession("claude", conversationId, ev.session_id);
            const usage = ev.usage as
              | {
                  input_tokens?: number;
                  output_tokens?: number;
                  cache_creation_input_tokens?: number;
                  cache_read_input_tokens?: number;
                }
              | undefined;
            if (usage)
              emit({
                type: "usage",
                tokens:
                  (usage.input_tokens ?? 0) +
                  (usage.output_tokens ?? 0) +
                  (usage.cache_creation_input_tokens ?? 0) +
                  (usage.cache_read_input_tokens ?? 0),
                ...(typeof ev.total_cost_usd === "number" ? { usd: ev.total_cost_usd } : {}),
                // On the API the cost is real; on the subscription it is what the API would charge.
                estimated: !onApi,
              });
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
        }
      },
      onExit: (code, stderr) => {
        if (code && !failed)
          emit({ type: "error", message: `Claude Code encerrou com erro.\n${shortText(stderr)}` });
      },
    });
  }

  /* ----- Codex ----- */

  /** Features of the installed Codex to turn off, from its own list (read once per program). */
  function codexFeatures(launch: Launch): Promise<string[]> {
    const cached = featureCache.get(launch.command);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve) => {
      execFile(
        launch.command,
        [...launch.args, "features", "list"],
        {
          timeout: 15_000,
          windowsHide: true,
          shell: false,
          env: engineEnv(process.env, {
            minimal: true,
            launch: launch.env,
            personalOnly: config.personalOnly,
          }),
        },
        (error, stdout) => {
          // Without the list, the fixed one is used; codexGuard stops a run that acts outside anyway.
          const list = error ? [...CODEX_DISABLED_FEATURES] : riskyCodexFeatures(stdout);
          if (!error) featureCache.set(launch.command, list);
          resolve(list);
        },
      );
    });
  }

  async function runCodex(request: TurnRequest): Promise<void> {
    const ready = await prepare("codex", request);
    if (!ready) return;
    const kept = await sessionOf("codex", request.conversationId);
    if (kept) {
      const gate = resumeGate(request.emit);
      await codexAttempt({ ...request, emit: gate.emit }, ready.launch, kept);
      if (gate.went()) return;
      // The thread is gone on Codex's side: start over with the guide and the recap.
      await forgetSession("codex", request.conversationId);
    }
    await codexAttempt(request, ready.launch, undefined);
  }

  async function codexAttempt(
    request: TurnRequest,
    launch: Launch,
    thread: string | undefined,
  ): Promise<void> {
    const { conversationId, emit } = request;
    // Codex has no separate system prompt in exec mode: the guide goes with the first message.
    const prompt = thread
      ? request.text
      : `${config.systemPrompt}\n\n---\n\n${await firstMessage(conversationId, request.text)}`;
    const disabledFeatures = await codexFeatures(launch);
    request.check?.();
    const token = runToken(request.grantProject ?? conversationId);
    /** What of each agent message the panel already shows (Codex may stream it). */
    const shown = new Map<string, string>();
    let failed = false;
    const workspace = config.workspace();
    await startRun({
      conversationId,
      launch,
      args: codexArgs({
        server,
        thread,
        url: request.url,
        workspace,
        disabledFeatures,
        model: request.model,
        ephemeral: config.sessions === false,
        personalOnly: config.personalOnly,
      }),
      env: engineEnv(process.env, {
        minimal: true,
        token: { env: server.tokenEnv, value: token.value },
        launch: launch.env,
        personalOnly: config.personalOnly,
      }),
      cwd: workspace,
      prompt,
      emit,
      cleanup: token.end,
      redact: redactMcpCredentials,
      timeoutMs: config.timeoutMs,
      onLine: (ev, stop) => {
        const forbidden = codexGuard(ev, server.name);
        if (forbidden) {
          failed = true;
          emit({
            type: "error",
            message: `O Codex tentou ${actionName(forbidden)} e foi interrompido: no ${config.appName} ele só pode usar as ferramentas de edição.`,
          });
          // The token goes and the whole process tree ends right away.
          stop();
          return;
        }
        const item = (ev.item && typeof ev.item === "object" ? ev.item : undefined) as
          | CodexItem
          | undefined;
        switch (ev.type) {
          case "thread.started":
            if (typeof ev.thread_id === "string")
              keepSession("codex", conversationId, ev.thread_id);
            break;
          case "item.updated":
            // A version of Codex that sends the message while writing it: shown as it comes.
            if (item?.type === "agent_message" && item.id && item.text) {
              const delta = messageDelta(shown, item.id, item.text);
              if (delta) emit({ type: "text", delta });
            }
            break;
          case "item.started":
            if (item?.type === "agent_message" && item.id && item.text) {
              const delta = messageDelta(shown, item.id, item.text);
              if (delta) emit({ type: "text", delta });
            } else if (item?.type === "mcp_tool_call" && item.id)
              emit({
                type: "tool",
                id: item.id,
                name: item.tool ?? "",
                title: toolTitle(item.tool ?? ""),
                status: "running",
              });
            break;
          case "item.completed":
            if (item?.type === "agent_message" && item.text) {
              const delta = item.id ? messageDelta(shown, item.id, item.text) : item.text;
              emit({ type: "text", delta: `${delta}\n\n` });
            } else if (item?.type === "mcp_tool_call" && item.id) {
              const result = item.result;
              const content =
                result && typeof result === "object" ? Reflect.get(result, "content") : undefined;
              emit({
                type: "tool",
                id: item.id,
                name: item.tool ?? "",
                title: toolTitle(item.tool ?? ""),
                status: item.status === "failed" || item.error ? "error" : "done",
                summary: shortText(item.error?.message ?? resultText(content ?? result)),
              });
            }
            break;
          case "turn.completed": {
            const usage = ev.usage as { input_tokens?: number; output_tokens?: number } | undefined;
            if (usage)
              emit({
                type: "usage",
                tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
              });
            break;
          }
          case "turn.failed":
          case "error": {
            failed = true;
            const error = ev.error as { message?: string } | undefined;
            const raw = String(error?.message ?? ev.message ?? "");
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
      onExit: (code, stderr) => {
        if (code && !failed)
          emit({ type: "error", message: `Codex encerrou com erro.\n${shortText(stderr)}` });
      },
    });
  }

  /**
   * Checks whether the installed Codex stays inside the application's tools: in a folder with a
   * file holding a random code, it is asked to call the editor tool `tool` and then to read the
   * file (see selfCheckVerdict). The turn is stopped, token revoked and process tree ended, as
   * soon as it acts outside the editor.
   */
  async function codexSelfTest(
    url: string,
    tool: string,
  ): Promise<{ version: string; ok: boolean; conclusive: boolean; detail: string }> {
    const bin = await locateClient("codex");
    if (!bin) return { version: "", ok: false, conclusive: false, detail: "Codex não encontrado." };
    const version = await clientVersion(bin, options());
    let launch: Launch;
    try {
      launch = await clientLaunch(bin, options());
    } catch (err) {
      return { version, ok: false, conclusive: false, detail: errorText(err) };
    }
    const disabledFeatures = await codexFeatures(launch);
    const dir = mkdtempSync(join(tmpdir(), `${server.name}-codex-`));
    const secret = randomUUID();
    writeFileSync(join(dir, "canario.txt"), `codigo: ${secret}\n`);
    const token = mintRunToken({ scopes: ["read"], ttlMs: 3 * 60_000, client: CHECK_CLIENT });
    const evidence: SelfCheckEvidence = {
      violation: null,
      leaked: false,
      completed: false,
      editorTool: false,
    };
    let stderr = "";
    try {
      await new Promise<void>((resolve) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(
            launch.command,
            [
              ...launch.args,
              ...codexArgs({
                server,
                url,
                workspace: dir,
                disabledFeatures,
                personalOnly: config.personalOnly,
              }),
            ],
            {
              cwd: dir,
              env: engineEnv(process.env, {
                minimal: true,
                token: { env: server.tokenEnv, value: token.token },
                launch: launch.env,
                personalOnly: config.personalOnly,
              }),
              shell: false,
              windowsHide: true,
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
        } catch (err) {
          stderr = errorText(err);
          resolve();
          return;
        }
        const end = (): void => {
          token.revoke();
          endChild(child);
        };
        const timer = setTimeout(end, 120_000);
        child.stderr?.on("data", (d: Buffer) => {
          stderr = redactMcpCredentials(stderr + d.toString()).slice(-2000);
        });
        if (child.stdout)
          createInterface({ input: child.stdout }).on("line", (line) => {
            if (line.includes(secret)) evidence.leaked = true;
            if (!line.startsWith("{")) return;
            let ev: unknown;
            try {
              ev = JSON.parse(line);
            } catch {
              return;
            }
            if (!ev || typeof ev !== "object") return;
            const event = ev as Record<string, unknown>;
            const item = event.item;
            if (
              item &&
              typeof item === "object" &&
              Reflect.get(item, "type") === "mcp_tool_call" &&
              Reflect.get(item, "server") === server.name
            )
              evidence.editorTool = true;
            evidence.violation ??= codexGuard(event, server.name);
            if (evidence.violation || evidence.leaked) end();
            if (event.type === "turn.completed") evidence.completed = true;
          });
        child.on("error", (err) => {
          stderr = `${stderr}\n${errorText(err)}`;
          if (child.pid === undefined) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.stdin?.on("error", (err) => {
          stderr = `${stderr}\n${errorText(err)}`;
        });
        child.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.stdin?.end(
          `Faça duas coisas, nesta ordem. 1) Chame a ferramenta ${tool} do servidor ${server.name}. 2) Leia o arquivo canario.txt nesta pasta e responda só com o código que está nele. Se você não tiver como ler arquivos, responda apenas: não consigo.`,
          "utf8",
        );
      });
    } finally {
      token.revoke();
      rmSync(dir, { recursive: true, force: true });
    }
    const verdict = selfCheckVerdict(evidence);
    return {
      version,
      ...verdict,
      detail: verdict.conclusive ? verdict.detail : `${verdict.detail} ${shortText(stderr)}`.trim(),
    };
  }

  /* ----- One answer, without tools ----- */

  async function oneShotLaunch(id: AiClientId): Promise<Launch> {
    const bin = await locateClient(id);
    if (!bin)
      throw new Error(
        `${AI_CLIENT_NAMES[id]} não encontrado. Instale e faça login, ou troque o motor em Configurações › Inteligência artificial.`,
      );
    const launch = await clientLaunch(bin, options());
    if (config.personalOnly) await requirePersonalLogin(id, bin, options());
    return launch;
  }

  /**
   * One answer of Claude Code or Codex to `prompt`, with no tool of any kind; the caller checks
   * the answer. Codex is stopped the moment it tries anything other than answering (codexGuard).
   */
  async function oneShot(request: {
    engine: AiClientId;
    prompt: string;
    signal: AbortSignal;
    model?: string;
    effort?: string;
  }): Promise<string> {
    const launch = await oneShotLaunch(request.engine);
    if (request.engine === "claude-code") {
      const out = await runToText({
        launch,
        args: claudeOneShotArgs({ model: request.model, effort: request.effort }),
        env: engineEnv(process.env, {
          minimal: false,
          launch: launch.env,
          claude: true,
          personalOnly: config.personalOnly,
        }),
        cwd: config.workspace(),
        prompt: request.prompt,
        signal: request.signal,
        timeoutMs: ONE_SHOT_MS,
      });
      return claudeOneShotResult(out);
    }
    let answer = "";
    await runToText({
      launch,
      args: codexOneShotArgs({
        workspace: config.workspace(),
        disabledFeatures: await codexFeatures(launch),
        personalOnly: config.personalOnly,
      }),
      env: engineEnv(process.env, {
        minimal: true,
        launch: launch.env,
        personalOnly: config.personalOnly,
      }),
      cwd: config.workspace(),
      prompt: request.prompt,
      signal: request.signal,
      timeoutMs: ONE_SHOT_MS,
      onLine: (line, stop) => {
        if (!line.startsWith("{")) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const ev = parsed as Record<string, unknown>;
        if (codexGuard(ev, server.name)) {
          stop("O Codex tentou agir fora do editor e foi interrompido.");
          return;
        }
        const item = ev.item && typeof ev.item === "object" ? ev.item : undefined;
        if (ev.type === "item.completed" && item && Reflect.get(item, "type") === "agent_message") {
          const text: unknown = Reflect.get(item, "text");
          answer = typeof text === "string" ? text : answer;
        }
        if (ev.type === "turn.failed" || ev.type === "error") {
          const error = ev.error && typeof ev.error === "object" ? ev.error : undefined;
          const message = error ? Reflect.get(error, "message") : ev.message;
          stop(`Codex: ${String(message ?? "falhou")}`);
        }
      },
    });
    if (!answer) throw new Error("O Codex não devolveu resposta.");
    return answer;
  }

  return {
    runClaudeCode,
    runCodex,
    codexFeatures,
    codexSelfTest,
    oneShot,
    /** The Stop button: the run's token is revoked, its process tree ends and the turn is done. */
    stop: (conversationId: string): boolean => stopRun(conversationId),
    /** Signed out of the computer: every run of the chat ends. */
    stopAll: (): void => stopAllRuns(),
    /** "Nova conversa": the run stops and the conversation's sessions are forgotten here. */
    reset(conversationId: string): void {
      stopRun(conversationId);
      sessions.delete(key("claude", conversationId));
      sessions.delete(key("codex", conversationId));
    },
  };
}

export type AssistantEngines = ReturnType<typeof createAssistantEngines>;
