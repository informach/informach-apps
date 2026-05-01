export type AppName = "agenda-da-turma" | "cozya";

export type AgentName = string;

export type AgentRunStatus = "pending" | "running" | "succeeded" | "failed" | "canceled";

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiRuntimeConfig = {
  app: AppName;
  agent: AgentName;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type ToolContext = {
  app: AppName;
  agent: AgentName;
  runId: string;
  userId?: string;
};
