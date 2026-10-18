import type Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS, isAiToolName } from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import type { ToolOutcome } from "./mcpGuard.ts";

/** What a tool call the person stopped answers: it did not run. */
export const STOPPED = "Interrompido pela pessoa.";

type Result = Anthropic.Beta.BetaToolResultBlockParam;

export interface ToolRoundDeps {
  /** Aborted by Parar: the calls still to come do not run. */
  signal: AbortSignal;
  emit: (e: AssistantEvent) => void;
  /** Runs a checked call; `allowed` is asked again right before it reaches the editor. */
  call: (name: string, input: unknown, allowed: () => boolean) => Promise<ToolOutcome>;
}

const short = (text: string): string => {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
};

/**
 * A tool's answer for the API: its text, then the pictures it carries (get_frame). It goes as it
 * is and is never changed later: old results are cleared on the server (shared/aiModels.ts).
 */
function resultContent(r: ToolOutcome): Result["content"] {
  if (!r.images?.length) return r.text;
  return [
    { type: "text", text: r.text },
    ...r.images.map(
      (image): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: image.mime, data: image.data },
      }),
    ),
  ];
}

/**
 * Runs the tool calls of one answer of the in-app assistant, in order, and returns a result for
 * each, paired with its call. After Parar, the calls still to come answer as stopped and never
 * run, and one still waiting in the editor's queue is refused there too.
 */
export async function runToolRound(
  uses: readonly Anthropic.Beta.BetaToolUseBlock[],
  deps: ToolRoundDeps,
): Promise<Result[]> {
  const { signal, emit } = deps;
  const results: Result[] = [];
  for (const use of uses) {
    const known = isAiToolName(use.name) ? use.name : null;
    const title = known ? AI_TOOLS[known].title : use.name;
    if (signal.aborted) {
      results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: STOPPED });
      emit({ type: "tool", id: use.id, name: use.name, title, status: "error", summary: STOPPED });
      continue;
    }
    emit({ type: "tool", id: use.id, name: use.name, title, status: "running" });
    // Streamed inputs are not validated by the API, so check them before touching the project.
    const parsed = known ? AI_TOOLS[known].input.safeParse(use.input) : undefined;
    if (!parsed?.success) {
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        is_error: true,
        content: JSON.stringify({ INVALID_JSON: JSON.stringify(use.input) }),
      });
      emit({
        type: "tool",
        id: use.id,
        name: use.name,
        title,
        status: "error",
        summary: "parâmetros inválidos",
      });
      continue;
    }
    const r = await deps.call(use.name, parsed.data, () => !signal.aborted);
    results.push({
      type: "tool_result",
      tool_use_id: use.id,
      content: resultContent(r),
      is_error: !r.ok,
    });
    emit({
      type: "tool",
      id: use.id,
      name: use.name,
      title,
      status: r.ok ? "done" : "error",
      summary: short(r.text),
    });
  }
  return results;
}
