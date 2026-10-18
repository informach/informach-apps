import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "../shared/aiModels.ts";
import type { AssistantEngine } from "../shared/types.ts";
import { clientLaunch, decryptKey, locateClient, readStored } from "./aiSettings.ts";
import { apiOneShot } from "./apiOneShot.ts";
import {
  claudeOneShotArgs,
  claudeOneShotResult,
  codexGuard,
  codexOneShotArgs,
  engineEnv,
  type Launch,
} from "./engineArgs.ts";
import { codexFeatures, workspace } from "./engines.ts";
import { killTree } from "./processTree.ts";

/**
 * runOneShot: one prompt to the engine the person set up (their own Anthropic key, their Claude
 * Code or their Codex) and its whole answer as text, with no tool of any kind. The caller checks
 * the answer (shared/captionTranslate.ts, shared/platformPackage.ts). Nothing here retries.
 */

/** A one-shot never takes longer than this. */
const ONE_SHOT_MS = 10 * 60_000;

const running = new Map<string, AbortController>();

/** Stops a one-shot in progress (job:cancel); true when one was running. */
export function cancelOneShot(jobId: string): boolean {
  const run = running.get(jobId);
  run?.abort(new Error("Cancelado"));
  return !!run;
}

function spawnText(
  launch: Launch,
  args: string[],
  env: Record<string, string>,
  prompt: string,
  signal: AbortSignal,
  onLine?: (line: string, stop: (reason: string) => void) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, [...launch.args, ...args], {
      cwd: workspace(),
      env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let refused: string | null = null;
    const end = (): void => {
      void killTree(child.pid).then((ended) => {
        if (!ended) child.kill();
      });
    };
    const stop = (reason: string): void => {
      refused ??= reason;
      end();
    };
    const timer = setTimeout(() => stop("A IA demorou demais para responder."), ONE_SHOT_MS);
    const abort = (): void => stop("Cancelado");
    signal.addEventListener("abort", abort, { once: true });
    if (child.stdout)
      createInterface({ input: child.stdout }).on("line", (line) => {
        out += `${line}\n`;
        onLine?.(line, stop);
      });
    child.stderr?.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error(`Não foi possível iniciar: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (refused) reject(new Error(refused));
      else if (code) reject(new Error(err.trim().split(/\r?\n/).at(-1) || `encerrou com ${code}`));
      else resolve(out);
    });
    child.stdin?.on("error", (e) => {
      err = `${err}\n${e.message}`;
    });
    child.stdin?.end(prompt, "utf8");
  });
}

async function launchOf(id: "claude-code" | "codex"): Promise<Launch> {
  const bin = await locateClient(id);
  if (!bin)
    throw new Error(
      id === "claude-code"
        ? "Claude Code não encontrado. Instale e faça login, ou troque o motor em Configurações › Inteligência artificial."
        : "Codex não encontrado. Instale e faça login, ou troque o motor em Configurações › Inteligência artificial.",
    );
  return clientLaunch(bin);
}

/**
 * One answer of `engine` to `prompt`. Claude Code and Codex run without any tool; Codex is
 * stopped the moment it tries anything other than answering (codexGuard). `allowCodex` says
 * whether the installed Codex passed the editor's check (or the person accepted it).
 */
export async function runOneShot(
  jobId: string,
  engine: AssistantEngine,
  prompt: string,
  allowCodex: () => Promise<boolean>,
): Promise<string> {
  const cancel = new AbortController();
  running.get(jobId)?.abort();
  running.set(jobId, cancel);
  try {
    const stored = await readStored();
    if (engine === "api") {
      const apiKey = decryptKey(stored.apiKeyEnc);
      if (!apiKey)
        throw new Error(
          "Configure a chave da API da Anthropic em Configurações › Inteligência artificial.",
        );
      const { model } = resolveModel(stored.model);
      return await apiOneShot(new Anthropic({ apiKey }), model, prompt, cancel.signal);
    }
    if (engine === "claude-code") {
      const launch = await launchOf("claude-code");
      const out = await spawnText(
        launch,
        claudeOneShotArgs({ model: stored.claudeModel, effort: "low" }),
        engineEnv(process.env, { minimal: false, launch: launch.env, claude: true }),
        prompt,
        cancel.signal,
      );
      return claudeOneShotResult(out);
    }
    if (!(await allowCodex()))
      throw new Error(
        "Esta versão do Codex ainda não foi conferida. Use o Assistente com o Codex uma vez, ou troque o motor.",
      );
    const launch = await launchOf("codex");
    let answer = "";
    await spawnText(
      launch,
      codexOneShotArgs({ workspace: workspace(), disabledFeatures: await codexFeatures(launch) }),
      engineEnv(process.env, { minimal: true, launch: launch.env }),
      prompt,
      cancel.signal,
      (line, stop) => {
        if (!line.startsWith("{")) return;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        if (codexGuard(ev)) {
          stop("O Codex tentou agir fora do editor e foi interrompido.");
          return;
        }
        const item = ev.item as { type?: unknown; text?: unknown } | undefined;
        if (ev.type === "item.completed" && item?.type === "agent_message")
          answer = typeof item.text === "string" ? item.text : answer;
        if (ev.type === "turn.failed" || ev.type === "error")
          stop(
            `Codex: ${String((ev.error as { message?: unknown })?.message ?? ev.message ?? "falhou")}`,
          );
      },
    );
    if (!answer) throw new Error("O Codex não devolveu resposta.");
    return answer;
  } finally {
    if (running.get(jobId) === cancel) running.delete(jobId);
  }
}
