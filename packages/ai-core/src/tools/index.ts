import type { AgentName, AppName, ToolContext } from "../types";

export function createToolContext(input: {
  app: AppName;
  agent: AgentName;
  runId: string;
  userId?: string;
}): ToolContext {
  return {
    app: input.app,
    agent: input.agent,
    runId: input.runId,
    userId: input.userId,
  };
}
