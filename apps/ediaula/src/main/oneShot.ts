import Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "../shared/aiModels.ts";
import type { AssistantEngine } from "../shared/types.ts";
import { decryptKey, readStored } from "./aiSettings.ts";
import { apiOneShot } from "./apiOneShot.ts";
import { engineOneShot } from "./engines.ts";

/**
 * runOneShot: one prompt to the engine the person set up (their own Anthropic key, their Claude
 * Code or their Codex) and its whole answer as text, with no tool of any kind. The caller checks
 * the answer (shared/captionTranslate.ts, shared/platformPackage.ts). Nothing here retries.
 */

const running = new Map<string, AbortController>();

/** Stops a one-shot in progress (job:cancel); true when one was running. */
export function cancelOneShot(jobId: string): boolean {
  const run = running.get(jobId);
  run?.abort(new Error("Cancelado"));
  return !!run;
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
    if (engine === "claude-code")
      return await engineOneShot({
        engine: "claude-code",
        prompt,
        signal: cancel.signal,
        model: stored.claudeModel,
        effort: "low",
      });
    if (!(await allowCodex()))
      throw new Error(
        "Esta versão do Codex ainda não foi conferida. Use o Assistente com o Codex uma vez, ou troque o motor.",
      );
    return await engineOneShot({ engine: "codex", prompt, signal: cancel.signal });
  } finally {
    if (running.get(jobId) === cancel) running.delete(jobId);
  }
}
