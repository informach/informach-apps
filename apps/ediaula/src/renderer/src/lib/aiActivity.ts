import { create } from "zustand";

/**
 * The AI tool calls the editor is running now (from the chat inside EdiAula or from an app
 * connected over MCP): what each is doing and how far, and how to stop one. The assistant panel
 * shows them on its tool lines (state/assistant.ts) and its "Cancelar" button cancels the call.
 */

export interface AiCall {
  id: string;
  /** The tool's name (AI_TOOLS). */
  name: string;
  title: string;
  /** The chat it belongs to (the project id), for calls of the chat inside EdiAula. */
  conversation?: string;
  startedAt: number;
  step?: string;
  ratio?: number;
  cancel: () => void;
}

export const useAiCalls = create<{ calls: Record<string, AiCall> }>(() => ({ calls: {} }));

export function startAiCall(call: Omit<AiCall, "startedAt">): void {
  useAiCalls.setState((s) => ({
    calls: { ...s.calls, [call.id]: { ...call, startedAt: Date.now() } },
  }));
}

export function endAiCall(id: string): void {
  useAiCalls.setState((s) => {
    const calls = { ...s.calls };
    delete calls[id];
    return { calls };
  });
}

export function updateAiCall(id: string, step: string, ratio?: number): void {
  useAiCalls.setState((s) => {
    const call = s.calls[id];
    if (!call) return s;
    return {
      calls: {
        ...s.calls,
        [id]: { ...call, step, ...(ratio !== undefined ? { ratio } : { ratio: undefined }) },
      },
    };
  });
}

/** The call of `conversation` running `name` (MCP names come prefixed: mcp__ediaula__get_frame). */
export function runningCall(
  calls: Record<string, AiCall>,
  conversation: string,
  name: string | undefined,
): AiCall | undefined {
  const bare = (name ?? "").replace(/^mcp__ediaula__/, "").replace(/^ediaula[./]/, "");
  return Object.values(calls)
    .filter((c) => c.conversation === conversation && (!bare || c.name === bare))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

export function cancelAiCall(id: string): void {
  useAiCalls.getState().calls[id]?.cancel();
}
