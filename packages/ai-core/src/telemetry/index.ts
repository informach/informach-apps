import type { AgentName, AgentRunStatus, AppName, TokenUsage } from "../types";

export type AgentRunLogger = {
  start: () => void;
  finish: (status: AgentRunStatus, usage?: TokenUsage) => void;
};

export function createAgentRunLogger(
  _app: AppName,
  _agent: AgentName,
  _runId: string,
): AgentRunLogger {
  return {
    start: () => {},
    finish: () => {},
  };
}

export function calculateTokenUsage(promptTokens: number, completionTokens: number): TokenUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export async function traceAgentRun<T>(
  _app: AppName,
  _agent: AgentName,
  _runId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}
